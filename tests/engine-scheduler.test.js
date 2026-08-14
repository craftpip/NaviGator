import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EngineScheduler } from "../src/engine-scheduler.js";

const stateDirs = [];

async function createScheduler(config = {}, random = () => 0) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "navigator-engine-scheduler-"));
  stateDirs.push(dir);
  return new EngineScheduler({
    engines: ["first", "second", "third"],
    statePath: path.join(dir, "profiles.json"),
    config: { searchQueueMinIntervalMs: 100, searchQueueMaxIntervalMs: 10_000, ...config },
    random
  });
}

afterEach(async () => {
  await Promise.all(stateDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("EngineScheduler", () => {
  it("scores successful, productive engines above failing engines", async () => {
    const scheduler = await createScheduler();
    scheduler.recordSuccess("first", 20, 1_000);
    scheduler.recordSuccess("first", 10, 1_200);
    scheduler.recordFailure("second", "captcha", 1_000);
    const profiles = scheduler.getProfiles(2_000);
    expect(profiles.find((profile) => profile.engine === "first").score)
      .toBeGreaterThan(profiles.find((profile) => profile.engine === "second").score);
  });

  it("learns a percentile failure gap and weights captcha backoff more heavily", async () => {
    const scheduler = await createScheduler({ searchQueueErrorGapSafety: 1.25 });
    scheduler.recordFailure("first", "timeout", 1_000);
    scheduler.recordFailure("first", "timeout", 5_000);
    scheduler.recordFailure("first", "captcha", 10_000);
    const profile = scheduler.getProfiles(10_000).find((entry) => entry.engine === "first");
    expect(profile.failureGapsMs).toEqual([4_000, 5_000]);
    expect(profile.errorTypes).toMatchObject({ timeout: 2, captcha: 1 });
    expect(profile.minIntervalMs).toBeGreaterThanOrEqual(9_375);
    expect(scheduler.isEligible("first", 10_000)).toBe(false);
  });

  it("decays learned backoff only after successful recovery and keeps its floor", async () => {
    const scheduler = await createScheduler({ searchQueueDecayPerSuccess: 0.5 });
    scheduler.recordFailure("first", "blocked", 1_000);
    const raised = scheduler.getProfiles(1_000).find((entry) => entry.engine === "first").minIntervalMs;
    scheduler.recordSuccess("first", 3, 2_000);
    scheduler.recordSuccess("first", 3, 3_000);
    const profile = scheduler.getProfiles(3_000).find((entry) => entry.engine === "first");
    expect(profile.minIntervalMs).toBeLessThan(raised);
    expect(profile.minIntervalMs).toBeGreaterThanOrEqual(100);
    expect(profile.successesInRow).toBe(2);
  });

  it("persists the learned interval and resets one engine to a neutral profile", async () => {
    const scheduler = await createScheduler();
    scheduler.recordFailure("second", "captcha", 1_000);
    const reloaded = new EngineScheduler({ engines: ["first", "second", "third"], statePath: scheduler.statePath, config: { searchQueueMinIntervalMs: 100 } });
    expect(reloaded.getProfiles(1_000).find((entry) => entry.engine === "second").minIntervalMs).toBeGreaterThan(100);
    expect(reloaded.reset("second")).toBe(true);
    expect(reloaded.getProfiles(1_000).find((entry) => entry.engine === "second")).toMatchObject({ attempts: 0, minIntervalMs: 100, state: "unknown" });
  });

  it("rotates primary attempts across healthy engines and keeps score-ranked fallback", async () => {
    const scheduler = await createScheduler();
    scheduler.recordSuccess("first", 20, 1_000);
    scheduler.recordSuccess("second", 1, 1_000);
    scheduler.markSelected("first", 1_000);
    scheduler.markSelected("second", 2_000);
    scheduler.markSelected("third", 3_000);
    const selected = scheduler.select(["first", "second", "third"], 20_000);
    expect(selected.ordered).toHaveLength(3);
    expect(new Set(selected.ordered).size).toBe(3);
    expect(selected.ordered[0]).toBe("first");
  });

  it("prefers the faster route when reliability and yield are equal", async () => {
    const scheduler = await createScheduler();
    scheduler.recordSuccess("first", 10, 1_000, 4_000);
    scheduler.recordSuccess("second", 10, 1_000, 400);
    const selected = scheduler.select(["first", "second"], 2_000);
    expect(selected.ordered[0]).toBe("second");
  });

  it("counts scheduler skips without treating them as failures", async () => {
    const scheduler = await createScheduler();
    scheduler.recordSkip("first");
    const profile = scheduler.getProfiles(1_000).find((entry) => entry.engine === "first");
    expect(profile).toMatchObject({ attempts: 0, fail: 0, skip: 1 });
  });

  it("keeps successful routes eligible while backing off failures", async () => {
    const scheduler = await createScheduler();
    scheduler.recordSuccess("first", 3, 1_000);
    scheduler.recordFailure("second", "captcha", 1_000);
    const profiles = scheduler.getProfiles(1_050);
    expect(profiles.find((entry) => entry.engine === "first")).toMatchObject({ state: "healthy" });
    expect(profiles.find((entry) => entry.engine === "second")).toMatchObject({ state: "cooling_down" });
    expect(scheduler.isEligible("first", 1_050)).toBe(true);
    expect(scheduler.select(["first", "second", "third"], 1_050).skipped).toEqual([
      expect.objectContaining({ engine: "second", reason: "failure backoff" })
    ]);
  });

  it("penalizes a recent failure more than an older failure", async () => {
    const scheduler = await createScheduler();
    scheduler.recordFailure("first", "timeout", 1_000);
    scheduler.recordFailure("second", "timeout", 1_000);
    scheduler.recordSuccess("first", 1, 2_000);
    scheduler.recordSuccess("second", 1, 2_000);
    scheduler.recordFailure("first", "timeout", 2_100);
    scheduler.recordFailure("second", "timeout", 10_000);
    const profiles = scheduler.getProfiles(10_000);
    expect(profiles.find((profile) => profile.engine === "first").score)
      .toBeGreaterThan(profiles.find((profile) => profile.engine === "second").score);
  });
});
