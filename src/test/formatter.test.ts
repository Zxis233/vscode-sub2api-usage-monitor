import { describe, expect, it } from "vitest";
import type { ExtensionConfig } from "../config";
import {
  formatMoney,
  formatTooltip,
  formatPlainSummary,
  formatStatusBarText,
  getRateLimit,
  getRemaining,
  getThresholdPercent,
  getUsagePercent
} from "../formatter";
import type { UsageResponse } from "../types";

const baseConfig: ExtensionConfig = {
  endpoint: "https://your-sub2api.example.com/v1/usage",
  pollIntervalSeconds: 300,
  displayMode: "percentage",
  compactPriority: "shortestFirst",
  statusLabel: "Sub2api",
  currencySymbol: "$",
  decimals: 2,
  show5h: true,
  show1d: true,
  show7d: true,
  placeholderText: "Sub2api Usage",
  statusBarAlignment: "right",
  statusBarPriority: 100,
  warnThresholdPercent: 80,
  dangerThresholdPercent: 95,
  enableThresholdColors: true,
  warnThresholdColor: "statusBarItem.warningBackground",
  dangerThresholdColor: "statusBarItem.errorBackground",
  autoStart: true
};

describe("total quota fallback", () => {
  const total: UsageResponse = {
    quota: { limit: 1000, used: 133.57790692, remaining: 866.42209308, unit: "USD" },
    usage: { total: { actual_cost: 133.75937692 } }
  };
  it.each([
    ["percentage", "Sub2api Total 13.36%"],
    ["compact", "Sub2api Total 13.36%"],
    ["quota", "Sub2api Total $133.58/$1000.00"],
    ["remaining", "Sub2api Total $866.42 left"]
  ] as const)("renders total quota in %s mode", (displayMode, expected) => {
    expect(formatStatusBarText(total, { ...baseConfig, displayMode })).toBe(expected);
  });
  it("includes totals in summaries and uses quota usage for alerts", () => {
    expect(getThresholdPercent(total)).toBeCloseTo(13.357790692);
    for (const format of [formatTooltip, formatPlainSummary]) {
      expect(format(total, baseConfig)).toContain("Total quota: used $133.58 / limit $1000.00 / remaining $866.42");
      expect(format(total, baseConfig)).not.toContain("No rate limit data available.");
    }
  });
  it("preserves window priority and explicit window hiding", () => {
    const mixed = { ...total, rate_limits: [{ window: "7d", limit: 100, used: 50 }] };
    expect(formatStatusBarText(mixed, baseConfig)).toBe("Sub2api 7d 50.00%");
    expect(formatStatusBarText(mixed, { ...baseConfig, show7d: false })).toBe(baseConfig.placeholderText);
    expect(getThresholdPercent(mixed)).toBe(50);
    expect(formatStatusBarText({ ...total, rate_limits: [] }, baseConfig)).toBe("Sub2api Total 13.36%");
  });
});

const response: UsageResponse = {
  rate_limits: [
    {
      limit: 30,
      remaining: 176.04833575,
      reset_at: "2026-06-20T00:00:00+08:00",
      used: 3.95166425,
      window: "5h",
      window_start: "2026-06-13T00:00:00+08:00"
    },
    {
      limit: 180,
      remaining: 176.04833575,
      reset_at: "2026-06-20T00:00:00+08:00",
      used: 3.95166425,
      window: "7d",
      window_start: "2026-06-13T00:00:00+08:00"
    }
  ]
};

