import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

const host = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  commands: new Map<string, () => Promise<unknown>>(),
  configChanged: undefined as undefined | (() => void),
  secretChanged: undefined as undefined | ((event: { key: string }) => void),
  key: "key-a" as string | undefined,
  get: vi.fn(),
  item: { text: "", tooltip: undefined as unknown, show: vi.fn(), dispose: vi.fn() },
  pick: vi.fn(),
  info: vi.fn(),
  warning: vi.fn()
}));

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string, fallback: unknown) => host.settings[key] ?? fallback,
      inspect: (key: string) => ({ globalValue: host.settings[key] })
    }),
    onDidChangeConfiguration: (callback: (event: unknown) => void) => {
      host.configChanged = () => callback({ affectsConfiguration: () => true });
      return { dispose() {} };
    }
  },
  commands: {
    registerCommand: (name: string, callback: () => Promise<unknown>) => {
      host.commands.set(name, callback);
      return { dispose() {} };
    }
  },
  window: {
    createStatusBarItem: () => host.item,
    showInformationMessage: host.info,
    showWarningMessage: host.warning,
    showInputBox: async () => "key-b",
    showQuickPick: host.pick
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
  QuickPickItemKind: { Separator: -1 },
  ThemeColor: class { constructor(public id: string) {} },
  MarkdownString: class {
    constructor(public value = "") {}
    appendText(text: string) { this.value += text; return this; }
    appendMarkdown(text: string) { this.value += text; return this; }
  }
}));

import { activate, deactivate } from "../extension";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const usage = (used: number) => new Response(JSON.stringify({
  mode: "quota_limited", status: "active", isValid: true, rate_limits: [{ window: "7d", limit: 100, used }]
}), { status: 200 });
const flush = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); } };
const command = (name: string) => host.commands.get(`sub2apiUsage.${name}`)!();

beforeEach(() => {
  vi.clearAllMocks();
  host.settings = { endpoint: "https://a.example/v1/usage", autoStart: false };
  host.key = "key-a";
  host.commands.clear();
  host.get.mockImplementation(async () => host.key);
  host.pick.mockResolvedValue(undefined);
  const context = {
    subscriptions: [],
    secrets: {
      get: host.get,
      store: async (_name: string, key: string) => {
        host.key = key;
        host.secretChanged?.({ key: "sub2apiUsage.apiKey" });
      },
      delete: async () => {
        host.key = undefined;
        host.secretChanged?.({ key: "sub2apiUsage.apiKey" });
      },
      onDidChange: (callback: typeof host.secretChanged) => {
        host.secretChanged = callback;
        return { dispose() {} };
      }
    }
  } as unknown as vscode.ExtensionContext;
  activate(context);
});

afterEach(() => { deactivate(); vi.unstubAllGlobals(); });

describe("refresh lifecycle", () => {
  it("cancels old endpoint requests and keeps the new request deduplicated", async () => {
    const old = deferred<Response>();
    const current = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    vi.stubGlobal("fetch", fetchMock);
    const first = command("refresh");
    await flush();
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    host.settings.endpoint = "https://b.example/v1/usage";
    host.configChanged!();
    expect(signal.aborted).toBe(true);
    expect(host.item.text).not.toContain("20.00%");
    const second = command("refresh");
    await flush();
    old.resolve(usage(20));
    await first;
    const third = command("refresh");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    current.resolve(usage(70));
    await Promise.all([second, third]);
    expect(host.item.text).toContain("70.00%");
    expect(host.info).not.toHaveBeenCalledWith(expect.stringContaining("cancelled"));
  });

  it("does not send an old key to a new endpoint while SecretStorage is pending", async () => {
    await flush();
    const secret = deferred<string>();
    host.get.mockReturnValueOnce(secret.promise);
    const fetchMock = vi.fn(async () => usage(10));
    vi.stubGlobal("fetch", fetchMock);
    const first = command("refresh");
    host.settings.endpoint = "https://b.example/v1/usage";
    host.configChanged!();
    secret.resolve("old-key");
    await first;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["setApiKey", "clearApiKey"])("isolates an in-flight request when running %s", async (name) => {
    const old = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(old.promise).mockImplementation(async () => usage(60));
    vi.stubGlobal("fetch", fetchMock);
    const first = command("refresh");
    await flush();
    await command(name);
    const expected = host.item.text;
    old.resolve(usage(20));
    await first;
    expect(host.item.text).toBe(expected);
    if (name === "setApiKey") {
      expect(expected).toContain("60.00%");
      expect(fetchMock.mock.calls[1][1].headers.authorization).toBe("Bearer key-b");
    } else {
      expect(expected).toContain("Set token");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("marks cached data stale in the status bar and details and recovers", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(usage(20)).mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(usage(30));
    vi.stubGlobal("fetch", fetchMock);
    await command("refresh");
    await command("refresh");
    expect(host.item.text).toContain("20.00%");
    expect(host.item.text).toContain("stale");
    expect((host.item.tooltip as { value: string }).value).toContain("offline");
    host.settings.statusLabel = "New label";
    host.configChanged!();
    expect(host.item.text).toContain("stale");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await command("showDetails");
    const items = host.pick.mock.calls[0][0];
    expect(items[0].label).toContain("Cached data");
    expect(items[0].description).toContain("offline");
    expect(items[1].label).toContain("Last successful refresh:");
    await command("refresh");
    expect(host.item.text).toContain("30.00%");
    expect(host.item.text).not.toContain("stale");
  });

  it("clears cached data when endpoint changes with polling disabled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => usage(20)));
    await command("refresh");
    host.settings.endpoint = "https://b.example/v1/usage";
    host.configChanged!();
    await flush();
    expect(host.item.text).not.toContain("20.00%");
    await command("showDetails");
    expect(host.pick.mock.calls[0][0][0].label).toContain("No usage data");
  });

  it("invalidates cached data on external secret changes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => usage(20)));
    await command("refresh");
    host.key = undefined;
    host.secretChanged!({ key: "sub2apiUsage.apiKey" });
    await flush();
    expect(host.item.text).toContain("Set token");
  });

  it("does not update disposed UI when a pending request finishes", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    const first = command("refresh");
    await flush();
    deactivate();
    host.item.show.mockClear();
    pending.resolve(usage(20));
    await first;
    expect(host.item.show).not.toHaveBeenCalled();
  });
});
