import * as vscode from "vscode";
import type { ExtensionConfig } from "./config";
import { SECRET_API_KEY } from "./config";
import {
  formatMoney,
  formatPlainSummary,
  getRateLimit,
  getRemaining
} from "./formatter";
import type { RateLimitWindow, UsageResponse } from "./types";
import { getErrorMessage } from "./utils";

export type RefreshResult = "success" | "error" | "missingEndpoint" | "missingApiKey";

export interface CommandDependencies {
  refresh: () => Promise<RefreshResult>;
  getApiKey: () => Promise<string | undefined>;
  getConfig: () => ExtensionConfig;
  getLastResponse: () => UsageResponse | undefined;
  getLastError: () => unknown;
}

interface ActionQuickPickItem extends vscode.QuickPickItem {
  action?: "setApiKey" | "refresh" | "settings" | "copySummary";
}

export function registerCommands(
  context: vscode.ExtensionContext,
  dependencies: CommandDependencies
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("sub2apiUsage.refresh", async () => {
      const result = await dependencies.refresh();
      if (result === "success") {
        vscode.window.showInformationMessage("Sub2api usage refreshed.");
      } else if (result === "missingEndpoint") {
        vscode.window.showWarningMessage("Sub2api usage endpoint is not configured.");
      } else if (result === "missingApiKey") {
        vscode.window.showWarningMessage("Sub2api API key is not configured.");
      } else {
        vscode.window.showWarningMessage(`Sub2api usage refresh failed: ${getErrorMessage(dependencies.getLastError())}`);
      }
    }),
    vscode.commands.registerCommand("sub2apiUsage.setApiKey", async () => {
      const apiKey = await vscode.window.showInputBox({
        title: "Set Sub2api API Key",
        prompt: "Enter the Bearer Token for the usage API.",
        password: true,
        ignoreFocusOut: true,
        placeHolder: "sk-..."
      });

      if (apiKey === undefined) {
        return;
      }

      const trimmed = apiKey.trim();
      if (!trimmed) {
        vscode.window.showWarningMessage("API key was empty. Nothing was saved.");
        return;
      }

      await context.secrets.store(SECRET_API_KEY, trimmed);
      vscode.window.showInformationMessage("Sub2api API key saved to VS Code SecretStorage.");
      await dependencies.refresh();
    }),
    vscode.commands.registerCommand("sub2apiUsage.clearApiKey", async () => {
      await context.secrets.delete(SECRET_API_KEY);
      vscode.window.showInformationMessage("Sub2api API key removed from VS Code SecretStorage.");
      await dependencies.refresh();
    }),
    vscode.commands.registerCommand("sub2apiUsage.showDetails", async () => {
      await showDetails(dependencies);
    }),
    vscode.commands.registerCommand("sub2apiUsage.openSettings", async () => {
      await openSettings();
    })
  ];
}

async function showDetails(dependencies: CommandDependencies): Promise<void> {
  if (!dependencies.getConfig().endpoint) {
    const selected = await vscode.window.showQuickPick<ActionQuickPickItem>(
      [
        { label: "$(gear) Open Settings", description: "Configure sub2apiUsage.endpoint", action: "settings" },
        { label: "$(key) Set API Key", description: "Store token in SecretStorage", action: "setApiKey" }
      ],
      {
        title: "Sub2api Usage Monitor",
        placeHolder: "Usage endpoint is not configured."
      }
    );

    await handleAction(selected, dependencies);
    return;
  }

  const apiKey = await dependencies.getApiKey();
  if (!apiKey) {
    const selected = await vscode.window.showQuickPick<ActionQuickPickItem>(
      [
        { label: "$(key) Set API Key", description: "Store token in SecretStorage", action: "setApiKey" },
        { label: "$(gear) Open Settings", description: "Configure sub2apiUsage settings", action: "settings" }
      ],
      {
        title: "Sub2api Usage Monitor",
        placeHolder: "API key is not configured."
      }
    );

    await handleAction(selected, dependencies);
    return;
  }

  const response = dependencies.getLastResponse();
  if (!response) {
    const error = dependencies.getLastError();
    const selected = await vscode.window.showQuickPick<ActionQuickPickItem>(
      [
        {
          label: error ? "$(warning) Last refresh failed" : "$(info) No usage data loaded",
          description: error ? getErrorMessage(error) : "Run a refresh to load usage data."
        },
        { label: "$(sync) Refresh now", action: "refresh" },
        { label: "$(gear) Open Settings", action: "settings" }
      ],
      {
        title: "Sub2api Usage Monitor"
      }
    );

    await handleAction(selected, dependencies);
    return;
  }

  const selected = await vscode.window.showQuickPick<ActionQuickPickItem>(buildDetailsItems(response, dependencies.getConfig()), {
    title: "Sub2api Usage Monitor",
    matchOnDescription: true,
    matchOnDetail: true
  });

  await handleAction(selected, dependencies, response);
}

