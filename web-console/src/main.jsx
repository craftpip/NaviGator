import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import logo from "./navigator.png";
import { renderMarkdown } from "./markdown.js";

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
function errorLogKey(entry) {
  const firstLine = String(entry?.error || entry?.message || "")
    .split("\n")[0]
    .slice(0, 120);
  return `${entry?.tool || ""}\u0000${firstLine}`;
}
function mergeErrorLogs(fileLogs, recentErrors) {
  const seen = new Set(fileLogs.map(errorLogKey));
  const requestErrors = (recentErrors || []).map((entry) => ({
    ts: new Date(Date.now() - (entry.minutesAgo || 0) * 60000).toISOString(),
    level: "request_error",
    transport: "requestLog",
    tool: entry.tool,
    error: entry.error,
  }));
  return [...fileLogs, ...requestErrors.filter((entry) => !seen.has(errorLogKey(entry)))].sort(
    (a, b) => String(b.ts).localeCompare(String(a.ts)),
  );
}
async function request(path, options) {
  const response = await fetch(path, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || "Request failed");
    if (data.validation) error.validation = data.validation;
    throw error;
  }
  return data;
}
function modeFromPath(pathname) {
  if (pathname === "/console/tools" || pathname === "/console/api")
    return "tools";
  if (pathname === "/console/manage") return "manage";
  if (pathname === "/console/keys") return "keys";
  if (pathname === "/console/hints" || pathname.startsWith("/console/hints/"))
    return "hints";
  return "status";
}
function editorFromPath(pathname) {
  if (pathname === "/console/hints/new") return { index: null };
  const match = pathname.match(/^\/console\/hints\/edit\/(\d+)$/);
  if (match) return { index: Number(match[1]) };
  return null;
}
function pathForMode(mode) {
  if (mode === "tools") return "/console/tools";
  if (mode === "manage") return "/console/manage";
  if (mode === "keys") return "/console/keys";
  if (mode === "hints") return "/console/hints";
  return "/console";
}

