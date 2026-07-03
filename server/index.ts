import { pathToFileURL } from "url";
import { applyServerRuntimeEnv, formatServerUrl, parseServerRuntimeOptions } from "./runtimeConfig.js";
import { createApp } from "./app/createApp.js";
import { db } from "./db.js";
import type { Server as HttpServer } from "http";

const runtimeOptions = parseServerRuntimeOptions();
applyServerRuntimeEnv(runtimeOptions);
const app = createApp();

let serverInstance: HttpServer | null = null;

export { app, serverInstance };

/**
 * Read the persisted `lanSharing` flag directly from the SQLite settings DB.
 *
 * This is a FALLBACK for the case where the Electron main process's
 * `readPersistedRuntimeSettings()` failed to load `better-sqlite3` (signalled
 * by `SLV_DB_READ_FAILED=1`). That failure happens in packaged Electron
 * builds when `better-sqlite3` is bundled into `dist-electron/main.cjs` by
 * esbuild: the `bindings` package walks the call stack via
 * `Error.captureStackTrace` to find the calling file, then walks up
 * directories looking for `package.json`. In the bundle, every application
 * frame shares the same `__filename` (the bundle path), so `bindings` skips
 * them all and lands on a `node:internal/process/task_queues` frame — which
 * is not a real path on disk, so `getRoot()` throws
 * "Could not find module root given file: node:internal/process/task_queues".
 *
 * The server itself uses the REAL `better-sqlite3` from `node_modules` (the
 * server bundle is built with `--external:better-sqlite3`, and the Electron
 * main bundle is too after the package.json fix), so it can always read the
 * DB reliably. This fallback ensures the user's persisted LAN-sharing
 * preference takes effect even when running an old `main.cjs` built before
 * the `--external:better-sqlite3` fix.
 *
 * Returns `true` if the persisted setting is `lanSharing: true`, `false` if
 * it's explicitly `false`, or `null` if it can't be determined (in which
 * case the caller keeps the env-var/CLI value).
 */
function readPersistedLanSharingFromDb(): boolean | null {
  try {
    const row = db.prepare("SELECT payload FROM settings WHERE id = 1").get() as { payload?: string } | undefined;
    if (!row?.payload) return null;
    const parsed = JSON.parse(row.payload) as { lanSharing?: unknown };
    if (typeof parsed.lanSharing !== "boolean") return null;
    return parsed.lanSharing;
  } catch {
    return null;
  }
}

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
    let lanSharingNow = process.env.SLV_LAN_SHARING === "1";

    // Second-line fallback: if the Electron main couldn't read the SQLite
    // settings DB (signalled via SLV_DB_READ_FAILED=1), re-read the persisted
    // lanSharing value here. The server has a working better-sqlite3 (loaded
    // from node_modules, not bundled), so this always succeeds. This is what
    // actually makes the in-app "LAN Sharing" toggle take effect in packaged
    // builds that haven't yet been rebuilt with the --external:better-sqlite3
    // esbuild fix.
    if (process.env.SLV_DB_READ_FAILED === "1") {
      const persistedLanSharing = readPersistedLanSharingFromDb();
      if (persistedLanSharing !== null) {
        lanSharingNow = persistedLanSharing;
        // Keep the env var in sync so the rest of the server (CORS middleware,
        // /api/lan-info, the server:restart IPC return value) sees the
        // corrected value.
        process.env.SLV_LAN_SHARING = persistedLanSharing ? "1" : "0";
      }
    }

    const bindHost = lanSharingNow ? "0.0.0.0" : host;
    const server = app.listen(port, bindHost, () => {
      // Show both the display URL (127.0.0.1 for 0.0.0.0, for clickability)
      // and the actual bind host, so users running --host 0.0.0.0 can see
      // at a glance that the server is listening on all interfaces.
      console.log(`Server running on ${formatServerUrl({ host: bindHost, port })} (bind=${bindHost}, lanSharing=${lanSharingNow})`);
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
