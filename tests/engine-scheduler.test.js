import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EngineScheduler } from "../src/engine-scheduler.js";

const stateDirs = [];

async function createScheduler(config = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "navigator-engine-scheduler-"));
  stateDirs.push(dir);
  return new EngineScheduler({
    engines: ["first", "second", "third"],
    statePath: path.join(dir, "profiles.json"),
    config
  });
}

afterEach(async () => {
  await Promise.all(stateDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("EngineScheduler", () => {
  it("keeps unmeasured providers ahead of routes with known latency", async () => {
    const scheduler = await createScheduler();
    expect(scheduler.select(["first", "second", "third"], 100).ordered).toEqual(["first", "second", "third"]);
    expect(scheduler.select(["first", "second", "third"], 101).ordered).toEqual(["first", "second", "third"]);
    expect(scheduler.select(["first", "second", "third"], 102).ordered).toEqual(["first", "second", "third"]);
  });

  it("doubles the failure cooldown from five minutes and removes the route from rotation", async () => {
    const scheduler = await createScheduler({ searchQueueMinIntervalMs: 300000, searchQueueMaxIntervalMs: 3600000 });
    scheduler.recordFailure("first", 1000);
    let profile = scheduler.getProfiles(1000).find((entry) => entry.engine === "first");
    expect(profile).toMatchObject({ errors: 1, consecutiveFailures: 1, cooldownMs: 300000, state: "cooling_down" });

    scheduler.recordFailure("first", 301000);
    profile = scheduler.getProfiles(301000).find((entry) => entry.engine === "first");
    expect(profile).toMatchObject({ errors: 2, consecutiveFailures: 2, cooldownMs: 600000, remainingMs: 600000 });
    expect(scheduler.select(["first", "second"], 301000).ordered).toEqual(["second"]);
  });

  it("returns a recovered engine to the equal round-robin pool", async () => {
    const scheduler = await createScheduler();
    scheduler.recordFailure("first", 0);
    scheduler.recordSuccess("first", 0, 300000);
    const profile = scheduler.getProfiles(300000).find((entry) => entry.engine === "first");
    expect(profile).toMatchObject({ successes: 1, errors: 1, consecutiveFailures: 0, cooldownMs: 300000, state: "healthy" });
    expect(scheduler.select(["first", "second"], 300000).ordered).toEqual(["first", "second"]);
  });

  it("persists failure scores and cooldowns across restarts", async () => {
    const scheduler = await createScheduler();
    scheduler.recordFailure("second", 1000);
    const reloaded = new EngineScheduler({
      engines: ["first", "second", "third"],
      statePath: scheduler.statePath
    });
    const profile = reloaded.getProfiles(1000).find((entry) => entry.engine === "second");
    expect(profile).toMatchObject({ errors: 1, consecutiveFailures: 1, cooldownMs: 300000, remainingMs: 300000 });
  });

  it("resets a profile after an infrastructure failure is corrected", async () => {
    const scheduler = await createScheduler();
    scheduler.recordFailure("first", 1000);
    expect(scheduler.reset("first")).toBe(true);
    expect(scheduler.getProfiles(1000).find((entry) => entry.engine === "first")).toMatchObject({
      errors: 0,
      consecutiveFailures: 0,
      nextEligibleAt: 0,
      state: "unknown"
    });
  });

  it("prefers the fastest healthy provider while pacing immediate repeats", async () => {
    const scheduler = await createScheduler({ searchQueueReadyIntervalMs: 10000 });
    scheduler.recordSuccess("first", 400, 1);
    scheduler.recordSuccess("second", 100, 1);
    scheduler.recordSuccess("third", 250, 1);
    expect(scheduler.select(["first", "second", "third"], 20000).ordered).toEqual(["second", "third", "first"]);

    scheduler.markSelected("second", 20000);
    expect(scheduler.select(["first", "second", "third"], 20001).ordered).toEqual(["third", "first", "second"]);
  });

  it("periodically explores a non-leading healthy provider", async () => {
    const scheduler = await createScheduler({ searchQueueExplorationEvery: 2 });
    scheduler.recordSuccess("first", 100, 1);
    scheduler.recordSuccess("second", 300, 1);
    expect(scheduler.select(["first", "second"], 20000).ordered[0]).toBe("first");
    expect(scheduler.select(["first", "second"], 40000).ordered[0]).toBe("second");
  });
});
