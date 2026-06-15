import * as vscode from "vscode";
import type { ExtensionConfig } from "./config";
import { toStatusBarAlignment } from "./config";
import { formatStatusBarText, formatTooltip, getThresholdPercent } from "./formatter";
import type { UsageResponse } from "./types";
import { getErrorMessage } from "./utils";

export class UsageStatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private config: ExtensionConfig;

  public constructor(config: ExtensionConfig) {
    this.config = config;
    this.item = this.createItem(config);
  }

  public updateConfig(config: ExtensionConfig): void {
    const mustRecreate =
      this.config.statusBarAlignment !== config.statusBarAlignment ||
      this.config.statusBarPriority !== config.statusBarPriority;

    this.config = config;

    if (mustRecreate) {
      this.item.dispose();
      this.item = this.createItem(config);
    }
  }

  public showUnconfigured(): void {
    this.item.text = "$(key) Sub2api Usage: Set token";
    this.item.tooltip = "No API key configured. Run Sub2api Usage: Set API Key to store it in VS Code SecretStorage.";
    this.item.show();
  }

  public showMissingEndpoint(): void {
    this.item.text = "$(gear) Sub2api Usage: Set endpoint";
    this.item.tooltip = "No usage endpoint configured. Open Sub2api Usage Monitor settings to set sub2apiUsage.endpoint.";
    this.item.show();
  }

  public showIdle(): void {
    this.item.text = "$(pulse) Sub2api Usage: Ready";
    this.item.tooltip = "Sub2api Usage Monitor is ready. Run Sub2api Usage: Refresh to query usage.";
    this.item.show();
  }

  public showLoading(): void {
    this.item.text = "$(sync~spin) Sub2api Usage";
    this.item.tooltip = "Refreshing Sub2api usage...";
    this.item.show();
  }

  public showError(error: unknown): void {
    const message = getErrorMessage(error);
    this.item.text = "$(warning) Sub2api Usage: Error";
    this.item.tooltip = `Sub2api usage refresh failed: ${message}`;
    this.item.show();
  }

  public showUsage(response: UsageResponse): void {
    const icon = this.getStatusIcon(response);
    const tooltip = new vscode.MarkdownString(formatTooltip(response, this.config), true);
    tooltip.isTrusted = false;
    tooltip.supportThemeIcons = true;

    this.item.text = `${icon} ${formatStatusBarText(response, this.config)}`;
    this.item.tooltip = tooltip;
    this.item.show();
  }

  public dispose(): void {
    this.item.dispose();
  }

  private createItem(config: ExtensionConfig): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(
      toStatusBarAlignment(config.statusBarAlignment),
      config.statusBarPriority
    );
    item.name = "Sub2api Usage Monitor";
    item.command = "sub2apiUsage.showDetails";
    return item;
  }

  private getStatusIcon(response: UsageResponse): string {
    const percent = getThresholdPercent(response, this.config);

    if (percent === undefined) {
      return "$(pulse)";
    }

    if (percent >= this.config.dangerThresholdPercent) {
      return "$(error)";
    }

    if (percent >= this.config.warnThresholdPercent) {
      return "$(warning)";
    }

    return "$(pulse)";
  }
}
