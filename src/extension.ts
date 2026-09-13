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
  private lastSuccessAt: Date | undefined;
  private generation = 0;
  private requestController: AbortController | undefined;
  private changingKey = false;
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
        getLastError: () => this.lastError,
        getLastSuccessAt: () => this.lastSuccessAt,
        setApiKey: (key) => this.setApiKey(key)
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (affectsExtensionConfig(event)) {
          this.handleConfigChanged();
        }
      }),
      context.secrets.onDidChange((event) => {
        if (event.key === SECRET_API_KEY && !this.changingKey && !this.disposed) {
          this.invalidateIdentity();
          if (this.config.autoStart) {
            void this.refresh();
          } else {
            void this.renderInitialState();
          }
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
    this.invalidateIdentity();
    this.stopPollTimer();

    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private async renderInitialState(): Promise<void> {
    const generation = this.generation;
    if (this.disposed) { return; }
    if (!this.config.endpoint) {
      this.statusBar.showMissingEndpoint();
      return;
    }

    this.statusBar.showIdle();
    let apiKey: string | undefined;
    try {
      apiKey = await this.resolveApiKey();
    } catch (error) {
      if (this.isCurrent(generation)) {
        this.lastError = error;
        this.statusBar.showError(error);
      }
      return;
    }
    if (!this.isCurrent(generation)) { return; }
    if (!apiKey) {
      this.statusBar.showUnconfigured();
      return;
    }

    this.statusBar.showIdle();
  }

  private refresh(): Promise<RefreshResult> {
    if (this.disposed || this.changingKey) { return Promise.resolve("cancelled"); }
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const generation = ++this.generation;
    const controller = new AbortController();
    this.requestController = controller;
    const promise = this.doRefresh(generation, this.config.endpoint, controller.signal).finally(() => {
      if (this.refreshPromise === promise) {
        this.refreshPromise = undefined;
        this.requestController = undefined;
      }
    });
    this.refreshPromise = promise;

    return this.refreshPromise;
  }

  private async doRefresh(generation: number, endpoint: string, signal: AbortSignal): Promise<RefreshResult> {
    if (!endpoint) {
      this.lastResponse = undefined;
      this.lastError = undefined;
      this.lastSuccessAt = undefined;
      this.statusBar.showMissingEndpoint();
      return "missingEndpoint";
    }

    try {
      const apiKey = await this.resolveApiKey();
      if (!this.isCurrent(generation)) { return "cancelled"; }
      if (!apiKey) {
        this.lastResponse = undefined;
        this.lastError = undefined;
        this.lastSuccessAt = undefined;
        this.statusBar.showUnconfigured();
        return "missingApiKey";
      }

      this.statusBar.showLoading();

      const response = await this.apiClient.fetchUsage({
        endpoint,
        apiKey,
        signal
      });

      if (!this.isCurrent(generation)) { return "cancelled"; }
      this.lastResponse = response;
      this.lastError = undefined;
      this.lastSuccessAt = new Date();
      this.statusBar.showUsage(response);
      return "success";
    } catch (error) {
      if (!this.isCurrent(generation)) { return "cancelled"; }
      this.lastError = error;
      this.renderLastState();
      return "error";
    }
  }

  private async resolveApiKey(): Promise<string | undefined> {
    const secretApiKey = (await this.context.secrets.get(SECRET_API_KEY))?.trim();
    return secretApiKey || undefined;
  }

  private handleConfigChanged(): void {
    if (this.disposed) { return; }
    const previous = this.config;
    this.config = getExtensionConfig();
    const endpointChanged = previous.endpoint !== this.config.endpoint;
    if (endpointChanged) { this.invalidateIdentity(); }
    this.statusBar.updateConfig(this.config);
    this.renderLastState();
    this.restartPollTimer();

    if (this.config.autoStart && (endpointChanged || !previous.autoStart)) {
      void this.refresh();
    }
  }

  private renderLastState(): void {
    if (this.disposed) { return; }
    if (this.lastError) {
      if (this.lastResponse && this.lastSuccessAt) {
        this.statusBar.showStale(this.lastResponse, this.lastError, this.lastSuccessAt);
      } else {
        this.statusBar.showError(this.lastError);
      }
      return;
    }
    if (this.lastResponse) {
      this.statusBar.showUsage(this.lastResponse);
      return;
    }

    if (this.refreshPromise) {
      this.statusBar.showLoading();
      return;
    }

    void this.renderInitialState();
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }

  private invalidateIdentity(): void {
    ++this.generation;
    this.requestController?.abort();
    this.requestController = undefined;
    this.refreshPromise = undefined;
    this.lastResponse = undefined;
    this.lastError = undefined;
    this.lastSuccessAt = undefined;
  }

  private async setApiKey(key: string | undefined): Promise<void> {
    if (this.disposed) { return; }
    if (this.changingKey) {
      throw new Error("An API key update is already in progress. Try again after it finishes.");
    }
    this.changingKey = true;
    this.invalidateIdentity();
    this.statusBar.showLoading();
    try {
      if (key === undefined) {
        await this.context.secrets.delete(SECRET_API_KEY);
      } else {
        await this.context.secrets.store(SECRET_API_KEY, key);
      }
    } finally {
      this.changingKey = false;
      this.invalidateIdentity();
      await this.refresh();
    }
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
