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
    const fetchMock = vi.fn(async (): Promise<Response> => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new ApiClient().fetchUsage({ endpoint: "http://localhost:3000/usage", apiKey: "token" })).resolves.toEqual({});
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
});