function buildDetailsItems(response: UsageResponse, config: ExtensionConfig): ActionQuickPickItem[] {
  const items: ActionQuickPickItem[] = [
    { label: "Account", kind: vscode.QuickPickItemKind.Separator },
    { label: `Status: ${response.status ?? "N/A"}` },
    { label: `Mode: ${response.mode ?? "N/A"}` },
    { label: `Expires: ${response.expires_at ?? "N/A"}` },
    { label: `Days Until Expiry: ${response.days_until_expiry ?? "N/A"}` },
    { label: `RPM / TPM: ${response.usage?.rpm ?? "N/A"} / ${response.usage?.tpm ?? "N/A"}` },
    { label: "Rate Limits", kind: vscode.QuickPickItemKind.Separator },
    buildRateLimitItem("5h", getRateLimit(response, "5h"), config),
    buildRateLimitItem("7d", getRateLimit(response, "7d"), config),
    { label: "Usage", kind: vscode.QuickPickItemKind.Separator },
    {
      label: `Today: requests ${response.usage?.today?.requests ?? "N/A"} / cost ${formatMoney(response.usage?.today?.actual_cost ?? response.usage?.today?.cost, config)}`
    },
    {
      label: `Total: requests ${response.usage?.total?.requests ?? "N/A"} / cost ${formatMoney(response.usage?.total?.actual_cost ?? response.usage?.total?.cost, config)}`
    },
    { label: "Models", kind: vscode.QuickPickItemKind.Separator },
    ...buildModelItems(response, config),
    { label: "Actions", kind: vscode.QuickPickItemKind.Separator },
    { label: "$(sync) Refresh now", action: "refresh" },
    { label: "$(gear) Open Settings", action: "settings" },
    { label: "$(copy) Copy summary", action: "copySummary" }
  ];

  return items;
}

function buildRateLimitItem(window: RateLimitWindow, rateLimit: ReturnType<typeof getRateLimit>, config: ExtensionConfig): ActionQuickPickItem {
  if (!rateLimit) {
    return { label: `${window}: N/A` };
  }

  return {
    label: `${window}: used ${formatMoney(rateLimit.used, config)} / limit ${formatMoney(rateLimit.limit, config)} / remaining ${formatMoney(getRemaining(rateLimit), config)}`,
    description: `reset ${rateLimit.reset_at ?? "N/A"}`,
    detail: `raw remaining ${formatMoney(rateLimit.remaining, config)} / window start ${rateLimit.window_start ?? "N/A"}`
  };
}

function buildModelItems(response: UsageResponse, config: ExtensionConfig): ActionQuickPickItem[] {
  const models = response.model_stats ?? [];
  if (models.length === 0) {
    return [{ label: "N/A" }];
  }

  return models.map((model) => ({
    label: `${model.model ?? "N/A"}: requests ${model.requests ?? "N/A"} / cost ${formatMoney(model.actual_cost ?? model.cost, config)}`,
    description: `tokens ${model.total_tokens ?? "N/A"}`
  }));
}

async function handleAction(
  selected: ActionQuickPickItem | undefined,
  dependencies: CommandDependencies,
  response?: UsageResponse
): Promise<void> {
  switch (selected?.action) {
    case "setApiKey":
      await vscode.commands.executeCommand("sub2apiUsage.setApiKey");
      break;
    case "refresh":
      await dependencies.refresh();
      break;
    case "settings":
      await openSettings();
      break;
    case "copySummary": {
      const data = response ?? dependencies.getLastResponse();
      if (data) {
        const summary = formatPlainSummary(data, dependencies.getConfig());
        await vscode.env.clipboard.writeText(summary);
        vscode.window.showInformationMessage("Sub2api usage summary copied.");
      }
      break;
    }
  }
}

async function openSettings(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.openSettings", "sub2apiUsage");
}
