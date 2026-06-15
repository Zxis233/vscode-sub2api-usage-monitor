import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../apiClient";

describe("ApiClient endpoint validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
});
