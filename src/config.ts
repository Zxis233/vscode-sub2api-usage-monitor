import * as vscode from "vscode";
import { clampNumber } from "./utils";

export const CONFIG_SECTION = "sub2apiUsage";
export const SECRET_API_KEY = "sub2apiUsage.apiKey";

export type DisplayMode = "percentage" | "quota" | "remaining" | "compact";
export type StatusBarSide = "left" | "right";

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
  autoStart: boolean;
}

const DEFAULT_ENDPOINT = "";
const MIN_POLL_INTERVAL_SECONDS = 30;
const MAX_POLL_INTERVAL_SECONDS = 86_400;

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
    warnThresholdPercent: clampNumber(config.get<number>("warnThresholdPercent", 80), 0, 100),
    dangerThresholdPercent: clampNumber(config.get<number>("dangerThresholdPercent", 95), 0, 100),
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

function normalizePlaceholderText(value: string): string {
  return value.trim() || "Sub2api Usage";
}

function normalizeEndpoint(value: string): string {
  return value.trim();
}

function getGlobalSetting<T>(config: vscode.WorkspaceConfiguration, key: string, fallback: T): T {
  const inspected = config.inspect<T>(key);
  return inspected?.globalValue ?? inspected?.defaultValue ?? fallback;
}
