import pino, { type Logger as PinoLogger } from "pino";

/**
 * Provider-neutral structured logging backed by Pino.
 *
 * Native JSON logs go to stdout by default. Additional sinks can be attached
 * for an enhanced panel, a collector, or tests without coupling the app to a
 * particular observability vendor.
 */

const SENSITIVE_KEY_PATTERN =
  /password|secret|token|authorization|cookie|apiKey|card|session|credit/i;

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogContext = Record<string, unknown>;

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  [key: string]: unknown;
}

export interface LogSink {
  write(entry: LogEntry): void;
}

export interface LoggerOptions {
  level?: LogLevel;
  context?: LogContext;
  sinks?: LogSink[];
  native?: boolean;
}

export function sanitizeValue(key: string, value: any, depth = 0): any {
  if (depth > 6) return "[MAX_DEPTH]";
  if (value === null || value === undefined) return value;

  if (SENSITIVE_KEY_PATTERN.test(key)) return "[REDACTED]";

  if (typeof value === "string") {
    if (
      /^bearer\s+[a-zA-Z0-9_\-.]+/i.test(value) ||
      /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(value)
    ) {
      return "[REDACTED_TOKEN]";
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(key, item, depth + 1));
  }

  if (typeof value === "object") {
    const sanitizedObj: Record<string, any> = {};
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      sanitizedObj[nestedKey] = sanitizeValue(
        nestedKey,
        nestedValue,
        depth + 1,
      );
    }
    return sanitizedObj;
  }

  return value;
}

export function sanitizePayload(payload: any): any {
  if (typeof payload !== "object" || payload === null) return payload;
  return sanitizeValue("root", payload, 0);
}

function configuredLevel(): LogLevel {
  const value = process.env.LOG_LEVEL;
  if (
    value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error"
  )
    return value;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const PinoRedactionPaths = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "apiKey",
  "card",
  "session",
  "credit",
  "data.password",
  "data.secret",
  "data.token",
  "data.authorization",
  "data.cookie",
  "data.apiKey",
  "data.card",
  "data.session",
  "data.credit",
  "error.password",
  "error.secret",
  "error.token",
];

function createPinoLogger(level: LogLevel): PinoLogger {
  return pino({
    level,
    base: null,
    timestamp: false,
    redact: {
      paths: PinoRedactionPaths,
      censor: "[REDACTED]",
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
  });
}

export function createNativeLogSink(): LogSink {
  const nativeLogger = createPinoLogger(configuredLevel());
  return {
    write(entry) {
      nativeLogger[entry.level](entry);
    },
  };
}

function errorDetails(error: unknown): LogEntry["error"] | undefined {
  if (!error) return undefined;
  if (error instanceof Error) {
    return sanitizePayload({
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    });
  }
  return sanitizePayload({ name: "UnknownError", message: String(error) });
}

export function createLogger(options: LoggerOptions = {}) {
  const level = options.level ?? configuredLevel();
  const sinks = options.sinks ?? [];
  const native = options.native ?? options.sinks === undefined;
  const nativeLogger = native ? createPinoLogger(level) : undefined;
  const context = options.context ?? {};

  function write(
    levelName: LogLevel,
    message: string,
    data?: unknown,
    error?: unknown,
  ): void {
    if (LOG_LEVEL_PRIORITY[levelName] < LOG_LEVEL_PRIORITY[level]) return;

    const errorData = error !== undefined ? errorDetails(error) : undefined;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: levelName,
      message,
      ...sanitizePayload(context),
      ...(data !== undefined ? { data: sanitizePayload(data) } : {}),
      ...(errorData !== undefined ? { error: errorData } : {}),
    };

    if (nativeLogger) {
      const { level: _level, ...nativeEntry } = entry;
      nativeLogger[levelName](nativeEntry);
    }

    for (const sink of sinks) {
      try {
        sink.write(entry);
      } catch {
        // Logging must never take down the request being observed.
      }
    }
  }

  return {
    info: (message: string, data?: unknown) => write("info", message, data),
    warn: (message: string, data?: unknown) => write("warn", message, data),
    error: (message: string, error?: unknown) =>
      write("error", message, undefined, error),
    debug: (message: string, data?: unknown) => write("debug", message, data),
    child: (childContext: LogContext) =>
      createLogger({
        level,
        context: { ...context, ...childContext },
        sinks,
        native,
      }),
  };
}

export function createMemoryLogSink(maxEntries = 500): LogSink & {
  entries(): LogEntry[];
  clear(): void;
} {
  const buffer: LogEntry[] = [];
  const capacity = Math.max(1, maxEntries);

  return {
    write(entry) {
      buffer.push(entry);
      if (buffer.length > capacity) buffer.splice(0, buffer.length - capacity);
    },
    entries: () => [...buffer],
    clear: () => buffer.splice(0, buffer.length),
  };
}

/** Recent events for an optional server-side enhanced log panel. */
export const panelLogSink = createMemoryLogSink();

const defaultSinks =
  process.env.LOG_PANEL_ENABLED === "true" ? [panelLogSink] : undefined;

const defaultLoggerOptions: LoggerOptions = { native: true };
if (defaultSinks) defaultLoggerOptions.sinks = defaultSinks;

export const logger = createLogger(defaultLoggerOptions);
