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
    if (serverInstance) {
      serverInstance.close(() => {
        console.log("Server stopped");
        resolve();
      });
    } else {
      resolve();
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
