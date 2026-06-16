import type { ExtensionConfig } from "./config";
import type { RateLimit, RateLimitWindow, UsageResponse } from "./types";

export function getRateLimit(response: UsageResponse, window: RateLimitWindow): RateLimit | undefined {
  return response.rate_limits?.find((rateLimit) => rateLimit.window === window);
}

export function getUsagePercent(rateLimit?: RateLimit): number | undefined {
  if (!rateLimit || rateLimit.limit === undefined || rateLimit.used === undefined || rateLimit.limit <= 0) {
    return undefined;
  }

  return (rateLimit.used / rateLimit.limit) * 100;
}

export function getRemaining(rateLimit?: RateLimit): number | undefined {
  if (!rateLimit) {
    return undefined;
  }

  if (rateLimit.remaining !== undefined) {
    return rateLimit.remaining;
  }

  if (rateLimit.limit !== undefined && rateLimit.used !== undefined) {
    return rateLimit.limit - rateLimit.used;
  }

  return undefined;
}

export function formatMoney(value: number | undefined, config: ExtensionConfig): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${config.currencySymbol}${value.toFixed(config.decimals)}`;
}

export function formatPercent(value: number | undefined, config: ExtensionConfig): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${value.toFixed(config.decimals)}%`;
}

export function formatStatusBarText(response: UsageResponse, config: ExtensionConfig): string {
  if (!config.show5h && !config.show7d) {
    return config.placeholderText;
  }

  if (config.displayMode === "compact") {
    return formatCompactStatus(response, config);
  }

  const parts: string[] = [];

  if (config.show5h) {
    parts.push(formatWindowStatus("5h", getRateLimit(response, "5h"), config));
  }

  if (config.show7d) {
    parts.push(formatWindowStatus("7d", getRateLimit(response, "7d"), config));
  }

  return parts.length > 0 ? `Sub2api ${parts.join(" | ")}` : config.placeholderText;
}

export function formatTooltip(response: UsageResponse, config: ExtensionConfig): string {
  const lines = [
    "### Sub2api Usage Monitor",
    "",
    `- Status: ${formatText(response.status)}`,
    `- Mode: ${formatText(response.mode)}`,
    `- Expires At: ${formatText(response.expires_at)}`,
    `- Days Until Expiry: ${formatPlainNumber(response.days_until_expiry)}`,
    `- RPM / TPM: ${formatPlainNumber(response.usage?.rpm)} / ${formatPlainNumber(response.usage?.tpm)}`,
    `- Today Cost: ${formatMoney(response.usage?.today?.actual_cost ?? response.usage?.today?.cost, config)}`,
    `- Total Cost: ${formatMoney(response.usage?.total?.actual_cost ?? response.usage?.total?.cost, config)}`,
    "",
    "#### Rate Limits",
    formatRateLimitTooltip("5h", getRateLimit(response, "5h"), config),
    formatRateLimitTooltip("7d", getRateLimit(response, "7d"), config),
    "",
    "#### Models"
  ];

  const models = response.model_stats ?? [];
  if (models.length === 0) {
    lines.push("- N/A");
  } else {
    for (const model of models) {
      lines.push(
        `- ${formatText(model.model)}: requests ${formatPlainNumber(model.requests)} / cost ${formatMoney(model.actual_cost ?? model.cost, config)} / tokens ${formatPlainNumber(model.total_tokens)}`
      );
    }
  }

  return lines.join("\n");
}

export function formatDetailsLines(response: UsageResponse, config: ExtensionConfig): string[] {
  const lines = [
    `Status: ${formatText(response.status)}`,
    `Mode: ${formatText(response.mode)}`,
    `Expires: ${formatText(response.expires_at)}`,
    `Days Until Expiry: ${formatPlainNumber(response.days_until_expiry)}`,
    "",
    formatRateLimitDetail("5h", getRateLimit(response, "5h"), config),
    formatRateLimitDetail("7d", getRateLimit(response, "7d"), config),
    "",
    `Today: requests ${formatPlainNumber(response.usage?.today?.requests)} / cost ${formatMoney(response.usage?.today?.actual_cost ?? response.usage?.today?.cost, config)}`,
    `Total: requests ${formatPlainNumber(response.usage?.total?.requests)} / cost ${formatMoney(response.usage?.total?.actual_cost ?? response.usage?.total?.cost, config)}`,
    "",
    "Models:"
  ];

  const models = response.model_stats ?? [];
  if (models.length === 0) {
    lines.push("N/A");
  } else {
    for (const model of models) {
      lines.push(
        `${formatText(model.model)}: requests ${formatPlainNumber(model.requests)} / cost ${formatMoney(model.actual_cost ?? model.cost, config)} / tokens ${formatPlainNumber(model.total_tokens)}`
      );
    }
  }

  return lines;
}

export function formatPlainSummary(response: UsageResponse, config: ExtensionConfig): string {
  return formatDetailsLines(response, config).join("\n");
}

export function getThresholdPercent(response: UsageResponse): number | undefined {
  return getUsagePercent(getRateLimit(response, "7d"));
}

function formatCompactStatus(response: UsageResponse, config: ExtensionConfig): string {
  const sevenDay = config.show7d ? getRateLimit(response, "7d") : undefined;
  const fiveHour = config.show5h ? getRateLimit(response, "5h") : undefined;

  if (sevenDay) {
    return `Sub2api ${formatWindowStatus("7d", sevenDay, { ...config, displayMode: "percentage" })}`;
  }

  if (fiveHour) {
    return `Sub2api ${formatWindowStatus("5h", fiveHour, { ...config, displayMode: "percentage" })}`;
  }

  return config.placeholderText;
}

function formatWindowStatus(window: RateLimitWindow, rateLimit: RateLimit | undefined, config: ExtensionConfig): string {
  if (!rateLimit) {
    return `${window} N/A`;
  }

  switch (config.displayMode) {
    case "quota":
      return `${window} ${formatMoney(rateLimit.used, config)}/${formatMoney(rateLimit.limit, config)}`;
    case "remaining":
      return `${window} ${formatMoney(getRemaining(rateLimit), config)} left`;
    case "percentage":
    case "compact":
      return `${window} ${formatPercent(getUsagePercent(rateLimit), config)}`;
  }
}

function formatRateLimitTooltip(window: RateLimitWindow, rateLimit: RateLimit | undefined, config: ExtensionConfig): string {
  if (!rateLimit) {
    return `- ${window}: N/A`;
  }

  return `- ${window}: limit ${formatMoney(rateLimit.limit, config)} / used ${formatMoney(rateLimit.used, config)} / remaining ${formatMoney(rateLimit.remaining, config)} / computed remaining ${formatMoney(computeRemaining(rateLimit), config)} / reset ${formatText(rateLimit.reset_at)} / window start ${formatText(rateLimit.window_start)}`;
}

function formatRateLimitDetail(window: RateLimitWindow, rateLimit: RateLimit | undefined, config: ExtensionConfig): string {
  if (!rateLimit) {
    return `${window}: N/A`;
  }

  return `${window}: used ${formatMoney(rateLimit.used, config)} / limit ${formatMoney(rateLimit.limit, config)} / remaining ${formatMoney(getRemaining(rateLimit), config)} / reset ${formatText(rateLimit.reset_at)}`;
}

function computeRemaining(rateLimit: RateLimit): number | undefined {
  if (rateLimit.limit === undefined || rateLimit.used === undefined) {
    return undefined;
  }

  return rateLimit.limit - rateLimit.used;
}

function formatText(value: string | undefined): string {
  return value?.trim() ? value : "N/A";
}

function formatPlainNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "N/A";
  }

  return String(value);
}
