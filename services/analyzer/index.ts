import { createApp } from "./app.js";
import { loadServerConfig } from "./server-config.js";

const config = loadServerConfig();
const server = createApp().listen(config.port, config.host, () => {
  log("server_started", {
    host: config.host,
    port: config.port,
    environment: config.nodeEnvironment,
    storageAdapter: config.storageAdapter
  });
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log("server_stopping", { signal });

  const forceTimer = setTimeout(() => {
    log("server_shutdown_timeout", { timeoutMs: config.shutdownTimeoutMs });
    server.closeAllConnections();
    process.exitCode = 1;
  }, config.shutdownTimeoutMs);
  forceTimer.unref();

  server.close((error) => {
    clearTimeout(forceTimer);
    if (error) {
      log("server_shutdown_error", { message: error.message });
      process.exitCode = 1;
      return;
    }
    log("server_stopped", {});
  });
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

function log(event: string, fields: Readonly<Record<string, unknown>>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...fields
  }));
}