describe("formatter", () => {
  it("finds 5h and 7d rate limits by window", () => {
    expect(getRateLimit(response, "5h")?.limit).toBe(30);
    expect(getRateLimit(response, "7d")?.limit).toBe(180);
  });

  it("formats percentage mode", () => {
    expect(formatStatusBarText(response, baseConfig)).toBe("Sub2api 5h 13.17% | 7d 2.20%");
  });

  it("formats quota mode", () => {
    expect(formatStatusBarText(response, { ...baseConfig, displayMode: "quota" })).toBe(
      "Sub2api 5h $3.95/$30.00 | 7d $3.95/$180.00"
    );
  });

  it("formats remaining mode using API remaining first", () => {
    expect(formatStatusBarText(response, { ...baseConfig, displayMode: "remaining" })).toBe(
      "Sub2api 5h $176.05 left | 7d $176.05 left"
    );
  });

  it("omits 5h when only 7d is configured", () => {
    expect(formatStatusBarText({ rate_limits: [response.rate_limits![1]] }, baseConfig)).toBe(
      "Sub2api 7d 2.20%"
    );
  });

  it("omits 7d when only 5h is configured", () => {
    expect(formatStatusBarText({ rate_limits: [response.rate_limits![0]] }, baseConfig)).toBe(
      "Sub2api 5h 13.17%"
    );
  });

  it("shows N/A percentage when limit is zero", () => {
    const zeroLimit: UsageResponse = {
      rate_limits: [{ window: "7d", limit: 0, used: 10, remaining: 0 }]
    };

    expect(getUsagePercent(getRateLimit(zeroLimit, "7d"))).toBeUndefined();
    expect(formatStatusBarText(zeroLimit, baseConfig)).toBe("Sub2api 7d N/A");
  });

  it("formats compact mode with 5h first by default", () => {
    expect(formatStatusBarText(response, { ...baseConfig, displayMode: "compact" })).toBe("Sub2api 5h 13.17%");
  });

  it("formats custom status label", () => {
    expect(formatStatusBarText(response, { ...baseConfig, statusLabel: "Relay A", displayMode: "compact" })).toBe(
      "Relay A 5h 13.17%"
    );
  });

  it("preserves trailing status label spaces", () => {
    const text = formatStatusBarText(response, { ...baseConfig, statusLabel: "Relay A  ", displayMode: "compact" });

    expect(text).toBe(`Relay A${"\u00a0".repeat(2)} 5h 13.17%`);
  });

  it("falls back to 5h in compact mode when 7d is missing", () => {
    expect(
      formatStatusBarText({ rate_limits: [response.rate_limits![0]] }, { ...baseConfig, displayMode: "compact" })
    ).toBe("Sub2api 5h 13.17%");
  });

  it("shows only 5h when 7d display is disabled", () => {
    expect(formatStatusBarText(response, { ...baseConfig, show7d: false })).toBe("Sub2api 5h 13.17%");
  });

  it("shows only 7d when 5h display is disabled", () => {
    expect(formatStatusBarText(response, { ...baseConfig, show5h: false })).toBe("Sub2api 7d 2.20%");
  });

  it("shows custom placeholder when both windows are disabled", () => {
    expect(formatStatusBarText(response, { ...baseConfig, show5h: false, show7d: false, placeholderText: "API hidden" })).toBe(
      "API hidden"
    );
  });

  it("uses only 7d usage for threshold percentage", () => {
    const fiveHourHighUsage: UsageResponse = {
      rate_limits: [{ window: "5h", limit: 10, used: 9 }]
    };

    expect(getThresholdPercent(fiveHourHighUsage)).toBe(90);
    expect(getThresholdPercent(response)).toBeCloseTo((3.95166425 / 180) * 100, 8);
  });

  it("computes remaining only when API remaining is absent", () => {
    expect(getRemaining({ window: "7d", limit: 10, used: 3 })).toBe(7);
  });

  it("formats missing money as N/A", () => {
    expect(formatMoney(undefined, baseConfig)).toBe("N/A");
  });

  const daily = { window: "1d", limit: 60, used: 15, remaining: 45 };

  it.each([
    ["percentage", "Sub2api 1d 25.00%"],
    ["quota", "Sub2api 1d $15.00/$60.00"],
    ["remaining", "Sub2api 1d $45.00 left"],
    ["compact", "Sub2api 1d 25.00%"]
  ] as const)("supports a daily-only key in %s mode", (displayMode, expected) => {
    expect(formatStatusBarText({ rate_limits: [daily] }, { ...baseConfig, displayMode })).toBe(expected);
  });

  it("orders all tiers by duration regardless of response order", () => {
    const all = { rate_limits: [response.rate_limits![1], daily, response.rate_limits![0]] };
    expect(formatStatusBarText(all, baseConfig)).toBe("Sub2api 5h 13.17% | 1d 25.00% | 7d 2.20%");
    expect(formatStatusBarText(all, { ...baseConfig, show1d: false })).toBe(formatStatusBarText(response, baseConfig));
    expect(formatStatusBarText(all, { ...baseConfig, displayMode: "compact" })).toBe("Sub2api 5h 13.17%");
    expect(formatStatusBarText(all, { ...baseConfig, displayMode: "compact", show5h: false })).toBe("Sub2api 1d 25.00%");
    expect(formatStatusBarText(all, { ...baseConfig, displayMode: "compact", compactPriority: "longestFirst" })).toBe("Sub2api 7d 2.20%");
    expect(formatStatusBarText(all, { ...baseConfig, displayMode: "compact", compactPriority: "longestFirst", show7d: false })).toBe("Sub2api 1d 25.00%");
    expect(formatStatusBarText(all, { ...baseConfig, show5h: false, show1d: false, show7d: false })).toBe(baseConfig.placeholderText);
  });

  it("uses 1d for thresholds only when 7d is absent", () => {
    expect(getThresholdPercent({ rate_limits: [response.rate_limits![0], daily] })).toBe(25);
    expect(getThresholdPercent({ rate_limits: [daily, response.rate_limits![1]] })).toBeCloseTo(2.20, 2);
    expect(getThresholdPercent({ rate_limits: [daily, { window: "7d", limit: 0, used: 0 }] })).toBeUndefined();
  });

  it.each([{}, { rate_limits: [] }, { rate_limits: [{ window: "unknown", limit: 10, used: 1 }] }])(
    "uses a neutral placeholder when no known windows are returned: %j", (data) => {
      expect(formatStatusBarText(data, baseConfig)).toBe(baseConfig.placeholderText);
      expect(formatStatusBarText(data, { ...baseConfig, displayMode: "compact" })).toBe(baseConfig.placeholderText);
      expect(getThresholdPercent(data)).toBeUndefined();
      expect(formatPlainSummary(data, baseConfig)).toContain("No rate limit data available.");
    }
  );

  it("includes actual windows in tooltip and copied details even when hidden in the status bar", () => {
    for (const format of [formatTooltip, formatPlainSummary]) {
      const text = format({ rate_limits: [daily] }, { ...baseConfig, show1d: false });
      expect(text).toContain("1d:");
      expect(text).not.toContain("5h:");
      expect(text).not.toContain("7d:");
      expect(text).toContain("$15.00");
    }
  });
});
