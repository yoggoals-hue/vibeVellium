import { pathToFileURL } from "url";
import { applyServerRuntimeEnv, formatServerUrl, parseServerRuntimeOptions } from "./runtimeConfig.js";
import { createApp } from "./app/createApp.js";
import type { Server as HttpServer } from "http";

const runtimeOptions = parseServerRuntimeOptions();
applyServerRuntimeEnv(runtimeOptions);
const app = createApp();

let serverInstance: HttpServer | null = null;

export { app, serverInstance };

export function startServer(
  port: number = runtimeOptions.port,
  host: string = runtimeOptions.host
): Promise<number> {
  return new Promise((resolve, reject) => {
    // Re-read SLV_LAN_SHARING at call time (not module load time) so that
    // callers (e.g. the Electron main process's `server:restart` IPC) can
    // flip LAN sharing on/off without forcing a full app restart. The env
    // var is the source of truth — applyServerRuntimeEnv() keeps it in sync
    // with runtimeOptions.lanSharing, and we re-derive the bind host here.
    const lanSharingNow = process.env.SLV_LAN_SHARING === "1";
    const bindHost = lanSharingNow ? "0.0.0.0" : host;
    const server = app.listen(port, bindHost, () => {
      console.log(`Server running on ${formatServerUrl({ host: bindHost, port })} (lanSharing=${lanSharingNow})`);
      resolve(port);
    });
    server.on("error", reject);
    serverInstance = server;
  });
}

export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!serverInstance) {
      resolve();
      return;
    }
    const instance = serverInstance;
    serverInstance = null;

    // server.close(cb) only fires once ALL keep-alive / SSE connections drain.
    // During an active chat stream that can take 30+ seconds, leaving the
    // "Restart server" button (e.g. after toggling LAN sharing) looking dead.
    // Forcefully destroy open sockets first, then close the listener, and
    // race the whole thing against a hard 3s timeout so callers never hang.
    try {
      // Node 18.2+ — destroys all open connections immediately.
      (instance as HttpServer & { closeAllConnections?: () => void }).closeAllConnections?.();
    } catch {
      // ignore — older runtimes will fall through to the timeout below.
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.log("Server stopped");
      resolve();
    };

    const timer = setTimeout(() => {
      // Last resort: unref the listener so the process can exit even if a
      // zombie socket is wedged. Better than blocking the IPC forever.
      try { instance.unref(); } catch { /* ignore */ }
      finish();
    }, 3000);

    try {
      instance.close(() => finish());
    } catch {
      finish();
    }
  });
}

const isDirectRun = (() => {
  if (process.env.SLV_SERVER_AUTOSTART === "1") {
    return true;
  }
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(entry).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  startServer(runtimeOptions.port, runtimeOptions.host).catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}
