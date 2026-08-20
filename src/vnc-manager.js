import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isXvfbRunning(display) {
  const num = String(display).replace(/^:/, "");
  const lockFile = `/tmp/.X${num}-lock`;
  try {
    const pid = parseInt(fs.readFileSync(lockFile, "utf8"), 10);
    return isProcessAlive(pid);
  } catch {
    return false;
  }
}

function clearStaleDisplayFiles(display) {
  const num = String(display).replace(/^:/, "");
  for (const filePath of [`/tmp/.X${num}-lock`, `/tmp/.X11-unix/X${num}`]) {
    try { fs.rmSync(filePath, { force: true }); } catch {}
  }
}

export class VncManager {
  constructor(options = {}) {
    this.display = options.display || ":99";
    this.vncPort = options.vncPort || 1995;
    this.novncPort = options.novncPort || 1996;
    this.ownedPids = new Map();
    this.status = "stopped";
    this.steps = [];
    this.lastError = null;
  }

  addStep(text) {
    this.steps.push({ at: Date.now(), text });
    if (this.steps.length > 20) this.steps.shift();
    console.error(`🔌  VNC: ${text}`);
  }

  spawnProcess(name, binary, args, onReady) {
    const proc = spawn(binary, args, {
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, DISPLAY: this.display }
    });
    this.ownedPids.set(name, proc.pid);
    this.addStep(`${name} started (pid ${proc.pid})`);

    let ready = false;
    proc.stderr.on("data", (_chunk) => {
      if (onReady && !ready) {
        ready = true;
        onReady(proc);
      }
    });
    proc.on("error", (err) => {
      this.lastError = `${name}: ${String(err?.message || err)}`;
      this.addStep(`${name} failed: ${this.lastError}`);
    });
    proc.on("exit", (code) => {
      if (this.ownedPids.get(name) === proc.pid) {
        this.ownedPids.delete(name);
        this.addStep(`${name} exited (code ${code})`);
      }
    });
    return proc;
  }

  async waitFor(probe, label, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await probe()) return true;
      await sleep(150);
    }
    return false;
  }

  probeTcp(port, host = "127.0.0.1") {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        socket.destroy();
        resolve(ok);
      };
      socket.setTimeout(500);
      socket.once("connect", () => finish(true));
      socket.once("timeout", () => finish(false));
      socket.once("error", () => finish(false));
      socket.connect(port, host);
    });
  }

  probeX11() {
    return new Promise((resolve) => {
      execFile("xdpyinfo", ["-display", this.display], { timeout: 2000 }, (err) => resolve(!err));
    });
  }

  async getStatus() {
    const xvfbUp = isXvfbRunning(this.display);
    return {
      status: this.status,
      display: this.display,
      vncPort: this.vncPort,
      novncPort: this.novncPort,
      running: xvfbUp,
      ownedPids: [...this.ownedPids.entries()].map(([name, pid]) => ({ name, pid, alive: isProcessAlive(pid) })),
      steps: this.steps.slice(),
      lastError: this.lastError
    };
  }

  async adoptProcess(name, pattern) {
    if (this.ownedPids.has(name)) return;
    const pid = await new Promise((resolve) => {
      execFile("pgrep", ["-f", pattern], { timeout: 1000 }, (error, stdout) => {
        const found = error ? NaN : parseInt(String(stdout).split("\n")[0], 10);
        resolve(Number.isFinite(found) ? found : null);
      });
    });
    if (pid && isProcessAlive(pid)) {
      this.ownedPids.set(name, pid);
      this.addStep(`${name} adopted (pid ${pid})`);
    }
  }

  async start() {
    if (this.status === "starting") return { ok: false, error: "VNC already starting" };
    this.status = "starting";
    this.steps = [];
    this.lastError = null;

    const reusedXvfb = isXvfbRunning(this.display);
    if (reusedXvfb) {
      this.addStep("Xvfb already running — reusing existing display");
      await this.adoptProcess("xvfb", `Xvfb ${this.display}`);
    } else {
      clearStaleDisplayFiles(this.display);
      this.addStep(`spawning Xvfb on ${this.display}…`);
      this.spawnProcess("xvfb", "Xvfb", [
        this.display,
        "-screen", "0", "1920x1080x24",
        "-ac", "+extension", "RANDR"
      ]);
    }
    const xReady = await this.waitFor(() => this.probeX11(), "Xvfb");
    if (!xReady) {
      this.status = "error";
      this.lastError = this.lastError || "Xvfb did not become ready within 15s";
      this.addStep(`Xvfb failed: ${this.lastError}`);
      return { ok: false, error: this.lastError };
    }
    this.addStep("Xvfb ready");

    if (!(await this.probeTcp(this.vncPort))) {
      this.spawnProcess("fluxbox", "fluxbox", []);
      this.spawnProcess("x11vnc", "x11vnc", [
        "-display", this.display,
        "-rfbport", String(this.vncPort),
        "-forever", "-shared", "-nopw"
      ]);
    } else {
      await this.adoptProcess("x11vnc", `x11vnc.*-rfbport ${this.vncPort}`);
      this.addStep(`x11vnc already listening on :${this.vncPort}`);
    }

    const vncReady = await this.waitFor(() => this.probeTcp(this.vncPort), "x11vnc");
    if (!vncReady) {
      this.status = "error";
      this.lastError = "x11vnc did not start listening within 15s";
      this.addStep(this.lastError);
      return { ok: false, error: this.lastError };
    }
    this.addStep(`x11vnc listening on :${this.vncPort}`);

    if (!(await this.probeTcp(this.novncPort))) {
      this.spawnProcess("websockify", "websockify", [
        "--web=/usr/share/novnc/",
        String(this.novncPort),
        `localhost:${this.vncPort}`
      ]);
    } else {
      await this.adoptProcess("websockify", `websockify.* ${this.novncPort} `);
      this.addStep(`noVNC already listening on :${this.novncPort}`);
    }
    const webReady = await this.waitFor(() => this.probeTcp(this.novncPort), "noVNC");
    if (!webReady) {
      this.status = "error";
      this.lastError = "noVNC did not start listening within 15s";
      this.addStep(this.lastError);
      return { ok: false, error: this.lastError };
    }
    this.addStep(`noVNC ready on :${this.novncPort}`);

    this.status = "running";
    return { ok: true, reused: reusedXvfb };
  }

  async stop() {
    // The entrypoint may have started the stack before Node did. Adopt only
    // processes scoped to this display and configured ports before stopping.
    if (!this.ownedPids.size) {
      await this.adoptProcess("xvfb", `Xvfb ${this.display}`);
      await this.adoptProcess("x11vnc", `x11vnc.*-rfbport ${this.vncPort}`);
      await this.adoptProcess("websockify", `websockify.* ${this.novncPort} `);
    }
    for (const [name, pid] of this.ownedPids.entries()) {
      this.addStep(`stopping ${name} (pid ${pid})…`);
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // process already gone
      }
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && isProcessAlive(pid)) {
        await sleep(100);
      }
      if (isProcessAlive(pid)) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // ignore
        }
      }
    }
    this.ownedPids.clear();
    this.status = "stopped";
    this.addStep("VNC stack stopped");
    return { ok: true };
  }
}

export const vncManager = new VncManager();
