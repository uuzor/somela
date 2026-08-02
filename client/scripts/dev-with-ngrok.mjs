import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import localtunnel from "localtunnel";

const basePort = Number(process.env.VITE_PORT || process.env.PORT || 5173);
const authToken = process.env.NGROK_AUTHTOKEN || process.env.NGROK_AUTH_TOKEN || "";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const viteBin = resolve(rootDir, "node_modules/vite/bin/vite.js");
const ngrokBin = process.platform === "win32"
  ? resolve(rootDir, "node_modules/.bin/ngrok.cmd")
  : resolve(rootDir, "node_modules/.bin/ngrok");

let tunnelUrl = null;
let tunnelType = null;
let ngrokProcess = null;
let localTunnel = null;
let shuttingDown = false;
let tunnelResolved = false;
let ngrokWarned = false;

async function isPortFree(port) {
  return await new Promise((resolveResult) => {
    const server = createServer();
    server.unref();
    server.on("error", () => resolveResult(false));
    server.listen(port, "0.0.0.0", () => {
      server.close(() => resolveResult(true));
    });
  });
}

async function findPort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortFree(port)) return port;
  }
  return startPort;
}

const PORT = await findPort(basePort);

const vite = spawn(process.execPath, [viteBin, "--host", "0.0.0.0", "--port", String(PORT)], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: String(PORT),
    VITE_PORT: String(PORT),
  },
});

function spawnNgrok(args) {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/c", ngrokBin, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: process.env,
    });
  }

  return spawn(ngrokBin, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: process.env,
  });
}

function logTunnel(url, type) {
  if (tunnelResolved || !url) return;
  tunnelResolved = true;
  tunnelUrl = url;
  tunnelType = type;
  console.log("");
  console.log("[" + type + "] HTTPS tunnel ready: " + url);
  console.log("[" + type + "] Local frontend: http://127.0.0.1:" + PORT);
}

async function startLocalTunnel() {
  if (tunnelResolved || localTunnel) return;
  try {
    localTunnel = await localtunnel({ port: PORT });
    logTunnel(localTunnel.url, "localtunnel");
    localTunnel.on("close", () => {
      if (!shuttingDown) {
        console.error("[localtunnel] tunnel closed");
      }
    });
  } catch (error) {
    console.error("[localtunnel] Failed to start tunnel:", error);
    void shutdown(1);
  }
}

function startNgrok() {
  const args = ["http", String(PORT), "--log=stdout", "--pooling-enabled"];
  if (authToken) {
    args.push("--authtoken=" + authToken);
  }
  if (process.env.NGROK_URL) {
    args.push("--url=" + process.env.NGROK_URL);
  }

  try {
    ngrokProcess = spawnNgrok(args);
  } catch (error) {
    const message = String(error?.message || error);
    console.warn("[ngrok] Could not spawn ngrok, falling back to localtunnel: " + message);
    void startLocalTunnel();
    return;
  }

  const handleLine = (line) => {
    const forwardingMatch = line.match(/Forwarding\s+(https:\/\/\S+)\s+->/i);
    if (forwardingMatch) {
      logTunnel(forwardingMatch[1], "ngrok");
    }

    if (/ERR_NGROK_334|already online|multiple endpoints|pooling-enabled/i.test(line)) {
      if (!ngrokWarned) {
        ngrokWarned = true;
        console.warn("[ngrok] Endpoint already online or pooling mismatch. Falling back to localtunnel...");
      }
    }
  };

  let stdoutBuffer = "";
  ngrokProcess.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || "";
    for (const line of lines) handleLine(line.trim());
  });

  let stderrBuffer = "";
  ngrokProcess.stderr.on("data", (chunk) => {
    stderrBuffer += chunk.toString();
    const lines = stderrBuffer.split(/\r?\n/);
    stderrBuffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      handleLine(trimmed);
      if (!/ERR_NGROK_334|already online|multiple endpoints|pooling-enabled/i.test(trimmed)) {
        console.error("[ngrok] " + trimmed);
      }
    }
  });

  ngrokProcess.on("exit", (code) => {
    if (!shuttingDown && !tunnelResolved) {
      void startLocalTunnel();
      return;
    }
    if (!shuttingDown && code && code !== 0 && !tunnelResolved) {
      console.error("[ngrok] CLI exited with code " + code);
      void startLocalTunnel();
    }
  });

  setTimeout(() => {
    if (!tunnelResolved && !shuttingDown) {
      console.log("[ngrok] No tunnel URL yet, falling back to localtunnel...");
      try {
        ngrokProcess?.kill("SIGTERM");
      } catch {
        // ignore cleanup errors
      }
      void startLocalTunnel();
    }
  }, 7000);
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  try {
    if (localTunnel) {
      await localTunnel.close();
    }
  } catch {
    // ignore tunnel shutdown errors
  }

  try {
    if (ngrokProcess) {
      ngrokProcess.kill("SIGTERM");
    }
  } catch {
    // ignore process shutdown errors
  }

  try {
    vite.kill("SIGTERM");
  } catch {
    // ignore Vite shutdown errors
  }

  process.exit(code);
}

process.on("SIGINT", () => {
  void shutdown(0);
});
process.on("SIGTERM", () => {
  void shutdown(0);
});

vite.on("exit", async (code) => {
  void shutdown(code ?? 0);
});

console.log("[dev] Using port " + PORT);
startNgrok();

