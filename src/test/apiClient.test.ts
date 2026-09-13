import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../apiClient";

describe("ApiClient endpoint validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each(["cancelled", "timeout"])("distinguishes %s requests", async (code) => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));
    const controller = new AbortController();
    const request = new ApiClient().fetchUsage({
      endpoint: "https://example.com/v1/usage", apiKey: "test", signal: controller.signal, timeoutMs: 100
    });
    const assertion = expect(request).rejects.toMatchObject({ code });
    if (code === "cancelled") { controller.abort(); }
    else { await vi.advanceTimersByTimeAsync(100); }
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects missing endpoints before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(new ApiClient().fetchUsage({ endpoint: "", apiKey: "token" })).rejects.toMatchObject({
      code: "missingEndpoint"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects external HTTP endpoints before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(new ApiClient().fetchUsage({ endpoint: "http://example.com/usage", apiKey: "token" })).rejects.toMatchObject({
      code: "invalidEndpoint"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows localhost HTTP endpoints for local testing", async () => {
    const data = { mode: "quota_limited", status: "active", isValid: true };
    const fetchMock = vi.fn(async (): Promise<Response> => new Response(JSON.stringify(data), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new ApiClient().fetchUsage({ endpoint: "http://localhost:3000/usage", apiKey: "token" })).resolves.toMatchObject(data);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserves all three backend quota windows including daily reset data", async () => {
    const rateLimits = ["5h", "1d", "7d"].map((window) => ({
      window, limit: 100, used: 25, remaining: 75,
      window_start: "2026-09-13T00:00:00Z", reset_at: "2026-09-14T00:00:00Z"
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      mode: "quota_limited", status: "active", isValid: true, rate_limits: rateLimits
    }), { status: 200 })));

    const result = await new ApiClient().fetchUsage({ endpoint: "https://example.com/v1/usage", apiKey: "test" });
    expect(result.rate_limits).toEqual(rateLimits);
  });

  const limited = { mode: "quota_limited", status: "active", isValid: true };
  const wallet = { mode: "unrestricted", planName: "钱包余额", unit: "USD", isValid: true, balance: 0, remaining: 0 };
  const fetchBody = (data: unknown) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(data), { status: 200 })));
    return new ApiClient().fetchUsage({ endpoint: "https://example.com/v1/usage", apiKey: "test" });
  };

  it("accepts the zero-usage 7d response with null window start", async () => {
    const counters = {
      actual_cost: 0, cache_creation_tokens: 0, cache_read_tokens: 0, cost: 0,
      input_tokens: 0, output_tokens: 0, requests: 0, total_tokens: 0
    };
    const result = await fetchBody({
      ...limited, daily_usage: [],
      rate_limits: [{ limit: 250, remaining: 250, used: 0, window: "7d", window_start: null }],
      usage: { average_duration_ms: 0, rpm: 0, today: counters, total: counters, tpm: 0 }
    });
    expect(result.daily_usage).toEqual([]);
    expect(result.rate_limits).toEqual([{ limit: 250, remaining: 250, used: 0, window: "7d" }]);
    expect(result.usage?.today).toEqual(counters);
    expect(result.usage?.total).toEqual(counters);
    expect(result.usage?.rpm).toBe(0);
  });

  it.each([
    limited,
    { ...limited, status: "expired" },
    { ...limited, status: "quota_exhausted", quota: { limit: 10, used: 10, remaining: 0, unit: "USD" } },
    { ...limited, isValid: false },
    { ...limited, daily_usage: null, model_stats: [], rate_limits: [], usage: null },
    wallet,
    { mode: "unrestricted", planName: "Subscription", unit: "USD", isValid: true },
    { mode: "unrestricted", planName: "Subscription", unit: "USD", isValid: true, remaining: -1,
      subscription: { daily_limit_usd: null, weekly_limit_usd: null, monthly_limit_usd: null } },
    { ...limited, rate_limits: [{ window: "30d", limit: 10, used: 12, remaining: 0 }] }
  ])("accepts backend variants and optional data: %j", async (data) => {
    await expect(fetchBody(data)).resolves.toMatchObject({ mode: data.mode, isValid: data.isValid });
  });

  it.each([
    {}, null, [], "ok", { error: { message: "Invalid API key" } },
    { code: 0, data: limited },
    { ...limited, error: { message: "upstream failure" } },
    { ...limited, mode: "unknown" }, { ...limited, mode: undefined },
    { ...limited, isValid: "true" }, { ...limited, isValid: undefined },
    { ...limited, status: "" }, { ...limited, status: undefined },
    { ...wallet, planName: undefined }, { ...wallet, unit: undefined },
    { ...limited, usage: [] }, { ...limited, daily_usage: {} },
    { ...limited, model_stats: [null] }, { ...limited, rate_limits: {} },
    { ...limited, rate_limits: [{}] },
    { ...limited, rate_limits: [{ window: "7d", limit: "250", used: 0 }] },
    { ...limited, rate_limits: [{ window: "7d", limit: 0, used: 0 }] },
    { ...limited, rate_limits: [{ window: "7d", limit: 250 }] },
    { ...limited, rate_limits: [{ window: "7d", limit: 250, used: -1 }] },
    { ...limited, rate_limits: [{ window: "7d", limit: 250, used: 0, remaining: "250" }] },
    { ...limited, rate_limits: [{ window: "7d", limit: 250, used: 0, window_start: 123 }] },
    { ...limited, rate_limits: [{ window: "7d", limit: 250, used: 0 }, { window: "7d", limit: 100, used: 0 }] }
  ])("rejects wrong endpoints and malformed responses: %j", async (data) => {
    await expect(fetchBody(data)).rejects.toMatchObject({ code: "invalidResponse" });
  });

  it("rejects an empty HTTP 200 body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    await expect(new ApiClient().fetchUsage({ endpoint: "https://example.com/v1/usage", apiKey: "test" }))
      .rejects.toMatchObject({ code: "invalidResponse" });
  });
});
