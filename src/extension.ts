import * as vscode from "vscode";
import { ApiClient } from "./apiClient";
import { affectsExtensionConfig, getExtensionConfig, SECRET_API_KEY, type ExtensionConfig } from "./config";
import { registerCommands, type RefreshResult } from "./commands";
import { UsageStatusBar } from "./statusBar";
import type { UsageResponse } from "./types";

let controller: UsageController | undefined;

export function activate(context: vscode.ExtensionContext): void {
  controller = new UsageController(context);
  context.subscriptions.push(controller);
  controller.activate();
}

export function deactivate(): void {
  controller?.dispose();
  controller = undefined;
}

class UsageController implements vscode.Disposable {
  private config: ExtensionConfig;
  private readonly apiClient = new ApiClient();
  private readonly statusBar: UsageStatusBar;
  private readonly disposables: vscode.Disposable[] = [];
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private refreshPromise: Promise<RefreshResult> | undefined;
  private lastResponse: UsageResponse | undefined;
  private lastError: unknown;
  private disposed = false;

  public constructor(private readonly context: vscode.ExtensionContext) {
    this.config = getExtensionConfig();
    this.statusBar = new UsageStatusBar(this.config);

    this.disposables.push(
      this.statusBar,
      ...registerCommands(context, {
        refresh: () => this.refresh(),
        getApiKey: () => this.resolveApiKey(),
        getConfig: () => this.config,
        getLastResponse: () => this.lastResponse,
        getLastError: () => this.lastError
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (affectsExtensionConfig(event)) {
          this.handleConfigChanged();
        }
      })
    );
  }

  public activate(): void {
    if (this.config.autoStart) {
      void this.refresh();
      this.restartPollTimer();
      return;
    }

    void this.renderInitialState();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.stopPollTimer();

    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private async renderInitialState(): Promise<void> {
    const apiKey = await this.resolveApiKey();
    if (!apiKey) {
      this.statusBar.showUnconfigured();
      return;
    }

    this.statusBar.showIdle();
  }

  private refresh(): Promise<RefreshResult> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh().finally(() => {
      this.refreshPromise = undefined;
    });

    return this.refreshPromise;
  }

  private async doRefresh(): Promise<RefreshResult> {
    const apiKey = await this.resolveApiKey();
    if (!apiKey) {
      this.lastResponse = undefined;
      this.lastError = undefined;
      this.statusBar.showUnconfigured();
      return "unconfigured";
    }

    this.statusBar.showLoading();

    try {
      const response = await this.apiClient.fetchUsage({
        endpoint: this.config.endpoint,
        apiKey
      });

      this.lastResponse = response;
      this.lastError = undefined;
      this.statusBar.showUsage(response);
      return "success";
    } catch (error) {
      this.lastError = error;
      this.statusBar.showError(error);
      return "error";
    }
  }

  private async resolveApiKey(): Promise<string | undefined> {
    const secretApiKey = (await this.context.secrets.get(SECRET_API_KEY))?.trim();
    if (secretApiKey) {
      return secretApiKey;
    }

    return this.config.apiKey || undefined;
  }

  private handleConfigChanged(): void {
    this.config = getExtensionConfig();
    this.statusBar.updateConfig(this.config);
    this.renderLastState();
    this.restartPollTimer();
    void this.refresh();
  }

  private renderLastState(): void {
    if (this.lastResponse) {
      this.statusBar.showUsage(this.lastResponse);
      return;
    }

    if (this.lastError) {
      this.statusBar.showError(this.lastError);
      return;
    }

    void this.renderInitialState();
  }

  private restartPollTimer(): void {
    this.stopPollTimer();

    if (!this.config.autoStart) {
      return;
    }

    this.pollTimer = setInterval(() => {
      void this.refresh();
    }, this.config.pollIntervalSeconds * 1000);
  }

  private stopPollTimer(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }
}
