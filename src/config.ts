import * as vscode from "vscode";
import { clampNumber } from "./utils";

export const CONFIG_SECTION = "sub2apiUsage";
export const SECRET_API_KEY = "sub2apiUsage.apiKey";

export type DisplayMode = "percentage" | "quota" | "remaining" | "compact";
export type StatusBarSide = "left" | "right";
export type ThresholdColor = "statusBarItem.warningBackground" | "statusBarItem.errorBackground";

export interface ExtensionConfig {
  endpoint: string;
  pollIntervalSeconds: number;
  displayMode: DisplayMode;
  currencySymbol: string;
  decimals: number;
  show5h: boolean;
  show7d: boolean;
  placeholderText: string;
  statusBarAlignment: StatusBarSide;
  statusBarPriority: number;
  warnThresholdPercent: number;
  dangerThresholdPercent: number;
  enableThresholdColors: boolean;
  warnThresholdColor: ThresholdColor;
  dangerThresholdColor: ThresholdColor;
  autoStart: boolean;
}

const DEFAULT_ENDPOINT = "";
const MIN_POLL_INTERVAL_SECONDS = 30;
const MAX_POLL_INTERVAL_SECONDS = 86_400;
const DEFAULT_WARN_THRESHOLD_COLOR = "statusBarItem.warningBackground";
const DEFAULT_DANGER_THRESHOLD_COLOR = "statusBarItem.errorBackground";
const WARN_THRESHOLD_PERCENT_KEY = "threshold.percent.warn";
const DANGER_THRESHOLD_PERCENT_KEY = "threshold.percent.danger";
const ENABLE_THRESHOLD_COLORS_KEY = "threshold.enableColors";
const WARN_THRESHOLD_COLOR_KEY = "threshold.color.warn";
const DANGER_THRESHOLD_COLOR_KEY = "threshold.color.danger";
const LEGACY_WARN_THRESHOLD_PERCENT_KEY = "warnThresholdPercent";
const LEGACY_DANGER_THRESHOLD_PERCENT_KEY = "dangerThresholdPercent";
const LEGACY_ENABLE_THRESHOLD_COLORS_KEY = "enableThresholdColors";
const LEGACY_WARN_THRESHOLD_COLOR_KEY = "warnThresholdColor";
const LEGACY_DANGER_THRESHOLD_COLOR_KEY = "dangerThresholdColor";

export function getExtensionConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  const decimals = clampNumber(config.get<number>("decimals", 2), 0, 6);
  const pollIntervalSeconds = clampNumber(
    config.get<number>("pollIntervalSeconds", 300),
    MIN_POLL_INTERVAL_SECONDS,
    MAX_POLL_INTERVAL_SECONDS
  );

  return {
    endpoint: normalizeEndpoint(getGlobalSetting(config, "endpoint", DEFAULT_ENDPOINT)),
    pollIntervalSeconds,
    displayMode: normalizeDisplayMode(config.get<string>("displayMode", "percentage")),
    currencySymbol: config.get<string>("currencySymbol", "$"),
    decimals,
    show5h: config.get<boolean>("show5h", true),
    show7d: config.get<boolean>("show7d", true),
    placeholderText: normalizePlaceholderText(config.get<string>("placeholderText", "Sub2api Usage")),
    statusBarAlignment: normalizeStatusBarAlignment(config.get<string>("statusBarAlignment", "right")),
    statusBarPriority: config.get<number>("statusBarPriority", 100),
    warnThresholdPercent: clampNumber(
      getSettingWithLegacy(config, WARN_THRESHOLD_PERCENT_KEY, LEGACY_WARN_THRESHOLD_PERCENT_KEY, 80),
      0,
      100
    ),
    dangerThresholdPercent: clampNumber(
      getSettingWithLegacy(config, DANGER_THRESHOLD_PERCENT_KEY, LEGACY_DANGER_THRESHOLD_PERCENT_KEY, 95),
      0,
      100
    ),
    enableThresholdColors: getSettingWithLegacy(
      config,
      ENABLE_THRESHOLD_COLORS_KEY,
      LEGACY_ENABLE_THRESHOLD_COLORS_KEY,
      true
    ),
    warnThresholdColor: normalizeThresholdColor(
      getSettingWithLegacy(
        config,
        WARN_THRESHOLD_COLOR_KEY,
        LEGACY_WARN_THRESHOLD_COLOR_KEY,
        DEFAULT_WARN_THRESHOLD_COLOR
      ),
      DEFAULT_WARN_THRESHOLD_COLOR
    ),
    dangerThresholdColor: normalizeThresholdColor(
      getSettingWithLegacy(
        config,
        DANGER_THRESHOLD_COLOR_KEY,
        LEGACY_DANGER_THRESHOLD_COLOR_KEY,
        DEFAULT_DANGER_THRESHOLD_COLOR
      ),
      DEFAULT_DANGER_THRESHOLD_COLOR
    ),
    autoStart: config.get<boolean>("autoStart", true)
  };
}

export function affectsExtensionConfig(event: vscode.ConfigurationChangeEvent): boolean {
  return event.affectsConfiguration(CONFIG_SECTION);
}

export function toStatusBarAlignment(side: StatusBarSide): vscode.StatusBarAlignment {
  return side === "left" ? vscode.StatusBarAlignment.Left : vscode.StatusBarAlignment.Right;
}

function normalizeDisplayMode(value: string): DisplayMode {
  if (value === "quota" || value === "remaining" || value === "compact") {
    return value;
  }

  return "percentage";
}

function normalizeStatusBarAlignment(value: string): StatusBarSide {
  return value === "left" ? "left" : "right";
}

function normalizeThresholdColor(value: string, fallback: ThresholdColor): ThresholdColor {
  if (value === "statusBarItem.warningBackground" || value === "statusBarItem.errorBackground") {
    return value;
  }

  return fallback;
}

function normalizePlaceholderText(value: string): string {
  return value.trim() || "Sub2api Usage";
}

function normalizeEndpoint(value: string): string {
  return value.trim();
}

function getSettingWithLegacy<T>(
  config: vscode.WorkspaceConfiguration,
  key: string,
  legacyKey: string,
  fallback: T
): T {
  if (hasConfiguredSetting(config, key)) {
    return config.get<T>(key, fallback);
  }

  if (hasConfiguredSetting(config, legacyKey)) {
    return config.get<T>(legacyKey, fallback);
  }

  return config.get<T>(key, fallback);
}

function hasConfiguredSetting(config: vscode.WorkspaceConfiguration, key: string): boolean {
  const inspected = config.inspect(key);

  return Boolean(
    inspected &&
      (inspected.globalValue !== undefined ||
        inspected.workspaceValue !== undefined ||
        inspected.workspaceFolderValue !== undefined ||
        inspected.globalLanguageValue !== undefined ||
        inspected.workspaceLanguageValue !== undefined ||
        inspected.workspaceFolderLanguageValue !== undefined)
  );
}

function getGlobalSetting<T>(config: vscode.WorkspaceConfiguration, key: string, fallback: T): T {
  const inspected = config.inspect<T>(key);
  return inspected?.globalValue ?? inspected?.defaultValue ?? fallback;
}
