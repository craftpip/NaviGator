import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULTS = {
  minIntervalMs: 5 * 60 * 1000,
  maxIntervalMs: 60 * 60 * 1000,
  escalationFactor: 2,
  readyIntervalMs: 10 * 1000,
  explorationEvery: 5,
  latencySamples: 20
};

function freshProfile(engine) {
  return {
    engine,
    successes: 0,
    errors: 0,
    consecutiveFailures: 0,
    cooldownMs: DEFAULTS.minIntervalMs,
    nextEligibleAt: 0,
    lastSelectedAt: 0,
    lastSuccessAt: 0,
    lastFailureAt: 0,
    latencySamples: []
  };
}

export class EngineScheduler {
  constructor({ engines, statePath, config = {} }) {
    this.engines = [...engines];
    this.statePath = statePath;
    this.profiles = new Map();
    this.cursor = 0;
    this.configure(config);
    this.load();
  }

  configure(config = {}) {
    this.minIntervalMs = Math.max(1, Number(config.searchQueueMinIntervalMs) || DEFAULTS.minIntervalMs);
    this.maxIntervalMs = Math.max(this.minIntervalMs, Number(config.searchQueueMaxIntervalMs) || DEFAULTS.maxIntervalMs);
    this.escalationFactor = Math.max(1, Number(config.searchQueueEscalationFactor) || DEFAULTS.escalationFactor);
    this.readyIntervalMs = Math.max(0, Number(config.searchQueueReadyIntervalMs) || DEFAULTS.readyIntervalMs);
    this.explorationEvery = Math.max(2, Math.floor(Number(config.searchQueueExplorationEvery) || DEFAULTS.explorationEvery));
    this.latencySampleLimit = Math.max(3, Math.floor(Number(config.searchQueueLatencySamples) || DEFAULTS.latencySamples));
  }

  load() {
    try {
      const saved = JSON.parse(readFileSync(this.statePath, "utf8"));
      this.cursor = Math.max(0, Number(saved?.cursor) || 0);
      for (const [engine, profile] of Object.entries(saved?.profiles || {})) {
        if (!this.engines.includes(engine) || !profile || typeof profile !== "object") continue;
        this.profiles.set(engine, {
          ...freshProfile(engine),
          ...profile,
          engine,
          latencySamples: Array.isArray(profile.latencySamples)
            ? profile.latencySamples.filter(Number.isFinite).slice(-this.latencySampleLimit)
            : []
        });
      }
    } catch {
      // No persisted queue state on the first start.
    }
  }

  persist() {
    try {
      mkdirSync(path.dirname(this.statePath), { recursive: true });
      writeFileSync(this.statePath, JSON.stringify({ cursor: this.cursor, profiles: Object.fromEntries(this.profiles) }, null, 2));
    } catch (error) {
      console.error(`⚠️  Could not persist search engine queue state: ${String(error?.message || error)}`);
    }
  }

  profile(engine) {
    if (!this.profiles.has(engine)) this.profiles.set(engine, freshProfile(engine));
    return this.profiles.get(engine);
  }

  isEligible(engine, now = Date.now()) {
    return now >= this.profile(engine).nextEligibleAt;
  }

  select(engines, now = Date.now()) {
    const configured = engines.filter((engine) => this.engines.includes(engine));
    if (!configured.length) return { ordered: [], skipped: [] };

    const ready = [];
    const paced = [];
    const probes = [];
    const skipped = [];
    for (const engine of configured) {
      const profile = this.profile(engine);
      if (now < profile.nextEligibleAt) {
        skipped.push({ engine, remainingMs: profile.nextEligibleAt - now, reason: "cooldown" });
      } else if (profile.consecutiveFailures > 0) {
        probes.push(engine);
      } else if (profile.lastSelectedAt && now < profile.lastSelectedAt + this.readyIntervalMs) {
        paced.push(engine);
      } else {
        ready.push(engine);
      }
    }

    const rankByLatency = (items) => [...items].sort((a, b) => {
      const aLatency = this.medianLatency(this.profile(a));
      const bLatency = this.medianLatency(this.profile(b));
      if (!aLatency && !bLatency) return a.localeCompare(b);
      if (!aLatency) return -1; // Give unmeasured providers an initial sample.
      if (!bLatency) return 1;
      return aLatency - bLatency;
    });
    const rankedReady = rankByLatency(ready);
    const rankedPaced = rankByLatency(paced);
    // Every fifth dispatch samples a non-leading ready provider to detect recovery or a faster route.
    if (rankedReady.length > 1 && this.cursor % this.explorationEvery === this.explorationEvery - 1) {
      rankedReady.push(rankedReady.shift());
    }
    this.cursor += 1;
    this.persist();
    // A paced route is only used when every unpaced route has failed or is unavailable.
    return { ordered: [...rankedReady, ...probes, ...rankedPaced], skipped };
  }

  recordSuccess(engine, durationMs = 0, now = Date.now()) {
    const profile = this.profile(engine);
    profile.successes += 1;
    // Recovery is deliberate: repeated failures need repeated successful probes.
    profile.consecutiveFailures = Math.max(0, profile.consecutiveFailures - 1);
    profile.cooldownMs = Math.max(this.minIntervalMs, Math.floor(profile.cooldownMs / this.escalationFactor));
    profile.nextEligibleAt = 0;
    profile.lastSuccessAt = now;
    if (Number.isFinite(durationMs) && durationMs > 0) {
      profile.latencySamples.push(Math.round(durationMs));
      if (profile.latencySamples.length > this.latencySampleLimit) {
        profile.latencySamples.splice(0, profile.latencySamples.length - this.latencySampleLimit);
      }
    }
    this.persist();
  }

  recordFailure(engine, now = Date.now()) {
    const profile = this.profile(engine);
    profile.errors += 1;
    profile.consecutiveFailures += 1;
    profile.cooldownMs = Math.min(
      this.maxIntervalMs,
      this.minIntervalMs * (this.escalationFactor ** (profile.consecutiveFailures - 1))
    );
    profile.nextEligibleAt = now + profile.cooldownMs;
    profile.lastFailureAt = now;
    this.persist();
  }

  markSelected(engine, now = Date.now()) {
    this.profile(engine).lastSelectedAt = now;
    this.persist();
  }

  reset(engine) {
    if (!this.engines.includes(engine)) return false;
    this.profiles.set(engine, freshProfile(engine));
    this.persist();
    return true;
  }

  medianLatency(profile) {
    const values = [...profile.latencySamples].sort((a, b) => a - b);
    if (!values.length) return 0;
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : Math.round((values[middle - 1] + values[middle]) / 2);
  }

  getProfiles(now = Date.now()) {
    return this.engines.map((engine) => {
      const profile = this.profile(engine);
      return {
        ...profile,
        successScore: profile.successes,
        errorScore: profile.errors,
        medianLatencyMs: this.medianLatency(profile),
        dispatchGapMs: this.readyIntervalMs,
        state: now < profile.nextEligibleAt ? "cooling_down" : profile.consecutiveFailures > 0 ? "probe" : profile.successes > 0 ? "healthy" : "unknown",
        remainingMs: Math.max(0, profile.nextEligibleAt - now)
      };
    });
  }
}
