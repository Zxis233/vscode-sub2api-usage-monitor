import { describe, expect, it } from "vitest";
import type { ExtensionConfig } from "../config";
import {
  formatMoney,
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
  currencySymbol: "$",
  decimals: 2,
  show5h: true,
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

  it("shows N/A when 5h is missing", () => {
    expect(formatStatusBarText({ rate_limits: [response.rate_limits![1]] }, baseConfig)).toBe(
      "Sub2api 5h N/A | 7d 2.20%"
    );
  });

  it("shows N/A when 7d is missing", () => {
    expect(formatStatusBarText({ rate_limits: [response.rate_limits![0]] }, baseConfig)).toBe(
      "Sub2api 5h 13.17% | 7d N/A"
    );
  });

  it("shows N/A percentage when limit is zero", () => {
    const zeroLimit: UsageResponse = {
      rate_limits: [{ window: "7d", limit: 0, used: 10, remaining: 0 }]
    };

    expect(getUsagePercent(getRateLimit(zeroLimit, "7d"))).toBeUndefined();
    expect(formatStatusBarText(zeroLimit, baseConfig)).toBe("Sub2api 5h N/A | 7d N/A");
  });

  it("formats compact mode with 7d first", () => {
    expect(formatStatusBarText(response, { ...baseConfig, displayMode: "compact" })).toBe("Sub2api 7d 2.20%");
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

    expect(getThresholdPercent(fiveHourHighUsage)).toBeUndefined();
    expect(getThresholdPercent(response)).toBeCloseTo((3.95166425 / 180) * 100, 8);
  });

  it("computes remaining only when API remaining is absent", () => {
    expect(getRemaining({ window: "7d", limit: 10, used: 3 })).toBe(7);
  });

  it("formats missing money as N/A", () => {
    expect(formatMoney(undefined, baseConfig)).toBe("N/A");
  });
});
