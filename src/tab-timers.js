const INACTIVITY_TIMEOUT_MS = 300_000;
const timers = new Map();

function key(backend, targetId) {
  return `${String(backend)}:${String(targetId)}`;
}

export function touchTab(backend, targetId) {
  timers.set(key(backend, targetId), { lastActiveAt: Date.now() });
}

export function clearTab(backend, targetId) {
  timers.delete(key(backend, targetId));
}

export function getTabTimings(backend, targetId) {
  const entry = timers.get(key(backend, targetId));
  if (!entry) return null;
  return {
    lastActiveAt: entry.lastActiveAt,
    closesInMs: Math.max(0, INACTIVITY_TIMEOUT_MS - (Date.now() - entry.lastActiveAt)),
    autoClose: true
  };
}

export function getTabTimeoutMs() {
  return INACTIVITY_TIMEOUT_MS;
}
