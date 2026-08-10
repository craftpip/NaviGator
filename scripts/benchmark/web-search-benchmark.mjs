import { performance } from "node:perf_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SUPPORTED_ENGINES, getEngineMetadata } from "../src/engines/index.js";

const MCP_URL = process.env.MCP_URL || "http://localhost:3000/mcp";
const QUERY = process.env.BENCH_QUERY || "latest AI news 2026";
const LIMIT = parseInt(process.env.BENCH_LIMIT || "5", 10);
const ITERATIONS = parseInt(process.env.BENCH_ITERATIONS || "1", 10);
const WARMUP = parseInt(process.env.BENCH_WARMUP || "0", 10);
const UNIQUE_QUERIES = process.env.BENCH_UNIQUE !== "0";
const ENGINE = process.env.BENCH_ENGINE || ""; // single engine test: any SUPPORTED_ENGINES id

function round(v) {
  return Math.round(v * 100) / 100;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function parseResultCount(content) {
  const m = String(content || "").match(/Results\s*\((\d+)\)/);
  return m ? Number(m[1]) : null;
}

function extractErrorNote(content) {
  const m = String(content || "").match(/^\s*-\s*(.+)$/m);
  return m ? m[1].trim() : "";
}

function truncate(str, max) {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function pad(cell, width, align) {
  const s = String(cell);
  return align === "right" ? s.padStart(width) : s.padEnd(width);
}

function printTable(headers, rows, aligns) {
  const widths = headers.map((h, i) => {
    const cellMax = rows.reduce((m, r) => Math.max(m, String(r[i]).length), 0);
    return Math.max(h.length, cellMax);
  });
  const top = "┌" + widths.map((w) => "─".repeat(w + 2)).join("┬") + "┐";
  const mid = "├" + widths.map((w) => "─".repeat(w + 2)).join("┼") + "┤";
  const bot = "└" + widths.map((w) => "─".repeat(w + 2)).join("┴") + "┘";
  const line = (cells) => "│ " + cells.map((c, i) => pad(c, widths[i], aligns[i])).join(" │ ") + " │";

  console.log(top);
  console.log(line(headers));
  console.log(mid);
  for (const row of rows) console.log(line(row));
  console.log(bot);
}

function statusLabel(runs, failures) {
  if (runs === 0 && failures > 0) return "ERROR";
  if (runs > 0 && failures > 0) return "PARTIAL";
  if (runs > 0) return "OK";
  return "NO RUNS";
}

async function main() {
  console.log("=".repeat(72));
  console.log("WEB SEARCH BENCHMARK");
  console.log("=".repeat(72));
  console.log(`  MCP endpoint : ${MCP_URL}`);
  console.log(`  Query        : ${JSON.stringify(QUERY)}`);
  console.log(`  Limit        : ${LIMIT}`);
  console.log(`  Iterations   : ${ITERATIONS}`);
  console.log(`  Warmup       : ${WARMUP}`);
  console.log(`  Unique query : ${UNIQUE_QUERIES ? "yes" : "no"}`);
  console.log("");

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  const client = new Client({ name: "web-search-benchmark", version: "1.0.0" });

  await client.connect(transport);

  const engines = ENGINE ? [ENGINE] : [...SUPPORTED_ENGINES];
  console.log(`Engines under test (${engines.length}): ${engines.join(", ")}`);
  console.log("");

  function makeQuery(run) {
    return UNIQUE_QUERIES ? `${QUERY} ${run} ${Date.now()}` : QUERY;
  }

  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    await client.callTool({ name: "web_search", arguments: { query: makeQuery(i), limit: LIMIT } });
  }
  if (WARMUP > 0) console.log(`Warmup done (${WARMUP} run${WARMUP > 1 ? "s" : ""}).\n`);

  console.log("Running per-engine benchmarks…\n");

  const rows = [];

  async function runEngine(label, engine, backend, args, isCombined = false) {
    const timings = [];
    let failures = 0;
    let results = null;
    let note = "";

    for (let i = 1; i <= ITERATIONS; i++) {
      const a = args(i);
      const start = performance.now();
      try {
        const result = await client.callTool({ name: "web_search", arguments: a });
        const duration = performance.now() - start;
        const content = result?.content?.[0]?.text || "";
        results = parseResultCount(content) ?? results;
        const runNote = /No results returned\./.test(content) ? extractErrorNote(content) : "";
        if (runNote) {
          failures += 1;
          note = note || runNote;
        } else {
          timings.push(duration);
        }
        const runStatus = runNote ? `no results — ${truncate(runNote, 80)}` : `${results} results`;
        console.log(`  [${i}/${ITERATIONS}] ${label.padEnd(14)} ${String(round(duration)).padStart(9)}ms  ${runStatus}`);
      } catch (error) {
        const duration = performance.now() - start;
        failures += 1;
        note = note || error.message;
        console.log(`  [${i}/${ITERATIONS}] ${label.padEnd(14)} ${String(round(duration)).padStart(9)}ms  error — ${truncate(error.message, 80)}`);
      }
    }

    const runCount = timings.length;
    const min = runCount ? Math.min(...timings) : null;
    const p50 = runCount ? percentile(timings, 50) : null;
    const p95 = runCount ? percentile(timings, 95) : null;
    const max = runCount ? Math.max(...timings) : null;
    const avg = runCount ? timings.reduce((s, v) => s + v, 0) / runCount : null;

    rows.push({
      engine: label,
      backend,
      isCombined,
      status: statusLabel(runCount, failures),
      results: results === null ? "—" : String(results),
      runs: runCount,
      failures,
      min,
      p50,
      p95,
      max,
      avg,
      note
    });
  }

  for (const engine of engines) {
    const meta = getEngineMetadata(engine);
    const backend = meta?.backend || "?";
    await runEngine(engine, engine, backend, (i) => ({ query: makeQuery(i), limit: LIMIT, engine }));
  }

  if (engines.length > 1) {
    await runEngine("combined (select_best)", "combined", "select_best", (i) => ({ query: makeQuery(i), limit: LIMIT }), true);
  }

  await client.close();

  console.log("\n");

  const headers = ["Engine", "Backend", "Status", "Results", "Runs", "Fail", "Min (ms)", "P50 (ms)", "P95 (ms)", "Max (ms)", "Avg (ms)", "Notes"];
  const aligns = ["left", "left", "left", "right", "right", "right", "right", "right", "right", "right", "right", "left"];
  const tableRows = rows.map((r) => [
    r.engine,
    r.backend,
    r.status,
    r.results,
    r.runs,
    r.failures,
    r.min === null ? "—" : round(r.min),
    r.p50 === null ? "—" : round(r.p50),
    r.p95 === null ? "—" : round(r.p95),
    r.max === null ? "—" : round(r.max),
    r.avg === null ? "—" : round(r.avg),
    r.note ? truncate(r.note, 56) : ""
  ]);

  console.log("SUMMARY");
  printTable(headers, tableRows, aligns);

  const ok = rows.filter((r) => r.status === "OK").length;
  const partial = rows.filter((r) => r.status === "PARTIAL").length;
  const errors = rows.filter((r) => r.status === "ERROR").length;
  console.log(`\nOK: ${ok}   PARTIAL: ${partial}   ERROR: ${errors}`);

  printAnalysis(rows, engines);
}

function printAnalysis(rows, engines) {
  console.log("\n" + "=".repeat(72));
  console.log("ANALYSIS");
  console.log("=".repeat(72));

  const successful = rows.filter((r) => r.runs > 0);
  const failing = rows.filter((r) => r.runs === 0);

  if (successful.length) {
    const byAvg = [...successful].sort((a, b) => a.avg - b.avg);
    const fastest = byAvg[0];
    const slowest = byAvg[byAvg.length - 1];

    const bestSingle = successful.filter((r) => !r.isCombined).sort((a, b) => a.avg - b.avg)[0];
    const combined = successful.find((r) => r.isCombined);

    console.log("Performance ranking (by average latency):");
    printTable(
      ["Rank", "Engine", "Avg (ms)", "Min (ms)", "P95 (ms)", "Status"],
      byAvg.map((r, i) => [i + 1, r.engine, round(r.avg), round(r.min), round(r.p95), r.status]),
      ["right", "left", "right", "right", "right", "left"]
    );
    console.log("");

    const insights = [];
    if (bestSingle && combined) {
      const deltaPct = combined.avg > 0 ? (combined.avg / bestSingle.avg - 1) * 100 : 0;
      const relation =
        deltaPct < -1
          ? `${round(Math.abs(deltaPct))}% faster than`
          : deltaPct > 1
            ? `${round(deltaPct)}% slower than`
            : "on par with";
      insights.push(
        `Fastest single engine is ${bestSingle.engine} at ${round(bestSingle.avg)}ms avg. ` +
        `Combined fallback (select_best) averaged ${round(combined.avg)}ms — ${relation} the fastest single engine.`
      );
    }
    insights.push(
      `Latency spread across working routes: ${round(byAvg[0].avg)}ms (${byAvg[0].engine}) to ${round(slowest.avg)}ms (${slowest.engine}).`
    );
    const allStable = successful.every((r) => r.runs === ITERATIONS && r.failures === 0);
    insights.push(
      allStable
        ? `All successful routes completed ${ITERATIONS}/${ITERATIONS} runs with zero failures.`
        : `${successful.length} route(s) had partial failures — see Notes column in the summary.`
    );
    if (failing.length) {
      const failingNames = failing.map((r) => r.engine).join(", ");
      insights.push(`${failing.length} route(s) returned no results at all: ${failingNames}.`);
    }

    console.log("Key observations:");
    for (const line of insights) console.log(`  • ${line}`);
  } else {
    console.log("No successful runs to analyze.");
  }

  if (failing.length) {
    console.log(`\nFailures (${failing.length} route${failing.length > 1 ? "s" : ""}):`);
    for (const f of failing) {
      console.log(`  • ${f.engine} (${f.backend}): ${f.note || "no error message"}`);
    }
  }

  if (engines.length > 1 && engines.length <= 20) {
    console.log("\nTip: run with BENCH_ENGINE=<engine> to benchmark a single route, or BENCH_ITERATIONS=3 for more stable averages.");
  }
}

main().catch((err) => {
  console.error(`Benchmark failed: ${err.message}`);
  process.exitCode = 1;
});
