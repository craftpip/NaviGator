import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULTS = {
  minIntervalMs: 30_000,
  maxIntervalMs: 1_800_000,
  escalationFactor: 2,
  errorGapPercentile: 0.75,
  errorGapSafety: 1.25,
  decayPerSuccess: 0.75,
  wSuccess: 0.45,
  wResults: 0.15,
  wStability: 0.25,
  wRecency: 0.1,
  wRecovery: 0.05,
  wLatency: 0.2
};
const RECENT_OUTCOME_LIMIT = 100;
const FAILURE_GAP_LIMIT = 50;
const LATENCY_SAMPLE_LIMIT = 20;

function number(value, fallback, minimum = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function freshProfile(engine, minIntervalMs) {
  return {
    engine,
    attempts: 0,
    ok: 0,
    fail: 0,
    skip: 0,
    results: 0,
    lastCalledAt: 0,
    lastSelectedAt: 0,
    lastSuccessAt: 0,
    lastFailureAt: 0,
    minIntervalMs,
    failuresInRow: 0,
    successesInRow: 0,
    failureGapsMs: [],
    errorTypes: { captcha: 0, timeout: 0, blocked: 0, other: 0 },
    recentOutcomes: [],
    latencySamples: [],
    lastError: ""
  };
}

function errorCategory(error) {
  const text = String(error || "").toLowerCase();
  if (/captcha|unusual traffic|human verification/.test(text)) return "captcha";
  if (/block|bot|forbidden|denied/.test(text)) return "blocked";
  if (/timeout|timed out|etimedout/.test(text)) return "timeout";
  return "other";
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

export class EngineScheduler {
  constructor({ engines, statePath, config = {}, random = Math.random }) {
    this.engines = [...engines];
    this.statePath = statePath;
    this.profiles = new Map();
    this.random = random;
    this.configure(config);
    this.load();
  }

  configure(config = {}) {
    if (config.searchQueueProfilePath) {
      const configuredPath = path.resolve(config.searchQueueProfilePath);
      if (configuredPath !== this.statePath) {
        this.statePath = configuredPath;
        this.profiles.clear();
        this.load();
      }
    }
    this.minIntervalMs = number(config.searchQueueMinIntervalMs, DEFAULTS.minIntervalMs, 1);
    this.maxIntervalMs = Math.max(this.minIntervalMs, number(config.searchQueueMaxIntervalMs, DEFAULTS.maxIntervalMs, 1));
    this.escalationFactor = number(config.searchQueueEscalationFactor, DEFAULTS.escalationFactor, 1);
    this.errorGapPercentile = Math.min(1, number(config.searchQueueErrorGapPercentile, DEFAULTS.errorGapPercentile, 0));
    this.errorGapSafety = number(config.searchQueueErrorGapSafety, DEFAULTS.errorGapSafety, 1);
    this.decayPerSuccess = Math.min(1, number(config.searchQueueDecayPerSuccess, DEFAULTS.decayPerSuccess, 0));
    for (const key of ["Success", "Results", "Stability", "Recency", "Recovery"]) {
      this[`w${key}`] = number(config[`searchQueueW${key}`], DEFAULTS[`w${key}`], 0);
    }
    this.wLatency = number(config.searchQueueWLatency, DEFAULTS.wLatency, 0);
  }

  load() {
    try {
      const saved = JSON.parse(readFileSync(this.statePath, "utf8"));
      for (const [engine, profile] of Object.entries(saved?.profiles || {})) {
        if (!this.engines.includes(engine) || !profile || typeof profile !== "object") continue;
        this.profiles.set(engine, {
          ...freshProfile(engine, this.minIntervalMs),
          ...profile,
          engine,
          minIntervalMs: Math.max(this.minIntervalMs, number(profile.minIntervalMs, this.minIntervalMs, 1)),
          failureGapsMs: Array.isArray(profile.failureGapsMs) ? profile.failureGapsMs.filter(Number.isFinite).slice(-FAILURE_GAP_LIMIT) : [],
          recentOutcomes: Array.isArray(profile.recentOutcomes) ? profile.recentOutcomes.filter((item) => item && Number.isFinite(item.at)).slice(-RECENT_OUTCOME_LIMIT) : [],
          latencySamples: Array.isArray(profile.latencySamples) ? profile.latencySamples.filter(Number.isFinite).slice(-LATENCY_SAMPLE_LIMIT) : []
        });
      }
    } catch {
      // No persisted queue state on the first start.
    }
  }

  persist() {
    try {
      mkdirSync(path.dirname(this.statePath), { recursive: true });
      writeFileSync(this.statePath, JSON.stringify({ profiles: Object.fromEntries(this.profiles) }, null, 2));
    } catch (error) {
      console.error(`⚠️  Could not persist search engine queue state: ${String(error?.message || error)}`);
    }
  }

  profile(engine) {
    if (!this.profiles.has(engine)) this.profiles.set(engine, freshProfile(engine, this.minIntervalMs));
    return this.profiles.get(engine);
  }

  isEligible(engine, now = Date.now()) {
    const profile = this.profile(engine);
    return !profile.failuresInRow || now >= profile.lastCalledAt + profile.minIntervalMs;
  }

  scoreEngine(profile, now = Date.now()) {
    const attempts = profile.attempts || 0;
    const successRate = attempts ? profile.ok / attempts : 0.5;
    const resultsPerAttempt = attempts ? Math.min(1, profile.results / attempts / 10) : 0.5;
    const recent = profile.recentOutcomes.filter((item) => now - item.at <= 24 * 60 * 60 * 1000);
    const weightedRecent = recent.reduce((total, item) => {
      const age = now - item.at;
      const weight = age <= 5 * 60 * 1000 ? 4 : age <= 15 * 60 * 1000 ? 3 : age <= 60 * 60 * 1000 ? 2 : 1;
      total.total += weight;
      if (item.status === "fail") total.fail += weight;
      return total;
    }, { total: 0, fail: 0 });
    const recentFailureRate = weightedRecent.total ? weightedRecent.fail / weightedRecent.total : 0;
    const recencyPenalty = profile.lastFailureAt ? Math.exp(-(now - profile.lastFailureAt) / (5 * 60 * 1000)) : 0;
    const recoveryBonus = profile.lastSuccessAt > profile.lastFailureAt ? Math.min(1, profile.successesInRow / 3) : 0;
    const medianLatencyMs = this.medianLatency(profile);
    const latencyScore = medianLatencyMs ? 1 / (1 + medianLatencyMs / 1000) : 0.5;
    return this.wSuccess * successRate + this.wResults * resultsPerAttempt + this.wStability * (1 - recentFailureRate) - this.wRecency * recencyPenalty + this.wRecovery * recoveryBonus + this.wLatency * latencyScore;
  }

  select(engines, now = Date.now(), canUse = () => true) {
    const skipped = [];
    const eligible = [];
    for (const engine of engines.filter((item) => this.engines.includes(item))) {
      if (!canUse(engine)) {
        skipped.push({ engine, remainingMs: 0, reason: "route open" });
      } else if (!this.isEligible(engine, now)) {
        const profile = this.profile(engine);
        skipped.push({ engine, remainingMs: profile.lastCalledAt + profile.minIntervalMs - now, reason: "failure backoff" });
      } else {
        eligible.push(engine);
      }
    }
    const ranked = eligible.sort((a, b) => this.scoreEngine(this.profile(b), now) - this.scoreEngine(this.profile(a), now) || a.localeCompare(b));
    if (!ranked.length) return { ordered: [], skipped };
    const primary = [...ranked].sort((a, b) => {
      const aLastSelected = this.profile(a).lastSelectedAt || 0;
      const bLastSelected = this.profile(b).lastSelectedAt || 0;
      if (aLastSelected !== bLastSelected) return aLastSelected - bLastSelected;
      return this.scoreEngine(this.profile(b), now) - this.scoreEngine(this.profile(a), now) || a.localeCompare(b);
    })[0];
    return { ordered: [primary, ...ranked.filter((engine) => engine !== primary)], skipped };
  }

  markSelected(engine, now = Date.now()) {
    this.profile(engine).lastSelectedAt = now;
    this.persist();
  }

  recordSkip(engine) {
    this.profile(engine).skip += 1;
    this.persist();
  }

  recordSuccess(engine, resultCount = 0, now = Date.now(), durationMs = 0) {
    const profile = this.profile(engine);
    profile.lastCalledAt = now;
    profile.attempts += 1;
    profile.ok += 1;
    profile.results += Math.max(0, Number(resultCount) || 0);
    if (Number.isFinite(durationMs) && durationMs > 0) {
      profile.latencySamples.push(Math.round(durationMs));
      if (profile.latencySamples.length > LATENCY_SAMPLE_LIMIT) profile.latencySamples.splice(0, profile.latencySamples.length - LATENCY_SAMPLE_LIMIT);
    }
    profile.lastSuccessAt = now;
    profile.successesInRow += 1;
    profile.failuresInRow = 0;
    profile.minIntervalMs = Math.max(this.minIntervalMs, Math.floor(profile.minIntervalMs * this.decayPerSuccess));
    profile.recentOutcomes.push({ at: now, status: "ok" });
    if (profile.recentOutcomes.length > RECENT_OUTCOME_LIMIT) profile.recentOutcomes.splice(0, profile.recentOutcomes.length - RECENT_OUTCOME_LIMIT);
    profile.lastError = "";
    this.persist();
  }

  recordFailure(engine, error, now = Date.now()) {
    const profile = this.profile(engine);
    profile.lastCalledAt = now;
    const gap = profile.lastFailureAt ? now - profile.lastFailureAt : 0;
    if (gap > 0) profile.failureGapsMs.push(gap);
    if (profile.failureGapsMs.length > FAILURE_GAP_LIMIT) profile.failureGapsMs.splice(0, profile.failureGapsMs.length - FAILURE_GAP_LIMIT);
    const category = errorCategory(error);
    const severity = category === "captcha" || category === "blocked" ? 1.5 : 1;
    const learned = percentile(profile.failureGapsMs, this.errorGapPercentile) * this.errorGapSafety * severity;
    profile.attempts += 1;
    profile.fail += 1;
    profile.failuresInRow += 1;
    profile.successesInRow = 0;
    profile.lastFailureAt = now;
    profile.errorTypes[category] = (profile.errorTypes[category] || 0) + 1;
    profile.minIntervalMs = Math.min(this.maxIntervalMs, Math.max(profile.minIntervalMs * this.escalationFactor * severity, learned, this.minIntervalMs));
    profile.recentOutcomes.push({ at: now, status: "fail" });
    if (profile.recentOutcomes.length > RECENT_OUTCOME_LIMIT) profile.recentOutcomes.splice(0, profile.recentOutcomes.length - RECENT_OUTCOME_LIMIT);
    profile.lastError = String(error || "Unknown route failure").slice(0, 300);
    this.persist();
  }

  reset(engine) {
    if (!this.engines.includes(engine)) return false;
    this.profiles.set(engine, freshProfile(engine, this.minIntervalMs));
    this.persist();
    return true;
  }

  resetAll() {
    for (const engine of this.engines) this.profiles.set(engine, freshProfile(engine, this.minIntervalMs));
    this.persist();
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
      const remainingMs = profile.failuresInRow
        ? Math.max(0, profile.lastCalledAt + profile.minIntervalMs - now)
        : 0;
      return {
        ...profile,
        score: this.scoreEngine(profile, now),
        medianLatencyMs: this.medianLatency(profile),
        remainingMs,
        state: profile.failuresInRow ? (remainingMs > 0 ? "cooling_down" : "probe") : profile.attempts ? "healthy" : "unknown",
        consecutiveFailures: profile.failuresInRow,
        successes: profile.ok,
        errors: profile.fail,
        cooldownMs: profile.minIntervalMs
      };
    }).sort((a, b) => b.score - a.score || a.engine.localeCompare(b.engine)).map((profile, index) => ({ ...profile, rank: index + 1 }));
  }
}
