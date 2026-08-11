import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import logo from "./navigator.png";

const POLL_MS = 2000;
const MANAGE_GROUPS = [
  { label: "Browser Defaults", detail: "Shared defaults for direct page tools and DevTools.", keys: ["BROWSER_BACKEND", "DEVTOOLS_BROWSER_BACKEND", "BROWSER_USER_AGENT", "BROWSER_OP_TIMEOUT_MS"] },
  { label: "Backend Installations", detail: "Executable and profile settings for Chromium, Cloakbrowser, and Lightpanda.", keys: ["CHROME_PATH", "CHROME_USER_DATA_DIR", "CHROME_PROFILE_DIR", "CLOAKBROWSER_BINARY_PATH", "LIGHTPANDA_PATH", "LIGHTPANDA_PORT"] },
  { label: "Browser Startup And Desktop Access", detail: "VNC toggles HEADLESS automatically; use the header VNC action to change them together.", keys: ["PRELAUNCH_BROWSER", "STARTUP_URL", "HEADLESS", "ENABLE_VNC", "VNC_PORT", "NOVNC_PORT"] },
  { label: "Search Route Availability", detail: "Eligible engines, startup warming, route cooldowns, and browser-window capacity.", keys: ["SEARCH_ENABLED_ENGINES", "SEARCH_ROUTE_WARMUP_ENGINES", "SEARCH_ROUTE_CIRCUIT_OPEN_MS", "SEARCH_KEEP_MIN_WORKING_WINDOWS", "SEARCH_MAX_WORKING_WINDOWS"] },
  { label: "Search Scheduler", detail: "How select_best paces, recovers, explores, and ranks eligible engines.", keys: ["SEARCH_QUEUE_MIN_INTERVAL_MS", "SEARCH_QUEUE_MAX_INTERVAL_MS", "SEARCH_QUEUE_ESCALATION_FACTOR", "SEARCH_QUEUE_READY_INTERVAL_MS", "SEARCH_QUEUE_EXPLORATION_EVERY", "SEARCH_QUEUE_LATENCY_SAMPLES"] },
  { label: "Page Operations And Extraction", detail: "Parallelism, navigation, stabilization, extraction hints, and response size.", keys: ["OPEN_PAGE_MAX_PARALLEL", "MAX_CONCURRENT_PAGE_OPS", "NAV_WAIT_UNTIL", "STABILIZE_STRATEGY", "DOMAIN_HINTS_PATH", "WEB_FETCH_MAX_CHARS"] },
  { label: "MCP Transports And Tool Access", detail: "MCP transports, DevTools exposure, tool filtering, and HTTP authentication.", keys: ["ENABLE_HTTP_MCP", "ENABLE_STDIO_MCP", "ENABLE_DEVTOOLS_MCP", "HUMAN_TYPING_DELAY", "DISABLE_TOOLS", "MCP_ALLOW_UNAUTHENTICATED"] },
  { label: "HTTP Server And Console", detail: "HTTP listener, health/status endpoints, and the Navigator console.", keys: ["ENABLE_HTTP_HEALTH", "ENABLE_WEB_CONSOLE", "MCP_API_PORT", "MCP_API_HOST"] },
  { label: "Screenshot Storage And Downloads", detail: "Persist screenshots to enable file and download URL outputs.", keys: ["ENABLE_SCREENSHOT_PATH", "ENABLE_SCREENSHOT_DOWNLOAD_LINK"] },
  { label: "Reliability And Logging", detail: "Hang recovery plus timing and tool-error diagnostics.", keys: ["ENABLE_HANG_RESTART", "HANG_RESTART_TIMEOUT_MS", "DEBUG", "LOG_TOOL_ERRORS"] },
];
const WEB_TOOLS = new Set([
  "web_search",
  "web_fetch",
  "web_page_screenshot",
  "http:/search",
  "http:/extract",
  "http:/screenshot",
]);
const EXPECTED_INPUT_ERROR =
  /No link found in memory|Invalid input:|Provide one of:|Missing q|Unknown targetId|No target found|selector matched nothing|requires a targetId|ref_id/i;

function formatBytes(value) {
  if (!Number.isFinite(value)) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)}${units[index]}`;
}
function formatUptime(seconds) {
  if (!Number.isFinite(seconds)) return "-";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days
    ? `${days}d ${hours}h`
    : hours
      ? `${hours}h ${minutes}m`
      : `${minutes}m`;
}
function formatMs(ms) {
  if (!Number.isFinite(ms)) return "-";
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}
function formatCountdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0:00";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
function Countdown({ closesInMs }) {
  const [left, setLeft] = useState(closesInMs);
  useEffect(() => {
    setLeft(closesInMs);
    if (!Number.isFinite(closesInMs)) return undefined;
    const tick = setInterval(() => setLeft((current) => Math.max(0, current - 1000)), 1000);
    return () => clearInterval(tick);
  }, [closesInMs]);
  if (!Number.isFinite(left) || left <= 0) return <span className="countdown off">closing…</span>;
  return <span className="countdown">{formatCountdown(left)}</span>;
}
function list(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}
function classifyError(entry) {
  const tool = String(entry?.tool || "");
  const expected = EXPECTED_INPUT_ERROR.test(
    String(entry?.error || entry?.message || ""),
  );
  const family = WEB_TOOLS.has(tool)
    ? "Web Browsing"
    : ["Target.", "Page.", "Runtime.", "DOM.", "Input."].some((prefix) =>
          tool.startsWith(prefix),
        )
      ? "DevTools"
      : "System";
  return { family, expected, critical: !expected && family === "System" };
}
async function request(path, options) {
  const response = await fetch(path, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok || data.ok === false)
    throw new Error(data.error || "Request failed");
  return data;
}
function modeFromPath(pathname) {
  if (pathname === "/console/tools" || pathname === "/console/api")
    return "tools";
  if (pathname === "/console/manage") return "manage";
  if (pathname === "/console/keys") return "keys";
  return "status";
}
function pathForMode(mode) {
  if (mode === "tools") return "/console/tools";
  if (mode === "manage") return "/console/manage";
  if (mode === "keys") return "/console/keys";
  return "/console";
}

function Layout({
  children,
  mode,
  setMode,
  title = "CONSOLE",
  telemetry = {},
  paused,
  setPaused,
  vnc,
  toggleVnc,
  vncBusy,
}) {
  const [dark, setDark] = useState(
    () => localStorage.getItem("navigator-theme") === "dark",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("navigator-theme", dark ? "dark" : "light");
  }, [dark]);
  const status = telemetry.ok ? "ok" : "off";
  return (
    <main className="app">
      <header>
        <a className="logo" href="/console">
          <img className="logo-img" src={logo} alt="Navigator logo" />
          NAVIGATOR <span>{title}</span>
        </a>
        {title === "CONSOLE" && (
          <>
            <div className={`live ${paused ? "paused" : status}`}>
              <i />
              {paused ? "PAUSED" : telemetry.ok ? "LIVE 2s" : "OFFLINE"}
            </div>
            <div className="hdr-item">
              uptime <b>{formatUptime(telemetry.stats?.uptimeSeconds)}</b>
            </div>
            <div className="hdr-item">
              mem <b>{formatBytes(telemetry.stats?.memory?.rss)}</b>
            </div>
            <div className="hdr-item">
              sessions <b>{telemetry.stats?.sessions ?? "-"}</b>
            </div>
          </>
        )}
        <span className="spacer" />
        {setMode ? (
          <div className="mode-switch">
            <button
              className={mode === "status" ? "active" : ""}
              onClick={() => setMode("status")}
            >
              Status
            </button>
            <button
              className={mode === "manage" ? "active" : ""}
              onClick={() => setMode("manage")}
            >
              Manage
            </button>
            <button
              className={mode === "tools" ? "active" : ""}
              onClick={() => setMode("tools")}
            >
              Web tools
            </button>
            <button
              className={mode === "keys" ? "active" : ""}
              onClick={() => setMode("keys")}
            >
              API keys
            </button>
          </div>
        ) : (
          <a className="button" href="/console">
            Back to console
          </a>
        )}
        <button className="button" onClick={() => setDark(!dark)}>
          {dark ? "Light" : "Dark"}
        </button>
        {setPaused && (
          <button
            className="button"
            onClick={() => setPaused(!paused)}
            title="Pause live polling"
          >
            {paused ? "[▶]" : "[⏸]"}
          </button>
        )}
        {toggleVnc && (
          vncBusy ? (
            <button
              className="button"
              disabled
            >
              Working...
            </button>
          ) : vnc?.running ? (
            <div className="remote-desktop-actions" role="group" aria-label="Remote Desktop">
              <button
                className="button"
                onClick={() =>
                  window.open(
                    `http://${location.hostname}:${vnc.novncPort}/vnc.html`,
                    "_blank",
                    "noopener",
                  )
                }
              >
                Open Remote Desktop
              </button>
              <button className="button danger" onClick={toggleVnc}>
                Close Remote Desktop
              </button>
            </div>
          ) : (
            <button className="button" onClick={toggleVnc}>
              Enable Remote Desktop
            </button>
          )
        )}
      </header>
      {children}
    </main>
  );
}

