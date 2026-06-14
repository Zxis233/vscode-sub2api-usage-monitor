import * as vscode from "vscode";
import { clampNumber } from "./utils";

export const CONFIG_SECTION = "sub2apiUsage";
export const SECRET_API_KEY = "sub2apiUsage.apiKey";

export type DisplayMode = "percentage" | "quota" | "remaining" | "compact";
export type StatusBarSide = "left" | "right";

export interface ExtensionConfig {
  endpoint: string;
  apiKey: string;
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

const DEFAULT_ENDPOINT = "https://api.your.sub2api.com/v1/usage";

export function getExtensionConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  const decimals = clampNumber(config.get<number>("decimals", 2), 0, 6);
  const pollIntervalSeconds = Math.max(config.get<number>("pollIntervalSeconds", 300), 30);

  return {
    endpoint: config.get<string>("endpoint", DEFAULT_ENDPOINT).trim() || DEFAULT_ENDPOINT,
    apiKey: config.get<string>("apiKey", "").trim(),
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
