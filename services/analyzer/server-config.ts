export type StorageAdapter = "json" | "sqlite";

export interface ServerConfig {
  host: string;
  port: number;
  shutdownTimeoutMs: number;
  storageAdapter: StorageAdapter;
  nodeEnvironment: "development" | "test" | "production";
}

export function loadServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const nodeEnvironment = enumValue(
    environment.NODE_ENV,
    ["development", "test", "production"] as const,
    "development",
    "NODE_ENV"
  );
  const storageAdapter = enumValue(
    environment.STORAGE_ADAPTER,
    ["json", "sqlite"] as const,
    "json",
    "STORAGE_ADAPTER"
  );

  validateOptionalInteger(environment, "REQUEST_TIMEOUT_MS", 100, 120_000);
  validateOptionalInteger(environment, "MAX_HTML_BYTES", 1_024, 20_000_000);
  validateOptionalText(environment, "DATA_DIR", 1, 1_024);
  validateOptionalText(environment, "SQLITE_PATH", 1, 1_024);
  validateOptionalText(environment, "USER_AGENT", 1, 200);

  return {
    host: textValue(environment.HOST, "0.0.0.0", "HOST", 255),
    port: integerValue(environment.PORT, 3_000, 1, 65_535, "PORT"),
    shutdownTimeoutMs: integerValue(
      environment.SHUTDOWN_TIMEOUT_MS,
      25_000,
      1_000,
      60_000,
      "SHUTDOWN_TIMEOUT_MS"
    ),
    storageAdapter,
    nodeEnvironment
  };
}

function integerValue(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function validateOptionalInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  minimum: number,
  maximum: number
): void {
  if (environment[name] !== undefined) {
    integerValue(environment[name], minimum, minimum, maximum, name);
  }
}

function textValue(
  raw: string | undefined,
  fallback: string,
  name: string,
  maximumLength: number
): string {
  const value = raw?.trim() || fallback;
  if (value.length > maximumLength || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${name} must be printable text no longer than ${maximumLength} characters`);
  }
  return value;
}

function validateOptionalText(
  environment: NodeJS.ProcessEnv,
  name: string,
  minimumLength: number,
  maximumLength: number
): void {
  const raw = environment[name];
  if (raw === undefined) return;
  const value = raw.trim();
  if (
    value.length < minimumLength ||
    value.length > maximumLength ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`${name} must be printable text from ${minimumLength} through ${maximumLength} characters`);
  }
}

function enumValue<const Values extends readonly string[]>(
  raw: string | undefined,
  values: Values,
  fallback: Values[number],
  name: string
): Values[number] {
  const value = (raw?.trim().toLocaleLowerCase("en-US") || fallback) as string;
  if (!values.includes(value)) {
    throw new Error(`${name} must be one of: ${values.join(", ")}`);
  }
  return value as Values[number];
}
