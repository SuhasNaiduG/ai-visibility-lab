import { describe, expect, it } from "vitest";
import { loadServerConfig } from "../../services/analyzer/server-config.js";

describe("server environment configuration", () => {
  it("uses safe local defaults", () => {
    expect(loadServerConfig({})).toEqual({
      host: "0.0.0.0",
      port: 3000,
      shutdownTimeoutMs: 25_000,
      storageAdapter: "json",
      nodeEnvironment: "development"
    });
  });

  it("accepts the production deployment configuration", () => {
    expect(loadServerConfig({
      NODE_ENV: "production",
      HOST: "0.0.0.0",
      PORT: "10000",
      STORAGE_ADAPTER: "sqlite",
      DATA_DIR: "/var/data",
      REQUEST_TIMEOUT_MS: "10000",
      MAX_HTML_BYTES: "2000000",
      SHUTDOWN_TIMEOUT_MS: "25000",
      USER_AGENT: "AI-Visibility-Lab/1.0"
    })).toMatchObject({
      nodeEnvironment: "production",
      port: 10_000,
      storageAdapter: "sqlite"
    });
  });

  it.each([
    [{ PORT: "0" }, "PORT"],
    [{ PORT: "3.14" }, "PORT"],
    [{ STORAGE_ADAPTER: "postgres" }, "STORAGE_ADAPTER"],
    [{ NODE_ENV: "live" }, "NODE_ENV"],
    [{ REQUEST_TIMEOUT_MS: "0" }, "REQUEST_TIMEOUT_MS"],
    [{ MAX_HTML_BYTES: "999999999" }, "MAX_HTML_BYTES"],
    [{ DATA_DIR: "  " }, "DATA_DIR"],
    [{ USER_AGENT: "unsafe\nagent" }, "USER_AGENT"]
  ])("rejects invalid environment input %#", (environment, expectedName) => {
    expect(() => loadServerConfig(environment)).toThrow(expectedName);
  });
});
