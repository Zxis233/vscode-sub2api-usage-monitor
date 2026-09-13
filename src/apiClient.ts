import type { DailyUsage, ModelStat, RateLimit, UsageCounters, UsageResponse, UsageSummary } from "./types";
import { isRecord, toBooleanValue, toFiniteNumber, toStringValue } from "./utils";

export type UsageApiErrorCode =
  | "missingEndpoint"
  | "invalidEndpoint"
  | "timeout"
  | "cancelled"
  | "unauthorized"
  | "forbidden"
  | "rateLimited"
  | "server"
  | "http"
  | "network"
  | "invalidJson"
  | "invalidResponse";

export interface FetchUsageOptions {
  endpoint: string;
  apiKey: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class UsageApiError extends Error {
  public readonly code: UsageApiErrorCode;
  public readonly statusCode?: number;
  public readonly responseBody?: string;

  public constructor(message: string, code: UsageApiErrorCode, statusCode?: number, responseBody?: string) {
    super(message);
    this.name = "UsageApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export class ApiClient {
  public async fetchUsage(options: FetchUsageOptions): Promise<UsageResponse> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const endpoint = parseUsageEndpoint(options.endpoint);
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) {
      controller.abort();
    }
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint.toString(), {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${options.apiKey}`
        },
        signal: controller.signal
      });

      const body = await response.text();

      if (!response.ok) {
        throw createHttpError(response.status, body);
      }

      let parsed: unknown;
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch {
        throw new UsageApiError("Usage API returned a non-JSON response.", "invalidJson", response.status, body);
      }

      return normalizeUsageResponse(parsed);
    } catch (error) {
      if (options.signal?.aborted) {
        throw new UsageApiError("Usage API request cancelled.", "cancelled");
      }
      if (error instanceof UsageApiError) {
        throw error;
      }

      if (isAbortError(error)) {
        throw new UsageApiError(`Usage API request timed out after ${timeoutMs}ms.`, "timeout");
      }

      throw new UsageApiError(`Usage API request failed: ${error instanceof Error ? error.message : String(error)}`, "network");
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
    }
  }
}

function parseUsageEndpoint(endpoint: string): URL {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    throw new UsageApiError("Usage API endpoint is not configured.", "missingEndpoint");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new UsageApiError("Usage API endpoint must be a valid URL.", "invalidEndpoint");
  }

  if (url.protocol === "https:" || (url.protocol === "http:" && isLoopbackHost(url.hostname))) {
    return url;
  }

  throw new UsageApiError("Usage API endpoint must use HTTPS, except for localhost testing.", "invalidEndpoint");
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function createHttpError(statusCode: number, body: string): UsageApiError {
  if (statusCode === 401) {
    return new UsageApiError("Usage API returned 401 Unauthorized. Check the configured API key.", "unauthorized", statusCode, body);
  }

  if (statusCode === 403) {
    return new UsageApiError("Usage API returned 403 Forbidden. The API key may not have permission.", "forbidden", statusCode, body);
  }

  if (statusCode === 429) {
    return new UsageApiError("Usage API returned 429 Too Many Requests. Try again later.", "rateLimited", statusCode, body);
  }

  if (statusCode >= 500) {
    return new UsageApiError(`Usage API server error (${statusCode}).`, "server", statusCode, body);
  }

  return new UsageApiError(`Usage API request failed with HTTP ${statusCode}.`, "http", statusCode, body);
}

function normalizeUsageResponse(value: unknown): UsageResponse {
  validateUsageResponse(value);

  return {
    daily_usage: normalizeArray(value.daily_usage, normalizeDailyUsage),
    days_until_expiry: toFiniteNumber(value.days_until_expiry),
    expires_at: toStringValue(value.expires_at),
    isValid: toBooleanValue(value.isValid),
    mode: toStringValue(value.mode),
    model_stats: normalizeArray(value.model_stats, normalizeModelStat),
    rate_limits: normalizeArray(value.rate_limits, normalizeRateLimit),
    status: toStringValue(value.status),
    usage: normalizeUsageSummary(value.usage)
  };
}

function validateUsageResponse(value: unknown): asserts value is Record<string, unknown> {
  const invalid = (field: string): never => {
    throw new UsageApiError(
      `Usage API returned an invalid Sub2api response (${field}). Check that the endpoint points to /v1/usage.`,
      "invalidResponse"
    );
  };

  if (!isRecord(value)) { return invalid("root"); }
  if (value.error !== undefined && value.error !== null) { invalid("error"); }
  if (typeof value.isValid !== "boolean") { invalid("isValid"); }

  // These fields are unconditional in the corresponding gateway handler branch.
  // Quotas and statistics are conditional: failed best-effort queries can omit them.
  if (value.mode === "quota_limited") {
    if (typeof value.status !== "string" || !value.status.trim()) { invalid("status"); }
  } else if (value.mode === "unrestricted") {
    if (typeof value.planName !== "string") { invalid("planName"); }
    if (typeof value.unit !== "string" || !value.unit.trim()) { invalid("unit"); }
  } else {
    invalid("mode");
  }

  for (const field of ["daily_usage", "model_stats", "rate_limits"] as const) {
    const items = value[field];
    if (items != null && (!Array.isArray(items) || !items.every(isRecord))) { invalid(field); }
  }
  if (value.usage != null && !isRecord(value.usage)) { invalid("usage"); }

  if (Array.isArray(value.rate_limits)) {
    const windows = new Set<string>();
    for (const item of value.rate_limits) {
      // Keep new window names forward-compatible, but never silently render broken quota data.
      if (typeof item.window !== "string" || !item.window.trim() || windows.has(item.window)) {
        invalid("rate_limits.window");
      }
      windows.add(item.window);
      if (toFiniteNumber(item.limit) === undefined || item.limit <= 0) { invalid("rate_limits.limit"); }
      if (toFiniteNumber(item.used) === undefined || item.used < 0) { invalid("rate_limits.used"); }
      if (item.remaining != null && toFiniteNumber(item.remaining) === undefined) { invalid("rate_limits.remaining"); }
      for (const field of ["window_start", "reset_at"] as const) {
        if (item[field] != null && typeof item[field] !== "string") { invalid(`rate_limits.${field}`); }
      }
    }
  }
}

function normalizeArray<T>(value: unknown, mapper: (item: Record<string, unknown>) => T): T[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter(isRecord).map(mapper);
}

function normalizeDailyUsage(value: Record<string, unknown>): DailyUsage {
  return {
    date: toStringValue(value.date),
    requests: toFiniteNumber(value.requests),
    input_tokens: toFiniteNumber(value.input_tokens),
    output_tokens: toFiniteNumber(value.output_tokens),
    cache_read_tokens: toFiniteNumber(value.cache_read_tokens),
    cache_write_tokens: toFiniteNumber(value.cache_write_tokens),
    cache_creation_tokens: toFiniteNumber(value.cache_creation_tokens),
    total_tokens: toFiniteNumber(value.total_tokens),
    cost: toFiniteNumber(value.cost),
    actual_cost: toFiniteNumber(value.actual_cost)
  };
}

function normalizeModelStat(value: Record<string, unknown>): ModelStat {
  return {
    model: toStringValue(value.model),
    requests: toFiniteNumber(value.requests),
    input_tokens: toFiniteNumber(value.input_tokens),
    output_tokens: toFiniteNumber(value.output_tokens),
    cache_creation_tokens: toFiniteNumber(value.cache_creation_tokens),
    cache_read_tokens: toFiniteNumber(value.cache_read_tokens),
    total_tokens: toFiniteNumber(value.total_tokens),
    cost: toFiniteNumber(value.cost),
    actual_cost: toFiniteNumber(value.actual_cost),
    account_cost: toFiniteNumber(value.account_cost)
  };
}

function normalizeRateLimit(value: Record<string, unknown>): RateLimit {
  return {
    limit: toFiniteNumber(value.limit),
    remaining: toFiniteNumber(value.remaining),
    reset_at: toStringValue(value.reset_at),
    used: toFiniteNumber(value.used),
    window: toStringValue(value.window),
    window_start: toStringValue(value.window_start)
  };
}

function normalizeUsageSummary(value: unknown): UsageSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    average_duration_ms: toFiniteNumber(value.average_duration_ms),
    rpm: toFiniteNumber(value.rpm),
    today: normalizeUsageCounters(value.today),
    total: normalizeUsageCounters(value.total),
    tpm: toFiniteNumber(value.tpm)
  };
}

function normalizeUsageCounters(value: unknown): UsageCounters | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    actual_cost: toFiniteNumber(value.actual_cost),
    cache_creation_tokens: toFiniteNumber(value.cache_creation_tokens),
    cache_read_tokens: toFiniteNumber(value.cache_read_tokens),
    cost: toFiniteNumber(value.cost),
    input_tokens: toFiniteNumber(value.input_tokens),
    output_tokens: toFiniteNumber(value.output_tokens),
    requests: toFiniteNumber(value.requests),
    total_tokens: toFiniteNumber(value.total_tokens)
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