function useNarrow(breakpoint = 720) {
  const query = `(max-width: ${breakpoint}px)`;
  const [narrow, setNarrow] = useState(
    () => window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = (event) => setNarrow(event.matches);
    mq.addEventListener("change", update);
    setNarrow(mq.matches);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return narrow;
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
  const narrow = useNarrow(720);
  return (
    <main className="app">
      <header>
        <div className="hdr-left">
          <a className="logo" href="/console">
            <img className="logo-img" src={logo} alt="Navigator logo" />
            NAVIGATOR <span>{title}</span>
          </a>
          {title === "CONSOLE" && (
            <>
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
        </div>
        <div className="hdr-spacer" />
        <div className="hdr-right">
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
              <button
                className={mode === "hints" ? "active" : ""}
                onClick={() => setMode("hints")}
              >
                Domain hints
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
          {toggleVnc && (
            vncBusy ? (
              <button className="button" disabled>
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
                  {narrow ? "Open" : "Open Remote Desktop"}
                </button>
                <button className="button danger" onClick={toggleVnc}>
                  {narrow ? "Close" : "Close Remote Desktop"}
                </button>
              </div>
            ) : (
              <button className="button" onClick={toggleVnc}>
                {narrow ? "VNC" : "Enable Remote Desktop"}
              </button>
            )
          )}
          {title === "CONSOLE" && setPaused && (
            <button
              className={`button live-toggle ${paused ? "paused" : status}`}
              onClick={() => setPaused(!paused)}
              title="Pause live polling"
            >
              <i />
              {paused ? "PAUSED" : telemetry.ok ? "LIVE 2s" : "OFFLINE"}
              {paused ? "[▶]" : "[⏸]"}
            </button>
          )}
        </div>
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

const REQUEST_SERIES = [
  { key: "web-ok", label: "Web succeeded", color: "var(--series-web-ok)" },
  { key: "web-fail", label: "Web failed", color: "var(--series-web-fail)" },
  { key: "devtools-ok", label: "DevTools succeeded", color: "var(--series-devtools-ok)" },
  { key: "devtools-fail", label: "DevTools failed", color: "var(--series-devtools-fail)" },
];
function requestValue(bucket, key) {
  const [category, status] = key.split("-");
  return bucket[category]?.[status] || 0;
}
function formatTrendLabel(ts, range) {
  const date = new Date(ts);
  return range === "week" || range === "day"
    ? date.toLocaleString([], { weekday: range === "week" ? "short" : undefined, hour: "2-digit", minute: "2-digit", hour12: false })
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
function ActivityLineChart({ buckets, range }) {
  const [selected, setSelected] = useState(null);
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const next = el.clientWidth ? el.clientWidth / 800 : 1;
      setScale(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = Math.max(1, ...buckets.flatMap((bucket) => REQUEST_SERIES.map((series) => requestValue(bucket, series.key))));
  const width = 800;
  const height = 260;
  const left = 38;
  const right = 10;
  const top = 8;
  const bottom = 32;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const active = selected === null ? buckets.length - 1 : selected;
  const bucket = buckets[active] || null;
  const xFor = (index) => (buckets.length === 1 ? left + plotWidth / 2 : left + (index / (buckets.length - 1)) * plotWidth);
  const yFor = (value) => top + plotHeight - (value / max) * plotHeight;
  const pointsFor = (series) => buckets.map((item, index) => `${xFor(index)},${yFor(requestValue(item, series.key))}`).join(" ");
  const every = Math.max(1, Math.ceil(buckets.length / 4));
  return <>
    <div className="request-trend-chart" ref={wrapRef} role="img" aria-label="Web and DevTools request line graph" style={{ "--tscale": scale }}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {[0, 0.5, 1].map((ratio) => {
          const y = top + plotHeight - ratio * plotHeight;
          return <g key={ratio}><line className="request-trend-grid" x1={left} x2={width - right} y1={y} y2={y} /><text x={left - 5} y={y + 4} textAnchor="end">{Math.round(max * ratio)}</text></g>;
        })}
        {REQUEST_SERIES.map((series) => (
          <g key={series.key}>
            <polyline className="request-trend-line" style={{ "--series": series.color }} points={pointsFor(series)} />
            {buckets.map((item, index) => (
              <circle key={item.ts} className="request-trend-dot" cx={xFor(index)} cy={yFor(requestValue(item, series.key))} r={active === index ? 3.5 : 2.25} style={{ "--series": series.color }} />
            ))}
          </g>
        ))}
        {buckets.map((item, index) => {
          const x = xFor(index);
          const half = buckets.length > 1 ? plotWidth / (buckets.length - 1) / 2 : plotWidth / 2;
          return <g key={item.ts} onMouseEnter={() => setSelected(index)} onFocus={() => setSelected(index)} onClick={() => setSelected(index)} tabIndex="0"><title>{formatTrendLabel(item.ts, range)}</title><rect className="request-trend-hit" x={x - half} y={top} width={half * 2} height={plotHeight} />{(index === 0 || index === buckets.length - 1 || index % every === 0) && <text className="request-trend-label" x={x} y={height - 8} textAnchor="middle">{formatTrendLabel(item.ts, range)}</text>}</g>;
        })}
        {bucket && (() => {
          const text = `${formatTrendLabel(bucket.ts, range)} · Web ${bucket.web?.ok || 0} ok / ${bucket.web?.fail || 0} fail · DevTools ${bucket.devtools?.ok || 0} ok / ${bucket.devtools?.fail || 0} fail`;
          const rectW = (text.length * 6 + 16) / scale;
          const rectH = 18 / scale;
          const bx = width - right - rectW;
          const by = top + 2 / scale;
          return <g className="request-trend-readout">
            <rect x={bx} y={by} width={rectW} height={rectH} rx={4 / scale} />
            <text x={bx + 8 / scale} y={by + 13 / scale}>{text}</text>
          </g>;
        })()}
      </svg>
      </div>
    <div className="request-trend-detail" aria-live="polite">{bucket ? `${formatTrendLabel(bucket.ts, range)}: Web ${bucket.web.ok} succeeded / ${bucket.web.fail} failed; DevTools ${bucket.devtools.ok} succeeded / ${bucket.devtools.fail} failed.` : "Hover or select a time point for exact counts."}</div>
  </>;
}
function RequestActivityTrend({ trend, range, error, setRange }) {
  const buckets = trend?.buckets || [];
  return (
    <section className="panel request-trend">
      <div className="request-trend-heading">
        <div>
          <h2>Request activity <span className="sub">incoming requests and engine attempts</span></h2>
          <div className="request-trend-summary">
            <b>{trend?.summary?.total || 0} total</b>
            <span>{trend?.summary?.ok || 0} succeeded</span>
            <span className={trend?.summary?.fail ? "request-trend-fail" : ""}>{trend?.summary?.fail || 0} failed</span>
          </div>
        </div>
        <div className="request-trend-actions">
          <div className="request-trend-controls" aria-label="Request activity filters">
            {["minutes", "hour", "day", "week"].map((item) => (
              <button key={item} className={range === item ? "active" : ""} aria-pressed={range === item} onClick={() => setRange(item)}>
                {{ minutes: "15 minutes", hour: "1 hour", day: "24 hours", week: "7 days" }[item]}
              </button>
            ))}
          </div>
          <div className="request-trend-key" aria-label="Request outcome legend">
            {REQUEST_SERIES.map((series) => <span key={series.key}><i style={{ "--series": series.color }} />{series.label}</span>)}
          </div>
        </div>
      </div>
      {error ? <Empty>Could not load activity trend: {error}</Empty> : !buckets.length ? <Empty>Loading activity trend…</Empty> : (
        <ActivityLineChart buckets={buckets} range={range} />
      )}
    </section>
  );
}

function computeStatus(health, stats, ok) {
  const issues = [];
  let level = "ok";
  const mark = (next, text, extra) => {
    issues.push({ level: next, text, ...(extra || {}) });
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
    mark("degraded", `${errors.length} recent web browsing error(s)`, {
      detail: errors,
    });
  return { level, issues };
}

function StatusView({ snapshot, history, toggleVnc, vncBusy, feed, trend, trendRange, trendError, setTrendRange }) {
  const { health = {}, stats = {}, config = {}, logs = [], ok } = snapshot;
  const instances = stats.instances || [];
  const engines = config.engines || [];
  const state = computeStatus(health, stats, ok);
  const [expandedIssue, setExpandedIssue] = useState(null);
  const usage = stats.usage || {};
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
            label="Total searches"
            value={(usage.searches || 0).toLocaleString()}
          />
          <Metric
            label="Total web fetches"
            value={(usage.fetches || 0).toLocaleString()}
          />
          <Metric
            label="Total screenshots"
            value={(usage.screenshots || 0).toLocaleString()}
          />
          <Metric
            label="Total results served"
            value={(usage.resultsServed || 0).toLocaleString()}
          />
          <Metric
            label="Total tool calls"
            value={(usage.toolCalls || 0).toLocaleString()}
          />
        </section>
      </section>
      <RequestActivityTrend
        trend={trend}
        range={trendRange}
        error={trendError}
        setRange={setTrendRange}
      />
      {state.level !== "ok" && (
        <section
          className={`attention show ${state.level === "critical" ? "critical" : ""}`}
        >
          <strong>
            {state.level === "critical" ? "Action needed" : "Heads up"}
          </strong>
          <div className="attention-items">
            {state.issues.slice(0, 4).map((issue, index) => (
              <div
                className={`attention-item${issue.detail?.length ? " expandable" : ""}`}
                key={`${issue.text}-${index}`}
              >
                {issue.detail?.length ? (
                  <button
                    className="attention-toggle"
                    aria-expanded={expandedIssue === index}
                    onClick={() =>
                      setExpandedIssue(expandedIssue === index ? null : index)
                    }
                  >
                    <span className="attention-caret">
                      {expandedIssue === index ? "▾" : "▸"}
                    </span>
                    {issue.text}
                  </button>
                ) : (
                  issue.text
                )}
                {expandedIssue === index && issue.detail?.length ? (
                  <div className="attention-detail">
                    {issue.detail.map((entry, j) => (
                      <div className="attention-error" key={j}>
                        <span className="attention-error-tool">{entry.tool}</span>
                        <span className="attention-error-time">
                          {entry.minutesAgo}m ago
                        </span>
                        <div className="attention-error-msg">{entry.error}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
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
      {note && <span className="metric-note">{note}</span>}
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
          const errMsg = circuit?.lastError || (schedulerState !== "ready" ? profile.lastError : "");
          return (
            <div
              className="engine engine-row"
              key={engine.id}
              title={errMsg || ""}
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
                  <span title="Scheduler eligibility state — ready means the route can be dispatched right now"><b>{schedulerState.replace("_", " ")}</b> eligibility</span>
                  <span className={profile.consecutiveFailures ? "score-error" : ""} title="Consecutive failed attempts since the last success"><b>{profile.consecutiveFailures || 0}</b> failure streak</span>
                  <span title={`Median latency of the last ${profile.latencySamples?.length || 0} sample(s)`}><b>{profile.medianLatencyMs ? formatMs(profile.medianLatencyMs) : "unmeasured"}</b> latency/{profile.latencySamples?.length || 0}</span>
                  <span title="Time until this route can be dispatched again (pacing gap)"><b>{dispatchWaitMs ? formatCountdown(dispatchWaitMs) : "now"}</b> dispatch wait</span>
                  {schedulerState === "cooling_down" && <span className="score-error" title="Time remaining before this cooling-down route can retry"><b>{formatCountdown(profile.remainingMs)}</b> retry wait</span>}
                  <span title="Attempt tallies: ok = returned results, fail = errored or zero results, skip = never tried (e.g. circuit open)"><b>{stat.ok || 0}/{stat.fail || 0}/{stat.skip || 0}</b> ok/fail/skip</span>
                  <span title={attempted ? `${pct}% success rate over the last 24 hours` : "No search attempts recorded in the last 24 hours"}><b>{attempted ? `${pct}%` : "-"}</b> · 24h</span>
                </div>
                {errMsg && schedulerState !== "ready" && (
                  <div className="engine-route-error" title={errMsg}>{errMsg}</div>
                )}
              </div>
              <div className="engine-stats">
                <b>{stat.results || 0}</b> results
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
  const availableEngines = config.availableEngines || config.engines || [];
  const engineIds = new Set(availableEngines.map((engine) => engine.id));
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
                engines={availableEngines}
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
  const [viewMode, setViewMode] = useState("markdown");

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
                  <div className="view-toggle" role="group" aria-label="Response view">
                    <button
                      className={viewMode === "markdown" ? "active" : ""}
                      onClick={() => setViewMode("markdown")}
                      title="Show the raw markdown response"
                    >
                      Markdown
                    </button>
                    <button
                      className={viewMode === "html" ? "active" : ""}
                      onClick={() => setViewMode("html")}
                      title="Render the markdown response as HTML"
                    >
                      HTML
                    </button>
                  </div>
                  <button className="clear" onClick={clear}>
                    Clear
                  </button>
                </div>
                {viewMode === "html" ? (
                  <div
                    className="response-html"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(response.output) }}
                  />
                ) : (
                  <pre>{response.output}</pre>
                )}
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
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
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

/* ---------- Domain hints panel ---------- */

const HINT_PRIORITIES = ["high", "medium", "low"];
const HINT_FORMATS = ["text", "list", "markdown", "html", "html_to_markdown", "readability_to_markdown"];
const HINT_BLOCK_FORMATS = [
  "text",
  "list",
  "html",
  "html_to_markdown",
  "readability_to_markdown",
  "table",
  "table_json",
  "table_csv",
];
const FLOW_ACTIONS = ["extract", "click", "wait", "type", "navigate"];
const FLOW_STATES = ["visible", "attached", "hidden"];
const FLOW_ACTION_LABELS = {
  extract: "Extract (capture content)",
  click: "Click (interact)",
  wait: "Wait (gate)",
  type: "Type (input)",
  navigate: "Navigate (go to URL)",
};
function emptyHint() {
  return {
    domain: "",
    pathPattern: "/**",
    comment: "",
    testUrls: [],
    waitForSelector: [],
    skipSelectors: [],
    preferReadability: true,
    contentSelectors: [],
    content: {},
    flowOptions: {},
  };
}

function hintKey(hint) {
  return `${hint?.domain || "?"} ${hint?.pathPattern || "/**"}`;
}

function modeFromHint(hint) {
  if (hint?.flow?.length) return "flow";
  if (hint?.content?.blocks?.length || hint?.content?.sections?.length) return "content";
  return "default";
}

function hintMeta(hint) {
  const parts = [];
  if (hint?.pageType) parts.push(hint.pageType);
  if (hint?.requireSelector) parts.push(`require: ${hint.requireSelector}`);
  if (hint?.flow?.length) {
    parts.push(`flow: ${hint.flow.length} step${hint.flow.length === 1 ? "" : "s"}`);
  } else if (hint?.content?.blocks?.length) {
    parts.push(`${hint.content.blocks.length} block${hint.content.blocks.length === 1 ? "" : "s"}`);
  } else if (hint?.content?.sections?.length) {
    parts.push(`${hint.content.sections.length} legacy section${hint.content.sections.length === 1 ? "" : "s"}`);
  } else {
    parts.push("default extraction");
  }
  return parts.join(" · ");
}

async function fetchHintText(url) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.text();
  if (response.ok) return { ok: true, text: body };
  let error = body || `HTTP ${response.status}`;
  let validation = null;
  try {
    const parsed = JSON.parse(body);
    if (parsed?.error) error = parsed.error;
    validation = parsed?.validation || null;
  } catch {
    /* non-JSON error body */
  }
  return { ok: false, error, validation };
}

function HintFieldGroup({ title, accent, children }) {
  return (
    <fieldset className={`hint-group${accent ? " hint-group-accent" : ""}`}>
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

function HintField({ label, meta, help, children }) {
  return (
    <label className="hint-field">
      <span>
        {label}
        {meta ? <em className="hint-meta-badge">{meta}</em> : null}
      </span>
      {children}
      {help ? <em className="hint-field-help">{help}</em> : null}
    </label>
  );
}

function LineListEditor({ label, values, onChange, placeholder, mono, help }) {
  const lines = (values || []).join("\n");
  return (
    <label className="hint-field">
      <span>{label}</span>
      <textarea
        className={mono ? "mono" : ""}
        rows={Math.max(2, Math.min(6, (values || []).length + 1))}
        placeholder={placeholder}
        value={lines}
        onChange={(event) =>
          onChange(
            event.target.value
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
          )
        }
      />
      {help ? <em className="hint-field-help">{help}</em> : null}
    </label>
  );
}

function UrlListEditor({ label, values, onChange, meta, help }) {
  const items = values?.length ? values : [""];
  const setItem = (index, value) => {
    const next = [...(values || [])];
    while (next.length <= index) next.push("");
    next[index] = value;
    onChange(next.filter((item) => item.trim()));
  };
  const removeItem = (index) => onChange((values || []).filter((_, i) => i !== index));
  return (
    <div className="hint-field hint-urls">
      <span>
        {label}
        {meta ? <em className="hint-meta-badge">{meta}</em> : null}
      </span>
      {help ? <em className="hint-field-help">{help}</em> : null}
      {items.map((item, index) => (
        <div className="hint-url-row" key={`${index}-${item}`}>
          <input
            type="url"
            className="mono"
            placeholder="https://example.com/page"
            value={item}
            onChange={(event) => setItem(index, event.target.value)}
          />
          {(values?.length || 0) > 1 && (
            <button
              type="button"
              className="button tiny danger"
              title="Remove this test URL"
              onClick={() => removeItem(index)}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button type="button" className="button tiny" onClick={() => onChange([...(values || []), ""])}>
        + Add URL
      </button>
    </div>
  );
}

function FieldRowEditor({ fields, onChange }) {
  const setField = (index, key, value) => {
    const next = [...(fields || [])];
    next[index] = { ...next[index], [key]: value };
    onChange(next);
  };
  const removeField = (index) => onChange((fields || []).filter((_, i) => i !== index));
  return (
    <div className="hint-fields">
      <div className="hint-fields-head">
        <span>Fields</span>
        <button
          type="button"
          className="button tiny"
          onClick={() => onChange([...(fields || []), { selector: "", label: "", format: "text" }])}
        >
          + Add field
        </button>
      </div>
      {(fields || []).map((field, index) => (
        <div className="hint-field-row" key={index}>
          <input
            className="mono"
            placeholder=".js-post-body"
            value={field.selector || ""}
            onChange={(event) => setField(index, "selector", event.target.value)}
          />
          <input
            placeholder="label"
            value={field.label || ""}
            onChange={(event) => setField(index, "label", event.target.value)}
          />
          <select
            value={field.format || "text"}
            onChange={(event) => setField(index, "format", event.target.value)}
          >
            {HINT_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
          <button type="button" className="button tiny danger" onClick={() => removeField(index)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function BlockRowEditor({ block, onChange, onRemove }) {
  const isLeaf = block.format !== undefined || block.fields === undefined;
  const set = (key, value) => onChange({ ...block, [key]: value });
  const toLeaf = () => {
    const { fields, itemLabel, ...rest } = block;
    onChange({ ...rest, format: "text" });
  };
  const toRecord = () => {
    const { format, ...rest } = block;
    onChange({ ...rest, fields: [] });
  };
  return (
    <div className="hint-section-row">
      <div className="hint-section-grid">
        <select
          className="block-mode"
          value={isLeaf ? "leaf" : "record"}
          onChange={(event) => (event.target.value === "leaf" ? toLeaf() : toRecord())}
          title="Leaf = one flat value from this element. Record = one item per matching element, with per-item fields."
        >
          <option value="leaf">Leaf</option>
          <option value="record">Record</option>
        </select>
        <input
          className="mono"
          placeholder="div.content-area"
          value={block.selector || ""}
          onChange={(event) => set("selector", event.target.value)}
        />
        <input
          placeholder="label"
          value={block.label || ""}
          onChange={(event) => set("label", event.target.value)}
        />
        <select value={block.priority || "high"} onChange={(event) => set("priority", event.target.value)}>
          {HINT_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </select>
        <button type="button" className="button tiny danger" onClick={onRemove}>
          ✕
        </button>
      </div>
      {isLeaf ? (
        <div className="hint-option hint-block-format">
          <span className="hint-option-name">Format</span>
          <select value={block.format || "text"} onChange={(event) => set("format", event.target.value)}>
            {HINT_BLOCK_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div className="hint-option hint-block-format">
            <span className="hint-option-name">Item label (records)</span>
            <input
              placeholder="e.g. Issue, Post, Comment"
              value={block.itemLabel || ""}
              onChange={(event) => set("itemLabel", event.target.value)}
            />
          </div>
          <FieldRowEditor
            fields={block.fields || []}
            onChange={(fields) => set("fields", fields)}
          />
        </>
      )}
    </div>
  );
}

function BlocksEditor({ blocks, onChange, legacySectionCount }) {
  const setBlock = (index, block) => {
    const next = [...(blocks || [])];
    next[index] = block;
    onChange(next);
  };
  const removeBlock = (index) => onChange((blocks || []).filter((_, i) => i !== index));
  return (
    <div className="hint-field">
      <div className="hint-field-head">
        <span>Blocks (extraction layout)</span>
        <button
          type="button"
          className="button tiny"
          onClick={() =>
            onChange([...(blocks || []), { selector: "", label: "", priority: "high", format: "text" }])
          }
        >
          + Add block
        </button>
      </div>
      <p className="hint">
        Leaf blocks (one flat value) vs record blocks (one item per matching element, each with its own
        fields).
      </p>
      {legacySectionCount > 0 && (
        <p className="hint hint-warn">
          This hint also has {legacySectionCount} legacy <code>sections</code> — used only when{" "}
          <code>blocks</code> is empty.
        </p>
      )}
      {!(blocks || []).length && (
        <p className="hint hint-default">
          No blocks — the default pipeline runs for this: <strong>Readability → tables →
          links</strong>, with your toggles still applying. Add a block only to extract
          specific content instead of the default. Prefer the{" "}
          <em>Default extraction</em> mode when you don't need any custom layout.
        </p>
      )}
      {(blocks || []).map((block, index) => (
        <BlockRowEditor
          key={index}
          block={block}
          onChange={(next) => setBlock(index, next)}
          onRemove={() => removeBlock(index)}
        />
      ))}
    </div>
  );
}

function emptyFlowStep(action) {
  const base = { action };
  switch (action) {
    case "extract":
      return { ...base, label: "", content: {} };
    case "click":
      return { ...base, selector: "", waitForSelector: "", timeoutMs: "" };
    case "wait":
      return { ...base, selector: "", state: "visible", timeoutMs: "" };
    case "type":
      return { ...base, selector: "", text: "", clear: false, submit: false, waitForSelector: "", timeoutMs: "" };
    case "navigate":
      return { ...base, url: "", waitForSelector: "", timeoutMs: "" };
    default:
      return base;
  }
}

function StepEditor({ step, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
  const set = (key, value) => onChange({ ...step, [key]: value });
  const patchContent = (content) => set("content", content);
  const setNumber = (key, raw) => {
    if (raw === "") return set(key, "");
    const value = Number(raw);
    set(key, Number.isInteger(value) && value > 0 ? value : raw);
  };
  const timeoutField = (
    <input
      className="mono"
      type="number"
      min="250"
      max="20000"
      placeholder="20000"
      value={step.timeoutMs ?? ""}
      onChange={(event) => setNumber("timeoutMs", event.target.value)}
    />
  );
  const waitForSelectorField = (
    <input
      className="mono"
      placeholder="div.result"
      value={step.waitForSelector || ""}
      onChange={(event) => set("waitForSelector", event.target.value)}
    />
  );
  return (
    <div className="hint-section-row hint-step-row">
      <div className="hint-step-head">
        <span className="hint-step-action">{FLOW_ACTION_LABELS[step.action] || step.action}</span>
        <span className="hint-step-controls">
          <button type="button" className="button tiny" disabled={!canMoveUp} onClick={onMoveUp}>
            ↑
          </button>
          <button type="button" className="button tiny" disabled={!canMoveDown} onClick={onMoveDown}>
            ↓
          </button>
          <button type="button" className="button tiny danger" onClick={onRemove}>
            ✕
          </button>
        </span>
      </div>
      {step.action === "extract" && (
        <>
          <div className="hint-field">
            <input
              placeholder="Step label — e.g. Initial page"
              value={step.label || ""}
              onChange={(event) => set("label", event.target.value)}
            />
          </div>
          <BlocksEditor
            blocks={step.content?.blocks || []}
            onChange={(blocks) => patchContent({ blocks })}
            legacySectionCount={step.content?.sections?.length || 0}
          />
        </>
      )}
      {step.action === "click" && (
        <div className="hint-step-grid">
          <div className="hint-field">
            <span>Selector to click</span>
            <input className="mono" placeholder="button.next" value={step.selector || ""} onChange={(event) => set("selector", event.target.value)} />
          </div>
          <div className="hint-field">
            <span>Wait for selector after click (required)</span>
            {waitForSelectorField}
          </div>
          <div className="hint-field hint-narrow">
            <span>Timeout (ms)</span>
            {timeoutField}
          </div>
        </div>
      )}
      {step.action === "wait" && (
        <div className="hint-step-grid">
          <div className="hint-field">
            <span>Selector to wait for</span>
            <input className="mono" placeholder="div.loaded" value={step.selector || ""} onChange={(event) => set("selector", event.target.value)} />
          </div>
          <div className="hint-field">
            <span>State</span>
            <select value={step.state || "visible"} onChange={(event) => set("state", event.target.value)}>
              {FLOW_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>
          <div className="hint-field hint-narrow">
            <span>Timeout (ms)</span>
            {timeoutField}
          </div>
        </div>
      )}
      {step.action === "type" && (
        <>
          <div className="hint-step-grid">
            <div className="hint-field">
              <span>Selector to type into</span>
              <input className="mono" placeholder="input#search" value={step.selector || ""} onChange={(event) => set("selector", event.target.value)} />
            </div>
            <div className="hint-field">
              <span>Text</span>
              <input placeholder="query" value={step.text || ""} onChange={(event) => set("text", event.target.value)} />
            </div>
          </div>
          <div className="hint-step-grid hint-step-options">
            <label className="hint-check">
              <input type="checkbox" checked={Boolean(step.clear)} onChange={(event) => set("clear", event.target.checked)} />
              Clear existing value first
            </label>
            <label className="hint-check">
              <input type="checkbox" checked={Boolean(step.submit)} onChange={(event) => set("submit", event.target.checked)} />
              Submit (press Enter)
            </label>
          </div>
          {step.submit && (
            <div className="hint-field">
              <span>Wait for selector after submit</span>
              {waitForSelectorField}
            </div>
          )}
        </>
      )}
      {step.action === "navigate" && (
        <div className="hint-step-grid">
          <div className="hint-field">
            <span>URL (absolute or relative to page)</span>
            <input className="mono" placeholder="/results" value={step.url || ""} onChange={(event) => set("url", event.target.value)} />
          </div>
          <div className="hint-field">
            <span>Wait for selector after load</span>
            {waitForSelectorField}
          </div>
          <div className="hint-field hint-narrow">
            <span>Timeout (ms)</span>
            {timeoutField}
          </div>
        </div>
      )}
    </div>
  );
}

function FlowEditor({ flow, onChange }) {
  const steps = flow?.length ? flow : [];
  const setStep = (index, step) => {
    const next = [...steps];
    next[index] = step;
    onChange(next);
  };
  const move = (index, delta) => {
    const next = [...steps];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const removeStep = (index) => onChange(steps.filter((_, i) => i !== index));
  const lastAction = steps.length ? steps[steps.length - 1].action : null;
  return (
    <div className="hint-field">
      <div className="hint-field-head">
        <span>Flow (interactive steps)</span>
        <div className="hint-step-add">
          {FLOW_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              className="button tiny"
              onClick={() => onChange([...steps, emptyFlowStep(action)])}
            >
              + {action}
            </button>
          ))}
        </div>
      </div>
      <p className="hint">
        Script the page with steps, in order. Each <code>extract</code> step defines its own blocks.
        Max 8 steps, 4 clicks. Interactions (click/type/navigate) can't be adjacent and the flow must
        end with an extract step.
      </p>
      {!steps.length && <p className="hint">No flow — this hint does a single extraction with the content above.</p>}
      {lastAction && lastAction !== "extract" && (
        <p className="hint hint-warn">
          Last step is <code>{lastAction}</code> — flows must end with an extract step (validation will fail).
        </p>
      )}
      {steps.map((step, index) => (
        <StepEditor
          key={index}
          step={step}
          onChange={(next) => setStep(index, next)}
          onRemove={() => removeStep(index)}
          onMoveUp={() => move(index, -1)}
          onMoveDown={() => move(index, 1)}
          canMoveUp={index > 0}
          canMoveDown={index < steps.length - 1}
        />
      ))}
    </div>
  );
}

function FlowOptionsEditor({ options, onChange }) {
  const set = (key, value) => onChange({ ...(options || {}), [key]: value });
  return (
    <div className="hint-field">
      <div className="hint-field-head">
        <span>Flow options</span>
      </div>
      <div className="hint-step-grid hint-step-options">
        <div className="hint-field hint-narrow">
          <span>Total timeout (ms)</span>
          <input
            className="mono"
            type="number"
            min="1000"
            max="45000"
            placeholder="45000"
            value={options?.totalTimeoutMs ?? ""}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === "") {
                const next = { ...(options || {}) };
                delete next.totalTimeoutMs;
                return onChange(next);
              }
              const value = Number(raw);
              set("totalTimeoutMs", Number.isInteger(value) && value > 0 ? value : raw);
            }}
          />
        </div>
        <label className="hint-check">
          <input
            type="checkbox"
            checked={Boolean(options?.continueOnEmptyExtract)}
            onChange={(event) => set("continueOnEmptyExtract", event.target.checked)}
          />
          Continue when an extract returns empty content
        </label>
      </div>
    </div>
  );
}

function HintGuide() {
  return (
    <details className="hint-guide">
      <summary>How hint matching works — read before writing a path pattern</summary>
      <div className="hint-guide-body">
        <p>
          A hint is selected by <b>hostname + path only</b>. Comment, page type, and
          test URLs never affect extraction. The <b>first</b> matching hint in the
          file wins — list specific patterns before broad ones.
        </p>
        <p>
          <b>Path patterns are globs, not regexes.</b> Only two wildcards exist:{" "}
          <code>*</code> and <code>**</code>. Everything else (<code>?</code>,{" "}
          <code>[0-9]</code>, <code>+</code>, <code>.</code>…) is matched literally.
          URLs are lowercased before matching, so write patterns in lowercase.
        </p>
        <table className="hint-guide-table">
          <thead>
            <tr>
              <th>Pattern</th>
              <th>Matches</th>
              <th>Does NOT match</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>/**</code> or <code>/</code>
              </td>
              <td>anything</td>
              <td>—</td>
            </tr>
            <tr>
              <td>
                <code>/*</code>
              </td>
              <td>
                <code>/foo</code>
              </td>
              <td>
                <code>/foo/bar</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>/*/*</code>
              </td>
              <td>
                <code>/foo/bar</code>
              </td>
              <td>
                <code>/foo/bar/baz</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>/foo/**</code>
              </td>
              <td>
                <code>/foo/bar</code>, <code>/foo/bar/baz</code>
              </td>
              <td>
                <code>/foo</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>/foo/*</code>
              </td>
              <td>
                <code>/foo/bar</code>
              </td>
              <td>
                <code>/foo</code>, <code>/foo/bar/baz</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>/foo/bar</code>
              </td>
              <td>
                <code>/foo/bar</code> only</td>
              <td>
                <code>/foo/BAR</code> (write lowercase)
              </td>
            </tr>
            <tr>
              <td>
                <code>/*/**</code>
              </td>
              <td>any path except the root <code>/</code></td>
              <td>
                <code>/</code>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="hint-guide-note">
          <code>*</code> = one path segment (no <code>/</code>). <code>**</code> =
          anything, including <code>/</code>. Trailing slashes are ignored.
        </p>
        <h4 className="hint-guide-subhead">What to enter in each field</h4>
        <table className="hint-guide-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>What it does</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Domain</td>
              <td>Site the rule applies to (subdomains included)</td>
              <td>
                <code>github.com</code>
              </td>
            </tr>
            <tr>
              <td>Path pattern</td>
              <td>Which URL paths on that site</td>
              <td>
                <code>/*/*</code> (repo pages)
              </td>
            </tr>
            <tr>
              <td>Required element</td>
              <td>
                Optional. When set, the rule only applies if an element matching
                this CSS selector exists on the page. Splits one domain+path into
                multiple page types.
              </td>
              <td>
                <code>div.js-profile-editable-area</code>
              </td>
            </tr>
            <tr>
              <td>Wait for selectors</td>
              <td>Elements that must ALL appear before extracting (SPA sites)</td>
              <td>
                <code>turbo-frame#repo-content-turbo-frame</code>
              </td>
            </tr>
            <tr>
              <td>Skip selectors</td>
              <td>Noise to remove before extracting (one per line)</td>
              <td>
                <code>.navbox</code>, <code>.sidebar</code>
              </td>
            </tr>
            <tr>
              <td>Wait for content selectors</td>
              <td>Waits for content to appear in these elements. Usually unneeded.</td>
              <td>
                <code>article</code>
              </td>
            </tr>
            <tr>
              <td>Readability</td>
              <td>
                on → auto article extraction (strips nav/ads); off → keep the whole
                page
              </td>
              <td>
                <code>off</code> for profiles, homepages, data tables
              </td>
            </tr>
            <tr>
              <td>Table extraction</td>
              <td>
                <code>Disabled</code> when tables are layout noise
              </td>
              <td>
                <code>Disabled</code> on Cricbuzz
              </td>
            </tr>
            <tr>
              <td>Content sections</td>
              <td>
                The actual material — pick the exact containers to extract. Selectors
                must not overlap.
              </td>
              <td>
                <code>article.markdown-body</code>
              </td>
            </tr>
          </tbody>
        </table>
        <h4 className="hint-guide-subhead">A complete example — GitHub repo page</h4>
        <pre className="hint-guide-code">{`{
  "domain": "github.com",
  "pathPattern": "/*/*",            // repo pages, not the profile "/*"
  "comment": "Repo — README + metadata",
  "requireSelector": "article.markdown-body",  // optional: only applies when this element exists
  "waitForSelector": "turbo-frame#repo-content-turbo-frame",
  "preferReadability": false,
  "content": {
    "sections": [
      { "selector": "article.markdown-body", "label": "README", "priority": "high" }
    ]
  }
}`}</pre>
        <p className="hint-guide-note">
          The Test pane on the right runs this exact hint against a real page, so
          you can iterate until the output is clean — no need to save first.
        </p>
      </div>
    </details>
  );
}

function Hints() {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [editor, setEditor] = useState(() => editorFromPath(location.pathname));
  const scrollRef = useRef(0);
  const load = async () => {
    try {
      const data = await request("/console/api/hints");
      setState(data);
      setError("");
    } catch (err) {
      setError(err.message || "Request failed");
    }
  };
  const removeHint = async (index) => {
    if (deleting !== null) return;
    const hint = state?.hints?.[index];
    if (!window.confirm(`Delete hint #${index} (${hint?.domain || "?"} ${hint?.pathPattern || "/**"})?\nThis removes it from ${state?.hintsPath || "domain-hints.json"} (a .bak is kept).`)) return;
    setDeleting(index);
    try {
      await request(`/console/api/hints/${index}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message || "Delete failed");
    } finally {
      setDeleting(null);
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const sync = () => {
      const next = editorFromPath(location.pathname);
      setEditor(next);
      if (next === null) {
        const y = scrollRef.current;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => window.scrollTo(0, y)),
        );
      }
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("navigator:pathchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("navigator:pathchange", sync);
    };
  }, []);
  const openEditor = (index) => {
    scrollRef.current = window.scrollY;
    const path = index === null ? "/console/hints/new" : `/console/hints/edit/${index}`;
    if (location.pathname !== path) window.history.pushState({}, "", path);
    setEditor({ index });
  };
  const closeEditor = (reload) => {
    setEditor(null);
    if (location.pathname !== "/console/hints")
      window.history.replaceState({}, "", "/console/hints");
    if (reload) load();
    const y = scrollRef.current;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => window.scrollTo(0, y)),
    );
  };
  const editingHint =
    editor === null
      ? null
      : editor.index === null
        ? emptyHint()
        : state?.hints?.[editor.index];
  useEffect(() => {
    if (editor && editor.index !== null && state && editingHint === undefined) {
      setEditor(null);
      if (location.pathname !== "/console/hints")
        window.history.replaceState({}, "", "/console/hints");
    }
  }, [editor, state, editingHint]);
  const q = query.trim().toLowerCase();
  const rows = (state?.hints || [])
    .map((hint, index) => ({ index, hint }))
    .filter(({ hint }) => {
      if (!q) return true;
      const haystack = `${hint.domain} ${hint.pathPattern} ${hint.requireSelector} ${hint.pageType} ${hint.comment}`.toLowerCase();
      return haystack.includes(q);
    });
  if (editor && state && editingHint !== undefined && editingHint !== null) {
    return (
      <HintEditorPane
        key={editor.index === null ? "new" : editor.index}
        index={editor.index}
        initial={editingHint}
        onClose={() => closeEditor(false)}
        onSaved={() => closeEditor(true)}
      />
    );
  }
  return (
    <section className="panel hints">
      <h2>
        [ Domain hints — extraction rules ]{" "}
        <span className="sub">
          {state ? `${state.hintsPath} · ${state.count} hint${state.count === 1 ? "" : "s"}` : "loading…"}
        </span>
      </h2>
      <HintGuide />
      <div className="manage-toolbar">
        <input
          className="manage-search"
          type="search"
          placeholder="Search domains, paths, page types, comments…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          className="button"
          onClick={() => openEditor(null)}
        >
          + New hint
        </button>
      </div>
      {error ? (
        <Empty>{error}</Empty>
      ) : !state ? (
        <Empty>Loading hints…</Empty>
      ) : (
        <div className="hints-list">
          <div className="hints-row hints-heading">
            <span>#</span>
            <span>Domain</span>
            <span>Page type</span>
            <span>Path</span>
            <span>Comment</span>
            <span>Test</span>
            <span />
          </div>
          {rows.length ? (
            rows.map(({ index, hint }) => (
              <div className="hints-row" key={index}>
                <span className="mono">{index}</span>
                <b className="mono">{hint.domain || "—"}</b>
                <span>
                  {hint.pageType || "—"}
                  {hint.requireSelector ? (
                    <>
                      {" "}
                      <em className="hint-meta-badge" title={`Required element: ${hint.requireSelector}`}>
                        sel
                      </em>
                    </>
                  ) : null}
                </span>
                <code>{hint.pathPattern || "/**"}</code>
                <span className="hints-comment" title={hint.comment || ""}>
                  {hint.comment || "—"}
                </span>
                <span>
                  {hint.testUrls?.length
                    ? `${hint.testUrls.length} url${hint.testUrls.length === 1 ? "" : "s"}`
                    : "—"}
                </span>
                <span className="hints-actions">
                  <button
                    className="button tiny"
                    title="Edit this hint"
                    onClick={() => openEditor(index)}
                  >
                    Edit
                  </button>
                  <button
                    className="button tiny danger"
                    title="Delete this hint"
                    disabled={deleting !== null}
                    onClick={() => removeHint(index)}
                  >
                    {deleting === index ? "Deleting…" : "Delete"}
                  </button>
                </span>
              </div>
            ))
          ) : (
            <Empty>No hints match your search.</Empty>
          )}
        </div>
      )}
    </section>
  );
}

function HintEditorPane({ index, initial, onClose, onSaved }) {
  const [tab, setTab] = useState("form");
  const [mode, setMode] = useState(() => modeFromHint(initial));
  const [hint, setHint] = useState(initial);
  const [json, setJson] = useState(JSON.stringify(initial, null, 2));
  const [jsonError, setJsonError] = useState("");
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ kind: "", text: "" });
  const patch = (updates) => {
    const next = { ...hint, ...updates };
    setHint(next);
    setJson(JSON.stringify(next, null, 2));
  };
  const patchContent = (content) => patch({ content });
  const switchToDefault = () => setMode("default");
  const switchToContent = () => setMode("content");
  const switchToFlow = () => {
    if (!hint.flow?.length) patch({ flow: [emptyFlowStep("extract")] });
    setMode("flow");
  };
  const cleanedHint =
    mode === "flow"
      ? hint
      : mode === "content"
        ? { ...hint, flow: undefined }
        : { ...hint, content: undefined, flow: undefined, flowOptions: undefined };
  const applyJson = (text) => {
    setJson(text);
    setJsonError("");
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setHint(parsed);
        setMode(modeFromHint(parsed));
        setValidation(null);
      } else {
        setJsonError("Must be a JSON object.");
      }
    } catch (err) {
      setJsonError(err.message || "Invalid JSON.");
    }
  };
  const validate = async () => {
    setValidating(true);
    setMessage({ kind: "", text: "" });
    try {
      const result = await request("/console/api/hints/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hint: cleanedHint }),
      });
      setValidation(result);
      setMessage({
        kind: result.valid ? "ok" : "err",
        text: result.valid ? "Validation passed." : `${result.errors.length} error(s) found.`,
      });
    } catch (err) {
      setMessage({ kind: "err", text: err.message });
    } finally {
      setValidating(false);
    }
  };
  const save = async () => {
    setSaving(true);
    setMessage({ kind: "", text: "" });
    try {
      const options = {
        method: index === null ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hint: cleanedHint }),
      };
      await request(index === null ? "/console/api/hints" : `/console/api/hints/${index}`, options);
      onSaved();
    } catch (err) {
      setMessage({ kind: "err", text: err.message });
      if (err.validation) setValidation(err.validation);
    } finally {
      setSaving(false);
    }
  };
  const errors = validation?.errors || [];
  const canSave = !saving && !errors.length && !jsonError;
  const isNew = index === null;
  return (
    <section className="panel hints">
      <h2>
        [ {isNew ? "New hint" : `Edit — ${hintKey(hint)}`} ]{" "}
        <span className="sub">backend: {hintMeta(hint) || "default extraction"}</span>
      </h2>
      <div className="hints-two-pane">
        <div className="hints-pane hints-editor-pane">
          <div className="hint-tabs" role="tablist">
            <button
              className={tab === "form" ? "active" : ""}
              role="tab"
              onClick={() => setTab("form")}
            >
              Form
            </button>
            <button
              className={tab === "json" ? "active" : ""}
              role="tab"
              onClick={() => setTab("json")}
            >
              JSON
            </button>
          </div>
          {tab === "json" ? (
            <label className="hint-field">
              <span>Hint JSON</span>
              <textarea
                className="mono hint-json"
                rows={20}
                spellCheck="false"
                value={json}
                onChange={(event) => applyJson(event.target.value)}
              />
              {jsonError && <div className="field-error">{jsonError}</div>}
            </label>
          ) : (
            <div className="hint-form">
              <HintFieldGroup title="Target — which page this rule applies to">
                <HintField
                  label="Domain"
                  help="Site hostname, e.g. github.com. Matches subdomains too — github.com also covers gist.github.com."
                >
                  <input
                    className="mono"
                    placeholder="example.com"
                    value={hint.domain || ""}
                    onChange={(event) => patch({ domain: event.target.value.trim() })}
                  />
                </HintField>
                <HintField
                  label="Path pattern"
                  help="URL path glob, NOT a regex. /* = one segment, /** = everything, /foo/** = everything under /foo. Lowercase only. Full reference in the guide on the list page."
                >
                  <input
                    className="mono"
                    placeholder="/**"
                    value={hint.pathPattern || ""}
                    onChange={(event) => patch({ pathPattern: event.target.value })}
                  />
                </HintField>
                <HintField
                  label="Required element (CSS selector)"
                  meta="optional"
                  help="If set, this rule only applies when an element matching this selector exists on the loaded page. Lets you split one domain+path into several page types (e.g. a profile vs a list). Leave empty to match by domain+path alone."
                >
                  <input
                    className="mono"
                    placeholder="div.js-profile-editable-area"
                    value={hint.requireSelector || ""}
                    onChange={(event) => patch({ requireSelector: event.target.value.trim() || undefined })}
                  />
                </HintField>
              </HintFieldGroup>
              <HintFieldGroup title="Extraction options">
                <div className="hint-options-grid">
                  <div className="hint-option">
                    <span className="hint-option-name">Readability</span>
                    <label className="hint-check hint-option-check">
                      <input
                        type="checkbox"
                        checked={hint.preferReadability !== false}
                        onChange={(event) => patch({ preferReadability: event.target.checked })}
                      />
                      <span className="hint-option-hint">
                        {hint.preferReadability === false
                          ? "off → raw HTML-to-markdown keeps everything"
                          : "on → strips nav, ads, sidebar"}
                      </span>
                    </label>
                  </div>
                  <div className="hint-option">
                    <span className="hint-option-name">Table extraction</span>
                    <select
                      value={hint.tableExtraction || ""}
                      onChange={(event) => patch({ tableExtraction: event.target.value || undefined })}
                    >
                      <option value="">Default</option>
                      <option value="content">Content tables only</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </div>
                </div>
              </HintFieldGroup>
              <HintFieldGroup title="What gets extracted" accent>
                <div className="hint-mode-switch" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "default"}
                    className={mode === "default" ? "active" : ""}
                    onClick={switchToDefault}
                  >
                    Default extraction
                    <em>standard pipeline — your toggles apply</em>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "content"}
                    className={mode === "content" ? "active" : ""}
                    onClick={switchToContent}
                  >
                    Static blocks
                    <em>one pass over the loaded page</em>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "flow"}
                    className={mode === "flow" ? "active" : ""}
                    onClick={switchToFlow}
                  >
                    Interactive flow
                    <em>scripted extract / click / type steps</em>
                  </button>
                </div>
                {mode === "default" ? (
                  <p className="hint hint-default">
                    No custom extraction — the page runs the standard pipeline:{" "}
                    <strong>Readability → tables → links</strong>. Everything you toggle in{" "}
                    <em>Extraction options</em> and <em>Page load</em> still applies
                    (Readability on/off, table extraction, waits, skip selectors). Switch to{" "}
                    <em>Static blocks</em> or <em>Interactive flow</em> to override with your own
                    layout.
                  </p>
                ) : mode === "content" ? (
                  <BlocksEditor
                    blocks={hint.content?.blocks || []}
                    onChange={(blocks) => patchContent({ blocks })}
                    legacySectionCount={hint.content?.sections?.length || 0}
                  />
                ) : (
                  <>
                    <FlowEditor flow={hint.flow || []} onChange={(flow) => patch({ flow })} />
                    <FlowOptionsEditor
                      options={hint.flowOptions || {}}
                      onChange={(flowOptions) => patch({ flowOptions })}
                    />
                  </>
                )}
              </HintFieldGroup>
              <HintFieldGroup title="Page load">
                <LineListEditor
                  label="Wait for selectors (one per line)"
                  help="Waits until ALL of these elements appear (up to 20s) before extracting. Use only when the content loads after the page — e.g. SPA sites."
                  values={Array.isArray(hint.waitForSelector) ? hint.waitForSelector : hint.waitForSelector ? [hint.waitForSelector] : []}
                  onChange={(waitForSelector) => patch({ waitForSelector })}
                  placeholder={"turbo-frame#repo-content-turbo-frame"}
                  mono
                />
                <div className="hint-option">
                  <span className="hint-option-name">Stabilize strategy</span>
                  <select
                    value={hint.stabilizeStrategy || ""}
                    onChange={(event) => patch({ stabilizeStrategy: event.target.value || undefined })}
                  >
                    <option value="">Default (network_idle — 500ms no network traffic)</option>
                    <option value="network_idle">network_idle (500ms no network traffic)</option>
                    <option value="content_idle">content_idle (waits for rendered text)</option>
                    <option value="mutation">mutation (waits for DOM to stop changing)</option>
                  </select>
                  <span className="hint-option-hint">
                    Always runs after Wait for selector (or alone when none is set).
                    network_idle = 500ms of no network traffic · content_idle = wait
                    for rendered text · mutation = wait for DOM changes.
                  </span>
                </div>
                <LineListEditor
                  label="Wait for content selectors (one per line)"
                  help="Waits for content to appear in these selectors — so if the content is lazy-loaded, the page keeps waiting until it's there. Only needed when your content container isn't already covered (main, article, .content…)."
                  values={hint.contentSelectors || []}
                  onChange={(contentSelectors) => patch({ contentSelectors })}
                  placeholder={"article\n[data-testid=\"content\"]"}
                  mono
                />
              </HintFieldGroup>
              <HintFieldGroup title="Selectors">
                <LineListEditor
                  label="Skip selectors (one per line)"
                  help="Elements to strip before extraction — one CSS selector per line. e.g. .navbox, .sidebar"
                  values={hint.skipSelectors || []}
                  onChange={(skipSelectors) => patch({ skipSelectors })}
                  placeholder={".navbox\n.sidebar"}
                  mono
                />
              </HintFieldGroup>
              <HintFieldGroup title="Testing">
                <UrlListEditor
                  label="Test URLs"
                  meta="test only — no effect on extraction"
                  help="Real http(s):// URLs to test this hint against. The Test pane runs them live."
                  values={hint.testUrls || []}
                  onChange={(testUrls) => patch({ testUrls })}
                />
              </HintFieldGroup>
              <HintFieldGroup title="Notes — display only, no effect on extraction">
                <HintField
                  label="Comment"
                  meta="display only"
                  help="Human note only. What this page type is and what makes extraction tricky."
                >
                  <textarea
                    rows={3}
                    placeholder="Describe this page type and what matters for extraction (for humans only)."
                    value={hint.comment || ""}
                    onChange={(event) => patch({ comment: event.target.value })}
                  />
                </HintField>
              </HintFieldGroup>
            </div>
          )}
          {(errors.length > 0 || validation?.warnings?.length > 0) && (
            <div className="hint-validation">
              {errors.map((item, index) => (
                <div className="hint-validation-error" key={`e-${index}`}>
                  <code>{item.field || "hint"}</code> {item.message}
                </div>
              ))}
              {(validation?.warnings || []).map((item, index) => (
                <div className="hint-validation-warning" key={`w-${index}`}>
                  <code>{item.field || "hint"}</code> {item.message}
                </div>
              ))}
            </div>
          )}
          <div className="hints-form-actions">
            <button className="button" disabled={validating} onClick={validate}>
              {validating ? "Validating…" : "Validate"}
            </button>
            <button className="button primary" disabled={!canSave} onClick={save}>
              {saving ? "Saving…" : isNew ? "Create hint" : "Save"}
            </button>
            <button className="button" disabled={saving} onClick={onClose}>
              Cancel
            </button>
          </div>
          {message.text && <p className={`message ${message.kind}`}>{message.text}</p>}
        </div>
        <div className="hints-pane hints-test-pane">
          <HintTestPanel hint={cleanedHint} />
        </div>
      </div>
    </section>
  );
}

function HintTestPanel({ hint }) {
  const [testUrl, setTestUrl] = useState(hint?.testUrls?.[0] || "");
  const [rerun, setRerun] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [showScreenshot, setShowScreenshot] = useState(false);
  const [screenshot, setScreenshot] = useState("");
  const runningRef = useRef(false);
  const lastHintSigRef = useRef("");
  const hintSig = JSON.stringify(hint);
  useEffect(() => {
    if (!testUrl && hint?.testUrls?.[0]) setTestUrl(hint.testUrls[0]);
  }, [hint, testUrl]);
  const runTest = useCallback(async () => {
    if (!testUrl || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    try {
      const url = `/extract?url=${encodeURIComponent(testUrl)}&maxChars=8000&hint=${encodeURIComponent(JSON.stringify(hint))}`;
      const response = await fetchHintText(url);
      if (response.ok) {
        const tables = (response.text.match(/^- Tables extracted: (\d+)$/gm) || []).reduce(
          (sum, line) => sum + Number(line.match(/(\d+)/)[1]),
          0,
        );
        const warnings = (response.text.match(/^[-·] ⚠ (.+)$/gm) || []).map((line) =>
          line.replace(/^[-·] ⚠ /, ""),
        );
        setResult({
          ok: true,
          text: response.text,
          chars: response.text.length,
          tables,
          warnings,
        });
      } else {
        setResult({ ok: false, error: response.error, validation: response.validation, text: "" });
      }
    } catch (err) {
      setResult({ ok: false, error: err.message, text: "" });
    } finally {
      lastHintSigRef.current = JSON.stringify(hint);
      runningRef.current = false;
      setRunning(false);
    }
  }, [hint, testUrl]);
  useEffect(() => {
    if (!rerun || !testUrl || runningRef.current) return undefined;
    if (lastHintSigRef.current === hintSig) return undefined;
    const timer = setTimeout(() => runTest(), 800);
    return () => clearTimeout(timer);
  }, [rerun, hintSig, testUrl, runTest]);
  useEffect(() => {
    if (!showScreenshot || !testUrl || !result?.ok) return undefined;
    let cancelled = false;
    const loadScreenshot = async () => {
      try {
        const response = await fetch(
          `/screenshot?url=${encodeURIComponent(testUrl)}&format=jpeg&quality=low&fullPage=false`,
          { cache: "no-store" },
        );
        const body = await response.text();
        if (!cancelled) {
          const match = body.match(/data:image\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=]+/);
          setScreenshot(match ? match[0] : "");
        }
      } catch {
        if (!cancelled) setScreenshot("");
      }
    };
    loadScreenshot();
    return () => {
      cancelled = true;
    };
  }, [showScreenshot, testUrl, result?.ok]);
  const warnings = result?.warnings || [];
  return (
    <div className="hint-test">
      <h3 className="hint-test-head">Test on page</h3>
      <div className="hint-test-controls">
        <form
          className="hint-test-form"
          onSubmit={(event) => {
            event.preventDefault();
            runTest();
          }}
        >
          <input
            className="mono"
            type="url"
            placeholder="https://example.com/page"
            value={testUrl}
            onChange={(event) => {
              setTestUrl(event.target.value);
              setResult(null);
              setScreenshot("");
            }}
          />
          <button className="button primary" type="submit" disabled={!testUrl || running}>
            {running ? "Running…" : "▶ Run test"}
          </button>
        </form>
      </div>
      <label className="hint-check">
        <input type="checkbox" checked={rerun} onChange={(event) => setRerun(event.target.checked)} />
        Auto re-run on edit
      </label>
      {!testUrl && <p className="hint">Add a test URL to run the hint against a real page.</p>}
      {result && (
        <div className="hint-test-result">
          <div className={`hint-test-status ${result.ok ? "ok" : "error"}`}>
            {result.ok
              ? `✓ ${result.chars} chars · ${result.tables} table${result.tables === 1 ? "" : "s"} · source: override`
              : `✕ ${result.error}`}
          </div>
          {!result.ok && result.validation?.errors?.length > 0 && (
            <div className="hint-validation">
              {result.validation.errors.map((item, index) => (
                <div className="hint-validation-error" key={index}>
                  <code>{item.field || "hint"}</code> {item.message}
                </div>
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="hint-zero-match">
              {warnings.map((warning, index) => (
                <div key={index}>
                  ⚠ {warning} — check the selector against the page structure.
                </div>
              ))}
            </div>
          )}
          <div className="hint-output-tabs">
            <button
              className={!showScreenshot ? "active" : ""}
              onClick={() => setShowScreenshot(false)}
            >
              Text
            </button>
            <button
              className={showScreenshot ? "active" : ""}
              onClick={() => setShowScreenshot(true)}
            >
              Screenshot
            </button>
          </div>
          {showScreenshot ? (
            screenshot ? (
              <img className="preview" src={screenshot} alt="Page screenshot" />
            ) : (
              <p className="hint">No screenshot available.</p>
            )
          ) : (
            <pre className="hint-output">{result.text}</pre>
          )}
        </div>
      )}
      <p className="note">
        Runs against the real browser with this candidate hint (not the saved file).
      </p>
    </div>
  );
}

function App() {
  const [mode, setMode] = useState(() => modeFromPath(location.pathname));  const [trendRange, setTrendRange] = useState(() => {
    const range = new URLSearchParams(location.search).get("range");
    return ["minutes", "hour", "day", "week"].includes(range) ? range : "hour";
  });
  const [trend, setTrend] = useState(null);
  const [trendError, setTrendError] = useState("");
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
    if (location.pathname !== path) {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new Event("navigator:pathchange"));
    }
    setMode(next);
  };
  const updateTrendQuery = (nextRange) => {
    const params = new URLSearchParams(location.search);
    params.set("range", nextRange);
    params.delete("engine");
    window.history.replaceState({}, "", `${location.pathname}?${params}`);
  };
  const changeTrendRange = (nextRange) => {
    setTrendRange(nextRange);
    updateTrendQuery(nextRange);
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
        logs: mergeErrorLogs(logPayload.entries || [], stats.requests?.recentErrors || []),
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
    if (mode !== "status" || paused) return undefined;
    let cancelled = false;
    const loadTrend = async () => {
      try {
        const payload = await request(`/stats/activity-trend?range=${encodeURIComponent(trendRange)}`);
        if (!cancelled) {
          setTrend(payload);
          setTrendError("");
        }
      } catch (error) {
        if (!cancelled) setTrendError(error.message || "Request failed");
      }
    };
    loadTrend();
    const interval = setInterval(() => {
      if (!document.hidden) loadTrend();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [mode, paused, trendRange]);
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
          trend={trend}
          trendRange={trendRange}
          trendError={trendError}
          setTrendRange={changeTrendRange}
        />
      ) : mode === "manage" ? (
        <Manage config={snapshot.config || {}} reload={load} />
      ) : mode === "tools" ? (
        <Tools />
      ) : mode === "keys" ? (
        <Keys />
      ) : mode === "hints" ? (
        <Hints />
      ) : (
        <StatusView
          snapshot={snapshot}
          history={history}
          toggleVnc={toggleVnc}
          vncBusy={vncBusy}
          feed={feed}
          trend={trend}
          trendRange={trendRange}
          trendError={trendError}
          setTrendRange={changeTrendRange}
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
