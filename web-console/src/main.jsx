import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import logo from "./navigator.png";

const POLL_MS = 2000;
const CATEGORIES = {
  backend: "Backend",
  search: "Search",
  ops: "Ops / Timeouts",
  console: "HTTP / Console",
  vnc: "VNC",
};
const BACKEND_SUBGROUP = {
  CHROME_PATH: "chrome",
  CHROME_USER_DATA_DIR: "chrome",
  CHROME_PROFILE_DIR: "chrome",
  LIGHTPANDA_PATH: "lightpanda",
  LIGHTPANDA_PORT: "lightpanda",
  CLOAKBROWSER_BINARY_PATH: "cloakbrowser",
  PRELAUNCH_BROWSER: "launch",
  STARTUP_URL: "launch",
  BROWSER_USER_AGENT: "launch",
};
const BACKEND_GROUP_LABELS = {
  core: "Backend",
  chrome: "Backend — Chrome",
  lightpanda: "Backend — Lightpanda",
  cloakbrowser: "Backend — Cloakbrowser",
  launch: "Backend — Launch",
};
const groupKeyOf = (entry) =>
  entry.category === "backend"
    ? BACKEND_SUBGROUP[entry.key] || "core"
    : entry.category;
const groupLabelOf = (groupKey) =>
  BACKEND_GROUP_LABELS[groupKey] || CATEGORIES[groupKey] || groupKey;
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
          <>
            <button
              className={`button ${vnc?.running ? "vnc-on" : ""}`}
              disabled={vncBusy}
              onClick={toggleVnc}
            >
              {vncBusy
                ? "Working..."
                : vnc?.running
                  ? "Disable VNC"
                  : "Enable VNC"}
            </button>
            <button
              className="button"
              disabled={!vnc?.running}
              onClick={() =>
                window.open(
                  `http://${location.hostname}:${vnc.novncPort}/vnc.html`,
                  "_blank",
                  "noopener",
                )
              }
            >
              Open VNC
            </button>
          </>
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
  const exposed = engines.filter((item) => item.exposedInMcp);
  const unavailable = circuits.filter((item) => item.remainingMs > 0).length;
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
            value={`${Math.max(0, exposed.length - unavailable)}/${exposed.length}`}
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
        <Engines config={config} health={health} stats={stats} />
        <Drivers health={health} instances={instances} />
        <Runtime health={health} stats={stats} history={history} />
        <Work stats={stats} />
        <LiveFeed feed={feed} />
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
  const warmup = new Set(config.config?.searchRouteWarmupEngines || []);
  const fallback = new Set(config.config?.searchFallback || []);
  const rateFor = (id) => {
    const period = attempts[id]?.byPeriod?.["24h"] || attempts[id] || {};
    const tried = (period.ok || 0) + (period.fail || 0);
    return tried ? { tried, rate: (period.ok || 0) / tried } : { tried: 0, rate: 0 };
  };
  const engines = [...(config.engines || [])].sort((a, b) => {
    const openA = Boolean(circuits.get(`${a.id}/${a.backend}`)?.remainingMs);
    const openB = Boolean(circuits.get(`${b.id}/${b.backend}`)?.remainingMs);
    if (openA !== openB) return openA ? 1 : -1;
    const rateA = rateFor(a.id);
    const rateB = rateFor(b.id);
    if (rateA.tried !== rateB.tried) return rateA.tried ? -1 : 1;
    return rateB.rate - rateA.rate;
  });
  if (!engines.length)
    return (
      <Panel title="Search engines" wide>
        <Empty>No engine registry is available yet.</Empty>
      </Panel>
    );
  let healthy = 0;
  let recovering = 0;
  let unavailable = 0;
  const ranked = engines.filter(
    (item) => item.exposedInMcp && !circuits.get(`${item.id}/${item.backend}`)?.remainingMs,
  );
  const mostWorking = ranked
    .filter((item) => rateFor(item.id).tried > 0)
    .sort((a, b) => rateFor(b.id).rate - rateFor(a.id).rate)[0];
  return (
    <Panel
      title="Search engines"
      sub="routes for the next search — best working first"
      wide
    >
      <div className="engine-summary">
        <b>{engines.filter((item) => item.exposedInMcp).length}</b> configured
        routes
        {mostWorking && (
          <span className="most-working">
            ★ most working: {mostWorking.id} (
            {Math.round(rateFor(mostWorking.id).rate * 100)}% over 24h)
          </span>
        )}
      </div>
      <div className="engine-grid">
        {engines.map((engine) => {
          const circuit = circuits.get(`${engine.id}/${engine.backend}`);
          const stat = attempts[engine.id] || {};
          const attempted = (stat.ok || 0) + (stat.fail || 0);
          const { rate } = rateFor(engine.id);
          let tone = "ok";
          let route = "closed";
          if (circuit?.remainingMs > 0) {
            tone = "err";
            route = `open · retry ${Math.ceil(circuit.remainingMs / 1000)}s`;
            unavailable += 1;
          } else if (circuit?.state === "half_open") {
            tone = "warn";
            route = "recovering";
            recovering += 1;
          } else if (!engine.exposedInMcp) {
            tone = "off";
            route = "internal";
          } else healthy += 1;
          const pool =
            health.searchWindows?.byEngine?.[
              engine.pool === "shared" ? "_shared" : engine.id
            ];
          const role = warmup.has(engine.id)
            ? "primary"
            : fallback.has(engine.id)
              ? "fallback"
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
                  {engine.id}{" "}
                  {engine.id === mostWorking?.id && (
                    <Pill tone="best">★ most working</Pill>
                  )}
                  <Pill tone={tone}>{route}</Pill>
                </div>
                <div className="engine-meta">
                  {engine.backend} · {role} ·{" "}
                  {pool
                    ? `${pool.inUse}/${pool.total} windows${pool.pending ? ` · ${pool.pending} opening` : ""}`
                    : "no window"}
                </div>
                <div className="engine-success">
                  <span
                    className="engine-bar"
                    style={{
                      background: tone === "err" ? "#f43f5e" : tone === "warn" ? "#f59e0b" : "#35e07a",
                      width: `${tone === "err" ? 4 : Math.max(4, pct)}%`,
                    }}
                  />
                  <span className="engine-pct">
                    {attempted ? `${pct}%` : "no attempts"}
                  </span>
                </div>
              </div>
              <div className="engine-stats">
                <b>{stat.results || 0}</b> results · {stat.ok || 0} ok ·{" "}
                {stat.fail || 0} failed · {stat.skip || 0} skipped · 24h
              </div>
            </div>
          );
        })}
      </div>
      <div className="engine-summary">
        {healthy} ready · {recovering} recovering · {unavailable} unavailable
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
function buildFeed(entries, pageOps) {
  const rows = [];
  for (const search of entries || []) {
    rows.push({
      key: `s-${search.id}`,
      ts: search.ts,
      kind: "search",
      status: search.status || "",
      label: String(search.query || "").slice(0, 80),
      note: [
        search.requested_engine || "select_best",
        search.result_count != null ? `${search.result_count} results` : "",
        search.duration_ms != null ? formatMs(search.duration_ms) : "",
        search.error ? "error" : "",
      ]
        .filter(Boolean)
        .join(" · "),
    });
    for (const attempt of search.attempts || []) {
      rows.push({
        key: `a-${attempt.id}`,
        ts: attempt.ts,
        kind: "attempt",
        status: attempt.status || "",
        label: `${attempt.engine}${attempt.backend ? ` (${attempt.backend})` : ""}`,
        note: [
          attempt.status === "ok" ? `${attempt.result_count || 0} results` : attempt.error || attempt.status,
          attempt.duration_ms != null ? formatMs(attempt.duration_ms) : "",
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }
  }
  for (const op of pageOps || []) {
    rows.push({
      key: `p-${op.id}`,
      ts: op.ts,
      kind: "page_op",
      status: op.ok ? "ok" : "fail",
      label: op.tool || "page",
      note: [
        String(op.url || "").slice(0, 70),
        op.duration_ms != null ? formatMs(op.duration_ms) : "",
        op.error || "",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }
  return rows.sort((a, b) => Number(b.ts) - Number(a.ts));
}
function LiveFeed({ feed }) {
  const [showPageOps, setShowPageOps] = useState(true);
  const [limit, setLimit] = useState(25);
  const rows = (feed || []).filter((entry) => showPageOps || entry.kind !== "page_op");
  const visible = rows.slice(0, limit);
  return (
    <Panel
      title="Live activity"
      sub={
        <label className="feed-toggle">
          <input
            type="checkbox"
            checked={showPageOps}
            onChange={(event) => setShowPageOps(event.target.checked)}
          />
          show page fetches
        </label>
      }
      wide
    >
      {visible.length ? (
        <>
          <div className="feed">
            {visible.map((entry) => (
              <div
                className={`feed-row ${entry.status === "ok" ? "ok" : entry.status === "fail" || entry.status === "error" ? "fail" : ""}`}
                key={entry.key || `${entry.kind}-${entry.ts}`}
              >
                <span className="feed-time">{formatTime(entry.ts)}</span>
                <span className="feed-kind">
                  {entry.kind === "search" ? "search" : entry.kind === "page_op" ? "page" : "engine"}
                </span>
                <span className="feed-label" title={entry.note}>
                  {entry.label}
                </span>
                <span className="feed-note">{entry.note}</span>
              </div>
            ))}
          </div>
          {rows.length > limit && (
            <button className="feed-more" onClick={() => setLimit((current) => current + 40)}>
              show more
            </button>
          )}
        </>
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
function EngineMultiSelect({ engines, value, changed, ok, message, onChange }) {
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
        aria-label="engines value"
        onClick={() => setOpen(!open)}
      >
        <span className="engine-selected">
          {selected.length ? selected.join(", ") : "Select engines…"}
        </span>
        <span className="engine-caret">{open ? "▴" : "▾"}</span>
      </button>
      {open && pos && (
        <div
          ref={panelRef}
          className="engine-panel"
          style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight }}
        >
          {engines.map((engine) => (
            <label key={engine.id} className="engine-option">
              <input
                type="checkbox"
                checked={selected.includes(engine.id)}
                onChange={() => toggle(engine.id)}
              />
              <span>{engine.id}</span>
            </label>
          ))}
        </div>
      )}
      {!ok && <div className="field-error">{message}</div>}
    </>
  );
}
function ValueControl({ entry, value, changed, engines, onChange }) {
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
      <EngineMultiSelect
        engines={engines || []}
        value={value}
        changed={changed}
        ok={ok}
        message={message}
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
  let group = "";
  const engineIds = new Set((config.engines || []).map((engine) => engine.id));
  const invalidCount = (config.schema || []).filter(
    (entry) => !validateEntryValue(entry, draft[entry.key] ?? "", engineIds).ok,
  ).length;
  const q = query.trim().toLowerCase();
  const filteredSchema = (config.schema || []).filter((entry) => {
    if (!q) return true;
    return (
      entry.key.toLowerCase().includes(q) ||
      String(entry.fallback ?? "").toLowerCase().includes(q) ||
      String(entry.description ?? "").toLowerCase().includes(q) ||
      String(CATEGORIES[entry.category] || entry.category).toLowerCase().includes(q)
    );
  });
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
              <th>Effective</th>
              <th>Applies</th>
              <th>Description</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filteredSchema.map((entry) => {
            const groupKey = groupKeyOf(entry);
            const heading = groupKey !== group;
            group = groupKey;
            const fallback = Array.isArray(entry.fallback)
              ? entry.fallback.join(",")
              : String(entry.fallback ?? "");
            const effective = config.config?.[entry.key.toLowerCase()];
            return (
              <FragmentRows
                key={entry.key}
                heading={heading}
                label={groupLabelOf(groupKey)}
                entry={entry}
                fallback={fallback}
                effective={effective}
                value={draft[entry.key] ?? ""}
                changed={changed.some((item) => item.key === entry.key)}
                engines={config.engines || []}
                onChange={(value) => setDraft({ ...draft, [entry.key]: value })}
                reset={() =>
                  save(
                    { reset: [entry.key] },
                    `${entry.key} reset to its default`,
                  )
                }
              />
            );
          })}
          {!filteredSchema.length && (
            <tr className="section">
              <td colSpan="7">No variables match “{query}”.</td>
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
  entry,
  fallback,
  effective,
  value,
  changed,
  engines,
  onChange,
  reset,
}) {
  return (
    <>
      {heading && (
        <tr className="section">
          <td colSpan="7">{label}</td>
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
            onChange={onChange}
          />
        </td>
        <td className="val-eff">
          {Array.isArray(effective)
            ? effective.join(",")
            : String(effective ?? "")}
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
  const [form, setForm] = useState({});
  const [output, setOutput] = useState("Select a tool and send a request.");
  const [status, setStatus] = useState("Response");
  const [meta, setMeta] = useState("");
  const [running, setRunning] = useState(false);
  const [images, setImages] = useState([]);
  const [error, setError] = useState("");
  const apiKeyRef = useRef("");

  useEffect(() => {
    loadTools();
  }, []);

  const mcpRequest = async (method, params) => {
    const t0 = performance.now();
    const response = await fetch("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKeyRef.current}`,
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
      const payload = await request("/console/api-keys");
      apiKeyRef.current = payload.consoleKey || "";
      const mcp = await mcpRequest("tools/list");
      const list = mcp.json?.result?.tools || [];
      setTools(list);
      if (list.length) selectTool(list[0]);
    } catch (loadError) {
      setError(String(loadError?.message || loadError));
      setOutput("Failed to load tool definitions from the MCP API.");
    }
  };

  const selectTool = (tool) => {
    setToolName(tool.name);
    setOutput("Select a tool and send a request.");
    setStatus("Response");
    setMeta("");
    setImages([]);
    const defaults = {};
    for (const [name, schema] of Object.entries(
      tool.inputSchema?.properties || {},
    )) {
      if (schema.default !== undefined) defaults[name] = schema.default;
      else if (schema.type === "boolean") defaults[name] = false;
      else if (schema.type === "array") defaults[name] = [];
      else defaults[name] = "";
    }
    setForm(defaults);
  };

  const setValue = (name, value) =>
    setForm((current) => ({ ...current, [name]: value }));

  const activeTool = tools.find((item) => item.name === toolName) || null;
  const schema = activeTool?.inputSchema || {};
  const props = schema.properties || {};

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
    setRunning(true);
    setStatus("Running...");
    setMeta("");
    setImages([]);
    try {
      const args = buildArguments(props);
      const { response, json, text, ms, bytes } = await mcpRequest(
        "tools/call",
        { name: toolName, arguments: args },
      );
      const httpLabel = response.ok
        ? "200 OK"
        : `${response.status} ${response.statusText || "Error"}`;
      setStatus(
        `${httpLabel} · ${formatMs(ms)} · ${text.length.toLocaleString()} chars (${bytes.toLocaleString()} B)`,
      );
      setMeta(`${formatMs(ms)} · ${text.length.toLocaleString()} chars · ${bytes.toLocaleString()} B`);
      const extracted = extractToolResult(json, text);
      setOutput(extracted.text);
      setImages(extracted.images);
    } catch (runError) {
      setOutput(String(runError?.message || runError));
      setStatus("Request failed");
    } finally {
      setRunning(false);
    }
  };

  const clear = () => {
    setOutput("Select a tool and send a request.");
    setStatus("Response");
    setMeta("");
    setImages([]);
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
              <aside className="request">
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
                <button className="run" disabled={running} onClick={run}>
                  {running ? "Running..." : "Send request"}
                </button>
              </aside>
              <section className="response">
                <div className="response-head">
                  <span
                    className={`status ${status.startsWith("200") ? "ok" : status === "Request failed" ? "error" : ""}`}
                  >
                    {status}
                  </span>
                  <button className="clear" onClick={clear}>
                    Clear
                  </button>
                </div>
                <pre>{output}</pre>
                {images.map((src, index) => (
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
  const load = async () => {
    try {
      setState(await request("/console/api-keys"));
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
      setMessage(success);
      setKind("ok");
    } catch (error) {
      setMessage(error.message);
      setKind("err");
    }
  };
  const locked = state && !state.allowUnauthenticated;
  return (
    <section className="grid keys-grid">
      <Panel title="Request access">
        <div className="access">
          <div>
            <p>
              {state
                ? locked
                  ? "Every HTTP MCP request must include a valid API key."
                  : "HTTP MCP requests can be made with or without an API key."
                : "Loading authentication settings..."}
            </p>
          </div>
          <Pill tone={locked ? "ok" : "warn"}>
            {locked ? "Keys required" : "Open access"}
          </Pill>
        </div>
      </Panel>
      <Panel title="Unauthenticated requests">
        <label className="switch">
          <input
            type="checkbox"
            checked={state?.allowUnauthenticated || false}
            onChange={(event) =>
              mutate(
                {
                  action: "set_allow_unauthenticated",
                  allowUnauthenticated: event.target.checked,
                },
                event.target.checked
                  ? "Unauthenticated MCP requests are allowed."
                  : "API keys are now required for MCP requests.",
              )
            }
          />
          <span>
            <b>Allow requests without an API key</b>
            <small>
              Turn this off to require `Authorization: Bearer &lt;key&gt;` or
              `X-API-Key` on every `/mcp` request.
            </small>
          </span>
        </label>
        <p className="warning">
          Keep `/console` behind a trusted network or reverse-proxy access
          control.
        </p>
        <p className={`message ${kind}`}>{message}</p>
      </Panel>
      <Panel title="Console internal key" wide>
        {state?.consoleKey ? (
          <div className="secret">
            <b>This key lets the console talk to the MCP API.</b>
            <code>{state.consoleKey}</code>
            <button
              className="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.consoleKey);
                  setMessage("Console key copied.");
                  setKind("ok");
                } catch {
                  setMessage("Copy failed. Select the key text manually.");
                  setKind("err");
                }
              }}
            >
              Copy key
            </button>
            <small>
              Generated at server start. The Web tools page uses it
              automatically — it never leaves this server.
            </small>
          </div>
        ) : (
          <Empty>Console key unavailable.</Empty>
        )}
      </Panel>
      <Panel title="API keys" wide>
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
        <p>
          Generated secrets are shown once. Save them in your MCP client; the
          console only keeps a masked preview.
        </p>
        <div className="key-list">
          {state?.keys?.length
            ? state.keys.map((key) => (
                <div className="key" key={key.id}>
                  <code>{key.preview}</code>
                  <button
                    className="button danger"
                    onClick={() =>
                      window.confirm(
                        "Revoke this API key? Clients using it will lose access immediately.",
                      ) &&
                      mutate(
                        { action: "revoke", id: key.id },
                        "API key revoked.",
                      )
                    }
                  >
                    Revoke
                  </button>
                </div>
              ))
            : state && <Empty>No API keys created.</Empty>}
        </div>
        <button
          className="button primary"
          onClick={() =>
            mutate(
              { action: "create" },
              "API key created and enabled immediately.",
            )
          }
        >
          Create API key
        </button>
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
          if (!merged.some((existing) => existing.key === row.key)) merged.push(row);
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
      ) : (
        <Keys />
      )}
    </Layout>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