function Dot({ tone = "" }) {
  return <i className={`status-dot ${tone}`} />;
}
function Pill({ tone = "ok", children }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
function Panel({ title, sub, wide, children }) {
  return (
    <section className={`panel ${wide ? "panel-wide" : ""}`}>
      <h2>
        {title}
        {sub && <span className="sub">{sub}</span>}
      </h2>
      {children}
    </section>
  );
}
function Empty({ children }) {
  return <div className="empty">{children}</div>;
}
function Trend({ label, values, color }) {
  if (values.length < 2)
    return (
      <div className="trend">
        <span>{label}</span>
        <span>collecting trend...</span>
      </div>
    );
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  const points = values
    .map(
      (value, index) =>
        `${(index / (values.length - 1)) * 100},${26 - ((value - min) / range) * 22}`,
    )
    .join(" ");
  return (
    <div className="trend">
      <span>{label}</span>
      <svg
        viewBox="0 0 100 28"
        preserveAspectRatio="none"
        aria-label={`${label} trend`}
      >
        <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
      </svg>
    </div>
  );
}

function computeStatus(health, stats, ok) {
  const issues = [];
  let level = "ok";
  const mark = (next, text) => {
    issues.push({ level: next, text });
    if (
      { ok: 0, degraded: 1, critical: 2 }[next] >
      { ok: 0, degraded: 1, critical: 2 }[level]
    )
      level = next;
  };
  if (!ok) mark("critical", "server unreachable");
  if (
    health?.pageLimiter?.maxConcurrentPageOps &&
    health.pageLimiter.inUse >= health.pageLimiter.maxConcurrentPageOps
  )
    mark(
      "degraded",
      `page ops saturated (${health.pageLimiter.inUse}/${health.pageLimiter.maxConcurrentPageOps}${health.pageLimiter.queued ? `, ${health.pageLimiter.queued} queued` : ""})`,
    );
  if (health?.vnc?.running && health.vnc.headed === false)
    mark("degraded", "VNC running but browser still headless");
  if (health?.vnc?.enabled && !health.vnc.running)
    mark("degraded", "VNC enabled but noVNC unreachable");
  const errors = (stats?.requests?.recentErrors || []).filter(
    (entry) => WEB_TOOLS.has(entry.tool) && !classifyError(entry).expected,
  );
  if (errors.length)
    mark("degraded", `${errors.length} recent web browsing error(s)`);
  return { level, issues };
}

function StatusView({ snapshot, history, toggleVnc, vncBusy, feed }) {
  const { health = {}, stats = {}, config = {}, logs = [], ok } = snapshot;
  const instances = stats.instances || [];
  const engines = config.engines || [];
  const circuits = health.searchRouteCircuitBreakers || [];
  const state = computeStatus(health, stats, ok);
  const enabledEngineIds = new Set(engines.map((engine) => engine.id));
  const unavailable = circuits.filter(
    (item) =>
      item.remainingMs > 0 && enabledEngineIds.has(item.route?.split("/")[0]),
  ).length;
  const tabs = instances.reduce((sum, item) => sum + (item.tabs || 0), 0);
  const limiter = health.pageLimiter || {};
  const period = stats.requests?.byPeriod?.["5m"] || {};
  return (
    <>
      <section className="overview">
        <section className="panel welcome">
          <div>
            <div className="section-kicker">Live operational overview</div>
            <h1>
              {state.level === "ok"
                ? "Navigator is ready"
                : state.level === "degraded"
                  ? "Navigator needs attention"
                  : "Navigator has a blocking issue"}
            </h1>
          </div>
          <div className={`health-line ${state.level}`}>
            <span className="health-ring" />
            {state.level === "ok"
              ? "All monitored systems are healthy"
              : `${state.issues.length} item${state.issues.length === 1 ? "" : "s"} need attention`}
          </div>
        </section>
        <section className="metrics">
          <Metric
            label="Engines ready"
            value={`${Math.max(0, engines.length - unavailable)}/${engines.length}`}
            note={
              unavailable
                ? `${unavailable} route${unavailable === 1 ? "" : "s"} unavailable`
                : "search routes ready"
            }
          />
          <Metric
            label="Open tabs"
            value={tabs}
            note={tabs ? "across connected drivers" : "no browser pages open"}
          />
          <Metric
            label="Pages in use"
            value={`${limiter.inUse ?? 0}/${limiter.maxConcurrentPageOps ?? "-"}`}
            note={
              limiter.queued ? `${limiter.queued} waiting` : "page slots active"
            }
          />
          <Metric
            label="Requests 5m"
            value={`${period.ok || 0} ok`}
            note={period.err ? `${period.err} failed` : "no failures"}
          />
        </section>
      </section>
      {state.level !== "ok" && (
        <section
          className={`attention show ${state.level === "critical" ? "critical" : ""}`}
        >
          <strong>
            {state.level === "critical" ? "Action needed" : "Heads up"}
          </strong>
          <div>
            {state.issues
              .slice(0, 4)
              .map((issue) => issue.text)
              .join(" · ")}
          </div>
        </section>
      )}
      <section className="content-grid">
        <div className="engine-activity">
          <Engines config={config} health={health} stats={stats} />
          <LiveFeed feed={feed} enabledEngines={engines.map((engine) => engine.id)} />
        </div>
        <Drivers health={health} instances={instances} />
        <Runtime health={health} stats={stats} history={history} />
        <Work stats={stats} />
        <Logs logs={logs} />
      </section>
    </>
  );
}
function Metric({ label, value, note }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-note">{note}</span>
    </div>
  );
}
function Runtime({ health, stats, history }) {
  const limiter = health.pageLimiter || {};
  const windows = health.searchWindows || {};
  const cache = stats.cache || {};
  const hits = stats.counters?.cacheHits || 0;
  const misses = stats.counters?.cacheMisses || 0;
  return (
    <Panel title="Activity" sub="capacity, cache and windows">
      <div className="list">
        <Item
          tone={limiter.queued ? "warn" : ""}
          title="Page capacity"
          detail={`${limiter.inUse ?? 0} of ${limiter.maxConcurrentPageOps ?? "?"} slots active${limiter.queued ? ` · ${limiter.queued} waiting` : ""}`}
        />
        <Item
          title="Search windows"
          detail={`${windows.total || 0} open across active search routes`}
        />
        <Item
          title="Cache"
          detail={`${cache.total || 0} entries${hits + misses ? ` · ${Math.round((hits / (hits + misses)) * 100)}% hit rate` : " · no requests cached yet"}`}
        />
        <Item
          title="Server"
          detail={`${formatBytes(stats.memory?.rss)} memory · ${stats.sessions ?? 0} MCP client${stats.sessions === 1 ? "" : "s"}`}
        />
      </div>
      <Trend label="Memory" values={history.memory} color="#2dd4bf" />
      <Trend label="Page slots" values={history.slots} color="#35e07a" />
    </Panel>
  );
}
function Item({ title, detail, tone = "" }) {
  return (
    <div className="item">
      <Dot tone={tone} />
      <div className="item-main">
        <div className="item-title">{title}</div>
        <div className="item-detail">{detail}</div>
      </div>
    </div>
  );
}
function Drivers({ health, instances }) {
  const byBackend = new Map(instances.map((item) => [item.backend, item]));
  return (
    <Panel title="Browser drivers" sub="engines, tabs and close timers">
      <div className="list">
        {["cloakbrowser", "lightpanda", "chromium"].map((backend) => {
          const instance = byBackend.get(backend);
          const online = Boolean(instance?.connected);
          const defaultDriver = backend === health.backend;
          const detail = online
            ? `${instance.tabs || 0} tabs · pid ${instance.pid ?? "-"} · ${instance.spawns || 0} spawns`
            : defaultDriver
              ? "Default driver is not connected"
              : "Not started";
          return (
            <div className="item driver-item" key={backend}>
              <Dot tone={online ? "" : defaultDriver ? "err" : "off"} />
              <div className="item-main">
                <div className="item-title">
                  {backend} {defaultDriver && <Pill tone="info">default</Pill>}
                </div>
                <div className="item-detail">{detail}</div>
                {online && (instance.openTabs || []).length > 0 && (
                  <div className="driver-tabs">
                    {(instance.openTabs || []).map((tab, index) => (
                      <div className="driver-tab" key={`${tab.targetId || index}`}>
                        <span className="driver-tab-title" title={tab.url}>
                          {tab.title || tab.url || "Untitled page"}
                        </span>
                        {tab.autoClose ? (
                          <Countdown closesInMs={tab.closesInMs} />
                        ) : (
                          <span className="countdown sticky">sticky</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Pill tone={online ? "ok" : defaultDriver ? "err" : "off"}>
                {online ? "online" : defaultDriver ? "offline" : "idle"}
              </Pill>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
function Engines({ config, health, stats }) {
  const circuits = new Map(
    (health.searchRouteCircuitBreakers || []).map((item) => [
      `${item.route}`,
      item,
    ]),
  );
  const attempts = stats.engineAttempts?.byEngine || {};
  const profiles = new Map((stats.engineProfiles || []).map((profile) => [profile.engine, profile]));
  const now = Date.now();
  const warmup = new Set(config.config?.searchRouteWarmupEngines || []);
  const enabled = new Set(config.config?.searchEnabledEngines || []);
  const rateFor = (id) => {
    const period = attempts[id]?.byPeriod?.["24h"] || attempts[id] || {};
    const tried = (period.ok || 0) + (period.fail || 0);
    return tried ? { tried, rate: (period.ok || 0) / tried } : { tried: 0, rate: 0 };
  };
  const schedulingState = (profile) => {
    if (profile.state === "cooling_down") return "cooling_down";
    if (profile.state === "probe") return "probe";
    if (profile.lastSelectedAt && now < profile.lastSelectedAt + (profile.dispatchGapMs || 0)) return "paced";
    return "ready";
  };
  const stateRank = { ready: 0, probe: 1, paced: 2, cooling_down: 3 };
  const engines = [...(config.engines || [])].sort((a, b) => {
    const profileA = profiles.get(a.id) || {};
    const profileB = profiles.get(b.id) || {};
    const rankA = stateRank[schedulingState(profileA)] ?? 4;
    const rankB = stateRank[schedulingState(profileB)] ?? 4;
    if (rankA !== rankB) return rankA - rankB;
    if (rankA === 0) {
      const latencyA = profileA.medianLatencyMs || 0;
      const latencyB = profileB.medianLatencyMs || 0;
      if (!latencyA && !latencyB) return a.id.localeCompare(b.id);
      if (!latencyA) return -1;
      if (!latencyB) return 1;
      if (latencyA !== latencyB) return latencyA - latencyB;
    }
    if ((profileA.errorScore || 0) !== (profileB.errorScore || 0)) {
      return (profileA.errorScore || 0) - (profileB.errorScore || 0);
    }
    return (profileB.successScore || 0) - (profileA.successScore || 0);
  });
  if (!engines.length)
    return (
      <Panel title="Search engines">
        <Empty>No engine registry is available yet.</Empty>
      </Panel>
    );
  const ready = engines.filter((item) => schedulingState(profiles.get(item.id) || {}) === "ready");
  const cooling = engines.filter((item) => schedulingState(profiles.get(item.id) || {}) === "cooling_down");
  const probes = engines.filter((item) => schedulingState(profiles.get(item.id) || {}) === "probe");
  return (
    <Panel
      title="Search engines"
      sub="select_best queue — fastest healthy route first"
    >
      <div className="engine-summary">
        <b>{ready.length}</b> ready · <b>{probes.length}</b> recovery probes · <b>{cooling.length}</b> cooling down
      </div>
      <div className="engine-grid">
        {engines.map((engine, index) => {
          const circuit = circuits.get(`${engine.id}/${engine.backend}`);
          const stat = attempts[engine.id] || {};
          const profile = profiles.get(engine.id) || {};
          const schedulerState = schedulingState(profile);
          const dispatchWaitMs = Math.max(0, (profile.lastSelectedAt || 0) + (profile.dispatchGapMs || 0) - now);
          const attempted = (stat.ok || 0) + (stat.fail || 0);
          const { rate } = rateFor(engine.id);
          let tone = "ok";
          let route = schedulerState;
          if (circuit?.remainingMs > 0) {
            tone = "err";
            route = `open · retry ${Math.ceil(circuit.remainingMs / 1000)}s`;
          } else if (schedulerState === "cooling_down") {
            tone = "err";
            route = `cooling · retry ${formatCountdown(profile.remainingMs)}`;
          } else if (schedulerState === "probe" || circuit?.state === "half_open") {
            tone = "warn";
            route = "recovery probe";
          } else if (schedulerState === "paced") {
            tone = "info";
            route = `paced · ${formatCountdown(dispatchWaitMs)}`;
          }
          const pool =
            health.searchWindows?.byEngine?.[
              engine.pool === "shared" ? "_shared" : engine.id
            ];
          const role = warmup.has(engine.id)
            ? "primary"
            : enabled.has(engine.id)
              ? "enabled"
              : "available";
          const pct = Math.round(rate * 100);
          return (
            <div
              className="engine engine-row"
              key={engine.id}
              title={circuit?.lastError || ""}
            >
              <Dot tone={tone === "ok" ? "" : tone} />
              <div className="engine-main">
                <div className="engine-name">
                  <span className="queue-position">{index + 1}</span>
                  {engine.id}
                  <Pill tone={tone}>{route}</Pill>
                </div>
                <div className="engine-inline-meta"><span className="feed-backend">{formatBackend(engine.backend)}</span> · {role}</div>
                <div className="ordering-factors">
                  <span><b>{schedulerState.replace("_", " ")}</b> eligibility</span>
                  <span className={profile.consecutiveFailures ? "score-error" : ""}><b>{profile.consecutiveFailures || 0}</b> failure streak</span>
                  <span><b>{profile.medianLatencyMs ? formatMs(profile.medianLatencyMs) : "unmeasured"}</b> latency/{profile.latencySamples?.length || 0}</span>
                  <span><b>{dispatchWaitMs ? formatCountdown(dispatchWaitMs) : "now"}</b> dispatch wait</span>
                  {schedulerState === "cooling_down" && <span className="score-error"><b>{formatCountdown(profile.remainingMs)}</b> retry wait</span>}
                </div>
                {circuit?.lastError && schedulerState !== "ready" && (
                  <div className="engine-route-error" title={circuit.lastError}>{circuit.lastError}</div>
                )}
              </div>
              <div className="engine-stats">
                <b>{stat.results || 0}</b> results<br />
                {stat.ok || 0}/{stat.fail || 0}/{stat.skip || 0} ok/fail/skip<br />
                {attempted ? `${pct}%` : "-"} · 24h
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
function Work({ stats }) {
  const counters = stats.counters || {};
  const period = stats.requests?.byPeriod?.["5m"];
  const attempts = stats.engineAttempts || {};
  return (
    <Panel title="Work completed" sub="since server start">
      <div className="list">
        <Item
          title={`${counters.searches || 0} searches · ${counters.fetches || 0} fetches · ${counters.screenshots || 0} screenshots`}
          detail="Completed since this server started"
        />
        <Item
          tone={period?.err ? "warn" : ""}
          title={`Last 5 minutes: ${period ? `${period.ok} successful / ${period.err} failed` : "no requests"}`}
          detail={`${attempts.total || 0} engine attempts · ${attempts.ok || 0} succeeded · ${attempts.fail || 0} failed`}
        />
      </div>
    </Panel>
  );
}
function formatTime(ts) {
  if (ts == null) return "";
  const ms = typeof ts === "number" && ts < 1e12 ? ts * 1000 : Number(ts);
  if (!Number.isFinite(ms) || ms <= 0) return String(ts || "");
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return String(ts);
  return date.toLocaleTimeString([], { hour12: false });
}
function formatKeyDate(ts) {
  const date = new Date(Number(ts));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}
function formatRelativeTime(ts) {
  const ms = typeof ts === "number" && ts < 1e12 ? ts * 1000 : Number(ts);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
function formatBackend(backend) {
  return {
    lightpanda: "LP",
    cloakbrowser: "CB",
    chromium: "CH",
    api: "API",
  }[String(backend || "").toLowerCase()] || "-";
}
function buildFeed(entries, pageOps) {
  const preview = (value) => String(value || "").slice(0, 80);
  const requestTarget = (value) => {
    try {
      const url = new URL(value);
      return preview(`${url.host}${url.pathname}${url.search}`);
    } catch {
      return preview(value);
    }
  };
  const rows = [];
  for (const search of entries || []) {
    const attempts = (search.attempts || []).map((attempt) => ({
      key: attempt.id,
      engine: attempt.engine,
      backend: formatBackend(attempt.backend),
      status: attempt.status || "running",
      response:
        attempt.error ? "error" : attempt.status === "ok" ? `${attempt.result_count || 0} results` : attempt.status || "running",
      duration: attempt.duration_ms != null ? formatMs(attempt.duration_ms) : "",
      error: attempt.error || "",
    }));
    const backends = [...new Set(attempts.map((attempt) => attempt.backend).filter((backend) => backend !== "-"))];
    rows.push({
      key: `s-${search.id}`,
      ts: search.ts,
      kind: "search",
      status: search.status || "",
      category: "Web",
      tool: "web_search",
      backend: backends.join("/") || "-",
      request: preview(search.query),
      response:
        search.error ? "error" : search.result_count != null ? `${search.result_count} results` : search.status || "running",
      duration: search.duration_ms != null ? formatMs(search.duration_ms) : "",
      error: search.error || "",
      attempts,
    });
  }
  for (const op of pageOps || []) {
    rows.push({
      key: `p-${op.id}`,
      ts: op.ts,
      kind: op.source === "devtools" ? "devtools" : "page_op",
      status: op.ok ? "ok" : "fail",
      category: op.source === "devtools" ? "Dev" : "Web",
      tool: op.tool || "page",
      backend: formatBackend(op.backend),
      request: requestTarget(op.url),
      response: op.error ? "error" : op.response_chars ? `${Number(op.response_chars).toLocaleString()} chars` : "- chars",
      duration: op.duration_ms != null ? formatMs(op.duration_ms) : "",
      error: op.error || "",
    });
  }
  return rows.sort((a, b) => Number(b.ts) - Number(a.ts));
}
function LiveFeed({ feed, enabledEngines }) {
  const [showWeb, setShowWeb] = useState(true);
  const [showDevtools, setShowDevtools] = useState(true);
  const [newKeys, setNewKeys] = useState(() => new Set());
  const knownKeys = useRef(null);
  const enabledEngineIds = new Set(enabledEngines);
  const rows = (feed || [])
    .map((entry) =>
      entry.attempts
        ? {
            ...entry,
            attempts: entry.attempts.filter((attempt) =>
              enabledEngineIds.has(attempt.engine),
            ),
          }
        : entry,
    )
    .filter((entry) => (entry.kind === "devtools" ? showDevtools : showWeb));
  useEffect(() => {
    const currentKeys = new Set(rows.map((entry) => entry.key));
    if (!knownKeys.current) {
      if (feed?.length) knownKeys.current = currentKeys;
      return;
    }
    const added = new Set([...currentKeys].filter((key) => !knownKeys.current.has(key)));
    if (added.size) {
      setNewKeys(added);
    }
    knownKeys.current = currentKeys;
  }, [feed]);
  return (
    <Panel
      title="Live activity"
      sub={
        <span className="feed-filters">
          <label className="feed-toggle">
            <input
              type="checkbox"
              checked={showWeb}
              onChange={(event) => setShowWeb(event.target.checked)}
            />
            Web
          </label>
          <label className="feed-toggle">
            <input
              type="checkbox"
              checked={showDevtools}
              onChange={(event) => setShowDevtools(event.target.checked)}
            />
            DevTools
          </label>
        </span>
      }
    >
      {rows.length ? (
        <div className="feed">
          <table className="activity-table">
            <colgroup>
              <col className="activity-time" />
              <col className="activity-tool" />
              <col className="activity-response" />
              <col className="activity-duration" />
            </colgroup>
            <tbody>
              {rows.map((entry) => {
                const tone = entry.status === "ok" ? "ok" : entry.status === "fail" || entry.status === "error" ? "fail" : "";
                return (
                  <tr
                    className={`activity-row ${tone} ${newKeys.has(entry.key) ? "activity-new" : ""}`}
                    key={entry.key || `${entry.kind}-${entry.ts}`}
                  >
                    <td className="feed-time">
                      <span className="feed-time-top">
                        <b>{formatRelativeTime(entry.ts)}</b>
                        <span className="feed-kind">{entry.category}</span>
                      </span>
                      <small>{formatTime(entry.ts)}</small>
                    </td>
                    <td className="activity-tool-cell">
                      <span className="feed-tool">
                        {entry.tool} <span className="feed-backend">{entry.backend || "-"}</span>
                      </span>
                      <span className="feed-request" title={entry.request}>req: {entry.request || "-"}</span>
                      {entry.attempts?.length ? (
                        <span className="feed-attempts">
                          {entry.attempts.map((attempt) => (
                            <span
                              className={`feed-attempt ${attempt.status === "ok" ? "ok" : attempt.status === "fail" || attempt.status === "error" ? "fail" : ""}`}
                              key={attempt.key}
                              title={attempt.error || undefined}
                            >
                              {attempt.engine} <span className="feed-backend">{attempt.backend}</span>: {attempt.response}
                              {attempt.duration ? ` · ${attempt.duration}` : ""}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </td>
                    <td className={`feed-response ${entry.error ? "feed-error" : ""}`} title={entry.error || entry.response}>
                      {entry.error ? "error" : entry.response}
                    </td>
                    <td className="feed-duration">{entry.duration}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>
          No activity recorded yet. Searches and engine attempts will stream
          here as they happen.
        </Empty>
      )}
    </Panel>
  );
}
const ERROR_FILTERS = ["All", "Web Browsing", "DevTools", "System"];
function Logs({ logs }) {
  const [filter, setFilter] = useState("All");
  const counts = { All: logs.length };
  ERROR_FILTERS.slice(1).forEach((family) => {
    counts[family] = logs.filter((entry) => classifyError(entry).family === family).length;
  });
  const filtered =
    filter === "All"
      ? logs
      : logs.filter((entry) => classifyError(entry).family === filter);
  return (
    <Panel title="Recent errors" sub="latest tool failures" wide>
      <div className="log-filter">
        {ERROR_FILTERS.map((name) => (
          <button
            key={name}
            className={filter === name ? "active" : ""}
            onClick={() => setFilter(name)}
          >
            {name} <b>{counts[name]}</b>
          </button>
        ))}
      </div>
      {filtered.length ? (
        <div className="logs">
          {filtered.map((entry, index) => {
            const info = classifyError(entry);
            return (
              <div className="log-entry" key={`${entry.ts}-${index}`}>
                <div className="log-row">
                  <b>{entry.tool || entry.level || "error"}</b>
                  <Pill
                    tone={
                      info.critical
                        ? "err"
                        : info.expected
                          ? "off"
                          : "info"
                    }
                  >
                    {info.expected
                      ? "expected input"
                      : info.critical
                        ? "critical"
                        : info.family}
                  </Pill>
                  <span>{entry.ts || ""}</span>
                </div>
                <div className="item-detail">
                  {entry.error || entry.message || "Unknown error"}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty>No tool errors match this filter.</Empty>
      )}
    </Panel>
  );
}

function validateEntryValue(entry, value, engineIds) {
  const raw = String(value ?? "");
  const type = entry.type || "string";
  if (raw === "") {
    if (type === "enum" || type === "boolean") {
      return { ok: false, message: "Choose a value." };
    }
    return { ok: true };
  }
  switch (type) {
    case "boolean":
      return raw === "true" || raw === "false" || raw === "1" || raw === "0"
        ? { ok: true }
        : { ok: false, message: "Must be true or false." };
    case "number":
      return Number.isFinite(Number(raw))
        ? { ok: true }
        : { ok: false, message: "Must be a number." };
    case "integer":
      return Number.isInteger(Number(raw))
        ? { ok: true }
        : { ok: false, message: "Must be a whole number." };
    case "enum": {
      const allowed = entry.values || [];
      return allowed.includes(raw)
        ? { ok: true }
        : { ok: false, message: `Must be one of: ${allowed.join(", ")}.` };
    }
    case "engines": {
      const unknown = raw
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean)
        .filter((token) => !engineIds.has(token));
      return unknown.length
        ? { ok: false, message: `Unknown engine${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}` }
        : { ok: true };
    }
    default:
      return { ok: true };
  }
}
function MultiSelect({ items, value, changed, ok, message, emptyLabel, ariaLabel, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const selected = value
    ? value
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean)
    : [];
  const toggle = (id) => {
    const next = selected.includes(id)
      ? selected.filter((item) => item !== id)
      : [...selected, id];
    onChange(next.join(","));
  };
  useEffect(() => {
    if (!open) return;
    const position = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        const gap = 4;
        const below = window.innerHeight - rect.bottom - gap - 8;
        const above = rect.top - gap - 8;
        const flip = below < 200 && above > below;
        const maxHeight = Math.max(120, Math.min(260, flip ? above : below));
        setPos({
          left: rect.left,
          top: flip ? rect.top - gap - maxHeight : rect.bottom + gap,
          width: Math.max(rect.width, 240),
          maxHeight,
        });
      }
    };
    position();
    const onDoc = (event) => {
      if (triggerRef.current && triggerRef.current.contains(event.target)) return;
      if (panelRef.current && panelRef.current.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [open]);
  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`config-input engine-trigger ${changed ? "changed" : ""} ${ok ? "" : "invalid"}`}
        aria-label={ariaLabel}
        onClick={() => setOpen(!open)}
      >
        <span className="engine-selected">
          {selected.length ? selected.join(", ") : emptyLabel}
        </span>
        <span className="engine-caret">{open ? "▴" : "▾"}</span>
      </button>
      {open && pos && (
        <div
          ref={panelRef}
          className="engine-panel"
          style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight }}
        >
          {[...new Set([...items, ...selected])].map((item) => (
            <label key={item} className="engine-option">
              <input
                type="checkbox"
                checked={selected.includes(item)}
                onChange={() => toggle(item)}
              />
              <span>{item}</span>
            </label>
          ))}
        </div>
      )}
      {!ok && <div className="field-error">{message}</div>}
    </>
  );
}
function ValueControl({ entry, value, changed, engines, tools, onChange }) {
  const type = entry.type || "string";
  const engineIds = new Set((engines || []).map((engine) => engine.id));
  const { ok, message } = validateEntryValue(entry, value, engineIds);
  const cls = `config-input ${changed ? "changed" : ""} ${ok ? "" : "invalid"}`;
  const shared = {
    className: cls,
    "aria-label": `${entry.key} value`,
    value,
    onChange: (event) => onChange(event.target.value),
  };
  if (type === "engines") {
    return (
      <MultiSelect
        items={(engines || []).map((engine) => engine.id)}
        value={value}
        changed={changed}
        ok={ok}
        message={message}
        emptyLabel="Select engines…"
        ariaLabel="engines value"
        onChange={onChange}
      />
    );
  }
  if (type === "toolList") {
    return (
      <MultiSelect
        items={tools || []}
        value={value}
        changed={changed}
        ok={ok}
        message={message}
        emptyLabel="Select tools…"
        ariaLabel="tools to disable"
        onChange={onChange}
      />
    );
  }
  const selectOptions =
    type === "boolean"
      ? ["true", "false"]
      : type === "enum"
        ? entry.values || []
        : null;
  if (selectOptions) {
    return (
      <>
        <select {...shared}>
          {selectOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {!ok && <div className="field-error">{message}</div>}
      </>
    );
  }
  return (
    <>
      <input type="text" {...shared} />
      {!ok && <div className="field-error">{message}</div>}
    </>
  );
}
function normalizeDraftValue(entry, value) {
  if (entry.type === "boolean") {
    const raw = String(value).trim().toLowerCase();
    if (raw === "1" || raw === "true") return "true";
    if (raw === "0" || raw === "false") return "false";
    return String(value);
  }
  return Array.isArray(value) ? value.join(",") : String(value ?? "");
}
function compareDraftValue(entry, a, b) {
  if (entry.type === "engines") {
    const tokens = (value) =>
      (value || "")
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean)
        .sort()
        .join(",");
    return tokens(a) === tokens(b);
  }
  return a === b;
}
function Manage({ config, reload }) {
  const [draft, setDraft] = useState({});
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState(
    "Changes persist to .env. Green fields apply now; amber fields need a container recreate.",
  );
  const [kind, setKind] = useState("");
  const envSignature = useRef("");
  const rawFor = (entry) =>
    config.env?.[entry.key] ??
    config.config?.[entry.key.toLowerCase()] ??
    entry.fallback ??
    "";
  useEffect(() => {
    const signature = JSON.stringify({
      env: config.env || {},
      schema: (config.schema || []).map((entry) => entry.key),
    });
    if (signature === envSignature.current) return;
    envSignature.current = signature;
    const next = {};
    (config.schema || []).forEach((entry) => {
      next[entry.key] = normalizeDraftValue(entry, rawFor(entry));
    });
    setDraft(next);
  }, [config]);
  const save = async (body, success) => {
    setMessage("Saving...");
    setKind("");
    try {
      const result = await request("/console/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      await reload();
      setMessage(
        success ||
          `Saved. ${result.hotApplied?.length || 0} setting(s) applied now; ${result.restartRequired?.length || 0} need a recreate.`,
      );
      setKind("ok");
    } catch (error) {
      setMessage(error.message);
      setKind("err");
    }
  };
  const changed = (config.schema || []).filter(
    (entry) =>
      !compareDraftValue(
        entry,
        draft[entry.key],
        normalizeDraftValue(entry, rawFor(entry)),
      ),
  );
  const engineIds = new Set((config.engines || []).map((engine) => engine.id));
  const invalidCount = (config.schema || []).filter(
    (entry) => !validateEntryValue(entry, draft[entry.key] ?? "", engineIds).ok,
  ).length;
  const q = query.trim().toLowerCase();
  const matchesQuery = (entry, group) =>
    !q ||
    entry.key.toLowerCase().includes(q) ||
    String(entry.fallback ?? "").toLowerCase().includes(q) ||
    String(entry.description ?? "").toLowerCase().includes(q) ||
    group.label.toLowerCase().includes(q) ||
    group.detail.toLowerCase().includes(q);
  const schemaByKey = new Map((config.schema || []).map((entry) => [entry.key, entry]));
  const groupedSchema = MANAGE_GROUPS.map((group) => ({
    ...group,
    entries: group.keys.map((key) => schemaByKey.get(key)).filter(Boolean).filter((entry) => matchesQuery(entry, group)),
  })).filter((group) => group.entries.length);
  const groupedKeys = new Set(MANAGE_GROUPS.flatMap((group) => group.keys));
  const ungrouped = (config.schema || []).filter((entry) => !groupedKeys.has(entry.key));
  if (ungrouped.length) {
    const entries = ungrouped.filter((entry) => matchesQuery(entry, { label: "Other Settings", detail: "" }));
    if (entries.length) groupedSchema.push({ label: "Other Settings", detail: "Settings not yet assigned to a dependency group.", entries });
  }
  return (
    <section className="panel manage">
      <h2>
        [ Manage - environment configuration ]{" "}
        <span className="sub">
          {config.envPath && `writes → ${config.envPath}`}
        </span>
      </h2>
      <div className="manage-toolbar">
        <input
          className="manage-search"
          type="search"
          placeholder="Search variables, defaults, descriptions…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          className="button"
          disabled={invalidCount > 0}
          onClick={() =>
            changed.length
              ? save({
                  updates: Object.fromEntries(
                    changed.map((entry) => [entry.key, draft[entry.key]]),
                  ),
                })
              : setMessage("No changes to save.")
          }
        >
          Save changes{invalidCount ? ` (${invalidCount} invalid)` : ""}
        </button>
        <button
          className="button"
          onClick={() =>
            window.confirm(
              "Restore the latest .env backup? Settings applied live will keep their current values until restart.",
            ) &&
            save(
              { revert: true },
              "Restored the latest backup. Restart the container to reload recreate-only settings.",
            )
          }
        >
          Revert last save
        </button>
        <span className={`manage-message ${invalidCount > 0 ? "err" : kind}`}>
          {invalidCount > 0
            ? `${invalidCount} invalid value${invalidCount === 1 ? "" : "s"} — fix before saving.`
            : message}
        </span>
      </div>
      <div className="manage-table-wrap">
        <table className="manage-table">
          <thead>
            <tr>
              <th>Variable</th>
              <th>Default</th>
              <th>Value to save</th>
              <th>Applies</th>
              <th>Description</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {groupedSchema.flatMap((group) => group.entries.map((entry, index) => {
            const fallback = Array.isArray(entry.fallback)
              ? entry.fallback.join(",")
              : String(entry.fallback ?? "");
            return (
              <FragmentRows
                key={entry.key}
                heading={index === 0}
                label={group.label}
                detail={group.detail}
                entry={entry}
                fallback={fallback}
                value={draft[entry.key] ?? ""}
                changed={changed.some((item) => item.key === entry.key)}
                engines={config.engines || []}
                tools={config.tools || []}
                onChange={(value) => setDraft({ ...draft, [entry.key]: value })}
                reset={() =>
                  save(
                    { reset: [entry.key] },
                    `${entry.key} reset to its default`,
                  )
                }
              />
            );
          }))}
          {!groupedSchema.length && (
            <tr className="section">
              <td colSpan="6">No variables match “{query}”.</td>
            </tr>
          )}
        </tbody>
        </table>
      </div>
    </section>
  );
}
function FragmentRows({
  heading,
  label,
  detail,
  entry,
  fallback,
  value,
  changed,
  engines,
  tools,
  onChange,
  reset,
}) {
  return (
    <>
      {heading && (
        <tr className="section">
          <td colSpan="6">
            <span>{label}</span>
            <small>{detail}</small>
            {label === "MCP Transports And Tool Access" && <a href="/console/keys">Manage API keys</a>}
          </td>
        </tr>
      )}
      <tr>
        <td>{entry.key}</td>
        <td className="val-default">{fallback}</td>
        <td>
          <ValueControl
            entry={entry}
            value={value}
            changed={changed}
            engines={engines}
            tools={tools}
            onChange={onChange}
          />
        </td>
        <td>
          <Pill tone={entry.applies === "hot" ? "info" : "warn"}>
            {entry.applies === "hot" ? "hot-apply" : "recreate"}
          </Pill>
        </td>
        <td className="description">{entry.description}</td>
        <td>
          <button className="button small" onClick={reset}>
            Reset
          </button>
        </td>
      </tr>
    </>
  );
}

function Tools() {
  const [tools, setTools] = useState([]);
  const [toolName, setToolName] = useState("");
  const [forms, setForms] = useState({});
  const [responses, setResponses] = useState({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadTools();
  }, []);

  const mcpRequest = async (method, params) => {
    const t0 = performance.now();
    const response = await fetch("/console/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
    });
    const ms = performance.now() - t0;
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const bytes = new TextEncoder().encode(text).length;
    return { response, json, text, ms, bytes };
  };

  const loadTools = async () => {
    try {
      const mcp = await mcpRequest("tools/list");
      const list = mcp.json?.result?.tools || [];
      setTools(list);
      if (list.length) selectTool(list[0]);
    } catch (loadError) {
      setError(String(loadError?.message || loadError));
    }
  };

  const selectTool = (tool) => {
    setToolName(tool.name);
    const defaults = {};
    for (const [name, schema] of Object.entries(
      tool.inputSchema?.properties || {},
    )) {
      if (schema.default !== undefined) defaults[name] = schema.default;
      else if (schema.type === "boolean") defaults[name] = false;
      else if (schema.type === "array") defaults[name] = [];
      else defaults[name] = "";
    }
    setForms((current) =>
      current[tool.name] ? current : { ...current, [tool.name]: defaults },
    );
  };

  const setValue = (name, value) =>
    setForms((current) => ({
      ...current,
      [toolName]: { ...current[toolName], [name]: value },
    }));

  const activeTool = tools.find((item) => item.name === toolName) || null;
  const schema = activeTool?.inputSchema || {};
  const props = schema.properties || {};
  const form = forms[toolName] || {};
  const response = responses[toolName] || {
    output: "Select a tool and send a request.",
    status: "Response",
    images: [],
  };
  const setToolResponse = (name, updates) =>
    setResponses((current) => ({
      ...current,
      [name]: {
        output: "Select a tool and send a request.",
        status: "Response",
        images: [],
        ...current[name],
        ...updates,
      },
    }));

  const buildArguments = (properties) => {
    const args = {};
    for (const [name, propertySchema] of Object.entries(properties)) {
      const raw = form[name];
      if (propertySchema.type === "boolean") {
        args[name] = Boolean(raw);
      } else if (
        propertySchema.type === "number" ||
        propertySchema.type === "integer"
      ) {
        if (raw === "" || raw === null || raw === undefined) continue;
        args[name] = Number(raw);
      } else if (propertySchema.type === "array") {
        const values = Array.isArray(raw) ? raw : list(String(raw || ""));
        if (!values.length) continue;
        args[name] =
          propertySchema.items?.type === "number" ||
          propertySchema.items?.type === "integer"
            ? values.map((item) => Number(item))
            : values;
      } else {
        if (raw === "" || raw === null || raw === undefined) continue;
        args[name] = String(raw);
      }
    }
    return args;
  };

  const run = async () => {
    const selectedTool = toolName;
    setRunning(true);
    setToolResponse(selectedTool, {
      status: "Running...",
      images: [],
    });
    try {
      const args = buildArguments(props);
      const { response, json, text, ms, bytes } = await mcpRequest(
        "tools/call",
        { name: selectedTool, arguments: args },
      );
      const httpLabel = response.ok
        ? "200 OK"
        : `${response.status} ${response.statusText || "Error"}`;
      const extracted = extractToolResult(json, text);
      setToolResponse(selectedTool, {
        status: `${httpLabel} · ${formatMs(ms)} · ${text.length.toLocaleString()} chars (${bytes.toLocaleString()} B)`,
        output: extracted.text,
        images: extracted.images,
      });
    } catch (runError) {
      setToolResponse(selectedTool, {
        output: String(runError?.message || runError),
        status: "Request failed",
      });
    } finally {
      setRunning(false);
    }
  };

  const clear = () => {
    setToolResponse(toolName, {});
  };

  return (
    <section className="tools">
      {error ? (
        <div className="tools-error">{error}</div>
      ) : (
        <>
          <nav className="tool-tabs">
            {tools.map((tool) => (
              <button
                key={tool.name}
                className={tool.name === toolName ? "active" : ""}
                onClick={() => selectTool(tool)}
                title={tool.description}
              >
                {tool.name}
              </button>
            ))}
          </nav>
          {activeTool && (
            <div className="workspace">
              <form
                className="request"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!running) run();
                }}
              >
                <div className="pane-title">
                  <span>Request · {activeTool.name}</span>
                  <span className="method">POST /mcp</span>
                </div>
                <p className="hint">{activeTool.description}</p>
                {Object.entries(props).map(([name, propertySchema]) => (
                  <SchemaField
                    key={name}
                    name={name}
                    schema={propertySchema}
                    value={form[name]}
                    onChange={(value) => setValue(name, value)}
                  />
                ))}
                {!Object.keys(props).length && (
                  <p className="hint">This tool takes no arguments.</p>
                )}
                <button className="run" type="submit" disabled={running}>
                  {running ? "Running..." : "Send request"}
                </button>
              </form>
              <section className="response">
                <div className="response-head">
                  <span
                    className={`status ${response.status.startsWith("200") ? "ok" : response.status === "Request failed" ? "error" : ""}`}
                  >
                    {response.status}
                  </span>
                  <button className="clear" onClick={clear}>
                    Clear
                  </button>
                </div>
                <pre>{response.output}</pre>
                {response.images.map((src, index) => (
                  <img
                    key={index}
                    className="preview"
                    src={src}
                    alt={`Screenshot preview ${index + 1}`}
                  />
                ))}
                <p className="note">
                  Requests run against the MCP API with the console's internal
                  API key.
                </p>
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}
function extractToolResult(json, rawText) {
  const images = [];
  const chunks = [];
  if (json?.error) {
    chunks.push(
      `Error ${json.error.code ?? ""}: ${json.error.message || "unknown error"}`,
    );
  }
  const result = json?.result;
  if (result?.isError) chunks.push("Tool returned an error.");
  if (result?.content && Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item?.type === "image" && item?.data) {
        const dataUrl = `data:${item.mimeType || "image/png"};base64,${item.data}`;
        images.push(dataUrl);
        chunks.push("[image]");
      } else if (typeof item?.text === "string") {
        chunks.push(item.text);
      }
    }
  }
  let text = chunks.join("\n");
  if (!text.trim()) text = rawText;
  const dataUrlRegex = /data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+/g;
  for (const match of text.match(dataUrlRegex) || []) {
    if (!images.includes(match)) images.push(match);
  }
  if (images.length) text = text.replace(dataUrlRegex, "[image preview shown below]");
  return { text, images };
}
function SchemaField({ name, schema, value, onChange }) {
  const enums = Array.isArray(schema.enum) ? schema.enum : null;
  const type = schema.type;
  const hint = [
    type,
    type === "array" && schema.items?.type ? `of ${schema.items.type}` : "",
    schema.default !== undefined ? `default: ${schema.default}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  let control;
  if (type === "boolean") {
    control = (
      <Check
        label={value ? "true" : "false"}
        checked={Boolean(value)}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  } else if (enums && type !== "array") {
    control = (
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">— select —</option>
        {enums.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  } else if (type === "array" && Array.isArray(schema.items?.enum)) {
    const selected = Array.isArray(value) ? value : [];
    control = (
      <div className="check-group">
        {schema.items.enum.map((option) => (
          <Check
            key={option}
            label={option}
            checked={selected.includes(option)}
            onChange={() =>
              onChange(
                selected.includes(option)
                  ? selected.filter((item) => item !== option)
                  : [...selected, option],
              )
            }
          />
        ))}
      </div>
    );
  } else if (type === "array") {
    const asLines = Array.isArray(value) ? value.join("\n") : String(value ?? "");
    control = (
      <textarea
        value={asLines}
        placeholder={`one ${schema.items?.type || "value"} per line`}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  } else if (type === "number" || type === "integer") {
    control = (
      <input
        type="number"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  } else {
    control = (
      <input
        type="text"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <Field label={name} hint={hint}>
      {control}
    </Field>
  );
}
function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>
        {label}
        <small>{hint}</small>
      </span>
      {children}
    </label>
  );
}
function Check({ label, checked, onChange }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function Keys() {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState("");
  const [secret, setSecret] = useState("");
  const [name, setName] = useState("");
  const [allowedTools, setAllowedTools] = useState([]);
  const [creating, setCreating] = useState(false);
  const load = async () => {
    try {
      const payload = await request("/console/api-keys");
      setState(payload);
      setAllowedTools(payload.toolGroups.flatMap((group) => group.tools));
    } catch (error) {
      setMessage(error.message);
      setKind("err");
    }
  };
  useEffect(() => {
    load();
  }, []);
  const mutate = async (body, success) => {
    try {
      const next = await request("/console/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setState(next);
      setSecret(next.key || "");
      if (body.action === "create") {
        setName("");
        setCreating(false);
      }
      setMessage(success);
      setKind("ok");
    } catch (error) {
      setMessage(error.message);
      setKind("err");
    }
  };
  const openAccess = state?.allowUnauthenticated;
  const toolGroups = state?.toolGroups || [];
  const allTools = toolGroups.flatMap((group) => group.tools);
  const toggleTool = (tool) => setAllowedTools((current) =>
    current.includes(tool) ? current.filter((name) => name !== tool) : [...current, tool],
  );
  const toggleGroup = (tools) => setAllowedTools((current) =>
    tools.every((tool) => current.includes(tool))
      ? current.filter((tool) => !tools.includes(tool))
      : [...new Set([...current, ...tools])],
  );
  return (
    <section className="grid keys-grid">
      <Panel title="API keys" wide>
        <div className="api-key-list-head">
          <span>{state?.keys?.length || 0} keys</span>
          <div className="api-key-toolbar">
            <Pill tone={openAccess ? "warn" : "ok"}>
              {openAccess ? "Open access" : "Authentication required"}
            </Pill>
            <button className="button primary" onClick={() => setCreating(true)}>Add API key</button>
          </div>
        </div>
        {creating && <div className="api-key-modal-backdrop" onMouseDown={() => setCreating(false)}>
          <form
            className="api-key-modal"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) mutate({ action: "create", name: name.trim(), allowedTools }, "API key created.");
            }}
          >
            <div className="api-key-modal-head">
              <div><b>Create API key</b><small>Name it and choose exactly what it can access.</small></div>
              <button type="button" className="clear" onClick={() => setCreating(false)}>Close</button>
            </div>
            <label className="api-key-name-field">
              <span>MCP key name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. production deploy" maxLength={80} autoFocus />
            </label>
            <div className="api-key-permissions-field">
              <span>Tool access</span>
              <details className="api-key-tools" open>
                <summary>{allowedTools.length === allTools.length ? "All tools allowed" : `${allowedTools.length} of ${allTools.length} tools allowed`}</summary>
                <div className="api-key-tool-groups">
                  <div className="api-key-tool-actions">
                    <button type="button" onClick={() => setAllowedTools(allTools)}>Allow all</button>
                    <button type="button" onClick={() => setAllowedTools([])}>Clear all</button>
                  </div>
                  {toolGroups.map((group) => (
                    <div className="api-key-tool-group" key={group.id}>
                      <Check
                        label={group.label}
                        checked={group.tools.every((tool) => allowedTools.includes(tool))}
                        onChange={() => toggleGroup(group.tools)}
                      />
                      <div className="api-key-tool-items">
                        {group.tools.map((tool) => (
                          <Check key={tool} label={tool} checked={allowedTools.includes(tool)} onChange={() => toggleTool(tool)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
            <div className="api-key-modal-actions">
              <button type="button" className="button" onClick={() => setCreating(false)}>Cancel</button>
              <button className="button primary" type="submit" disabled={!name.trim()}>Create API key</button>
            </div>
          </form>
        </div>}
        {secret && (
          <div className="secret">
            <b>Copy this key now. It cannot be shown again.</b>
            <code>{secret}</code>
            <button
              className="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(secret);
                  setMessage("API key copied.");
                  setKind("ok");
                } catch {
                  setMessage("Copy failed. Select the key text manually.");
                  setKind("err");
                }
              }}
            >
              Copy key
            </button>
          </div>
        )}
        <div className="api-key-list">
          <div className="api-key-row api-key-heading">
            <span>Name</span>
            <span>Created</span>
            <span>Key</span>
            <span>Access</span>
            <span />
          </div>
          {state?.keys?.length
            ? state.keys.map((key) => (
                <div className="api-key-row" key={key.id}>
                  <b>{key.name}</b>
                  <time dateTime={new Date(key.createdAt).toISOString()}>{formatKeyDate(key.createdAt)}</time>
                  <code>{key.preview}</code>
                  <small>{key.allowedTools === null ? "all tools" : `${key.allowedTools.length} tools`}</small>
                  <button
                    className="button danger"
                    onClick={() =>
                      window.confirm(
                        "Revoke this API key? Clients using it will lose access immediately.",
                      ) && mutate({ action: "revoke", id: key.id }, "API key revoked.")
                    }
                  >
                    Revoke
                  </button>
                </div>
              ))
            : state && <Empty>No API keys created.</Empty>}
        </div>
        <p className={`message ${kind}`}>{message}</p>
      </Panel>
    </section>
  );
}

function App() {
  const [mode, setMode] = useState(() => modeFromPath(location.pathname));
  const [snapshot, setSnapshot] = useState({});
  const [paused, setPaused] = useState(false);
  const [feed, setFeed] = useState([]);
  const [history, setHistory] = useState({
    memory: [],
    slots: [],
    requests: [],
  });
  const [vncBusy, setVncBusy] = useState(false);
  const feedSince = useRef(0);
  const feedOpsSince = useRef(0);
  const navigate = (next) => {
    const path = pathForMode(next);
    if (location.pathname !== path) window.history.pushState({}, "", path);
    setMode(next);
  };
  const load = async () => {
    try {
      const [health, stats, config, logPayload, activity] = await Promise.all([
        request("/health"),
        request("/stats"),
        request("/console/config"),
        request("/console/logs?n=20"),
        request(`/stats/activity?since=${feedSince.current}&sinceOps=${feedOpsSince.current}&limit=100&pageOps=1`),
      ]);
      setFeed((current) => {
        const merged = [...current];
        for (const row of buildFeed(activity.entries, activity.pageOps)) {
          const existing = merged.findIndex((entry) => entry.key === row.key);
          if (existing === -1) merged.push(row);
          else merged[existing] = row;
        }
        return merged.sort((a, b) => Number(b.ts) - Number(a.ts)).slice(0, 200);
      });
      for (const entry of activity.entries || []) {
        feedSince.current = Math.max(feedSince.current, Number(entry.id) || 0);
      }
      for (const op of activity.pageOps || []) {
        feedOpsSince.current = Math.max(feedOpsSince.current, Number(op.id) || 0);
      }
      setSnapshot({
        health,
        stats,
        config,
        logs: logPayload.entries || [],
        ok: true,
      });
      setHistory((current) => ({
        memory: [...current.memory, stats.memory?.rss || 0].slice(-60),
        slots: [...current.slots, health.pageLimiter?.inUse || 0].slice(-60),
        requests: [
          ...current.requests,
          stats.requests?.byPeriod?.["5m"]?.total || 0,
        ].slice(-60),
      }));
    } catch {
      setSnapshot((current) => ({ ...current, ok: false }));
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (paused) return undefined;
    const interval = setInterval(() => {
      if (!document.hidden) load();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [paused]);
  useEffect(() => {
    const onPop = () => setMode(modeFromPath(location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const toggleVnc = async () => {
    setVncBusy(true);
    try {
      await request("/console/vnc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: snapshot.health?.vnc?.running ? "disable" : "enable",
        }),
      });
      await load();
    } finally {
      setVncBusy(false);
    }
  };
  return (
    <Layout
      mode={mode}
      setMode={navigate}
      telemetry={snapshot}
      paused={paused}
      setPaused={setPaused}
      vnc={snapshot.health?.vnc}
      toggleVnc={toggleVnc}
      vncBusy={vncBusy}
    >
      {mode === "status" ? (
        <StatusView
          snapshot={snapshot}
          history={history}
          toggleVnc={toggleVnc}
          vncBusy={vncBusy}
          feed={feed}
        />
      ) : mode === "manage" ? (
        <Manage config={snapshot.config || {}} reload={load} />
      ) : mode === "tools" ? (
        <Tools />
      ) : mode === "keys" ? (
        <Keys />
      ) : (
        <StatusView
          snapshot={snapshot}
          history={history}
          toggleVnc={toggleVnc}
          vncBusy={vncBusy}
          feed={feed}
        />
      )}
    </Layout>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
