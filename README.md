# Sub2api Usage Monitor

![Sub2api Usage Monitor logo](assets/logo.png)

Author: Esing

Sub2api Usage Monitor is a VS Code extension that shows Sub2api relay API usage in the bottom status bar.

Examples:

- `$(pulse) Sub2api 5h 13.17% | 7d 2.20%`
- `$(pulse) Sub2api 5h $3.95/$30.00 | 7d $3.95/$180.00`
- `$(pulse) Sub2api 5h $176.05 left | 7d $176.05 left`
- `$(key) Sub2api Usage: Set token`

## Install Dependencies

```bash
npm install
```

## Run Locally

1. Run `npm install`.
2. Run `npm run compile`.
3. Open this folder in VS Code.
4. Press `F5` and choose `Run Extension`.
5. In the Extension Development Host, run `Sub2api Usage: Set API Key`.

## Configure Token

Recommended:

1. Open Command Palette.
2. Run `Sub2api Usage: Set API Key`.
3. Paste the Bearer token. The input is password masked.
4. The token is stored in VS Code SecretStorage under `sub2apiUsage.apiKey`.

Fallback:

Set `sub2apiUsage.apiKey` in VS Code settings. SecretStorage takes priority over this setting.

Token priority:

1. VS Code SecretStorage
2. `sub2apiUsage.apiKey`
3. Unconfigured state

## Commands

- `Sub2api Usage: Refresh`: manually refresh usage.
- `Sub2api Usage: Set API Key`: save the token to SecretStorage.
- `Sub2api Usage: Clear API Key`: delete the SecretStorage token.
- `Sub2api Usage: Show Details`: open detailed usage Quick Pick.
- `Sub2api Usage: Open Settings`: open extension settings.

## Settings

- `sub2apiUsage.endpoint`: usage endpoint. Default `https://api.your.sub2api.com/v1/usage`.
- `sub2apiUsage.apiKey`: fallback Bearer Token. Prefer SecretStorage.
- `sub2apiUsage.pollIntervalSeconds`: polling interval in seconds. Minimum `30`.
- `sub2apiUsage.displayMode`: `percentage`, `quota`, `remaining`, or `compact`.
- `sub2apiUsage.currencySymbol`: currency prefix. Default `$`.
- `sub2apiUsage.decimals`: decimals for money and percentages. Range `0` to `6`.
- `sub2apiUsage.show5h`: show the 5h window.
- `sub2apiUsage.show7d`: show the 7d window.
- `sub2apiUsage.placeholderText`: status bar text shown when both `show5h` and `show7d` are disabled.
- `sub2apiUsage.statusBarAlignment`: `left` or `right`.
- `sub2apiUsage.statusBarPriority`: status bar priority.
- `sub2apiUsage.warnThresholdPercent`: warning icon threshold.
- `sub2apiUsage.dangerThresholdPercent`: error icon threshold.
- `sub2apiUsage.autoStart`: refresh and poll automatically after startup.

## Display Behavior

The extension reads `rate_limits` by `window`:

- `window === "5h"` is treated as the 5h quota.
- `window === "7d"` is treated as the 7d quota.
- Missing windows show `N/A`.
- `sub2apiUsage.show5h` and `sub2apiUsage.show7d` can independently hide each window.
- If both windows are hidden, the status bar shows `sub2apiUsage.placeholderText`.
- A missing or zero `limit` makes percentage display `N/A`.
- `remaining` uses the API value first. If it is absent, the extension computes `limit - used`.

The status icon uses the 7d percentage first. If 7d is unavailable, it uses 5h.

## Details View

Click the status bar item or run `Sub2api Usage: Show Details` to see:

- status, mode, expiry, RPM, TPM
- today and total cost
- 5h and 7d limit, used, remaining, reset time, raw remaining
- model usage summary
- actions for refresh, settings, and copying a summary

## Test

```bash
npm test
```

## Type Check and Lint

```bash
npm run compile
npm run lint
```

## Package VSIX

```bash
npm run package
```

The generated `.vsix` can be installed from VS Code with `Extensions: Install from VSIX...`.

## Design Notes

- The token is never hard-coded and is not printed to logs.
- Polling reuses an in-flight refresh promise to avoid concurrent requests.
- Configuration changes recreate the status bar only when alignment or priority changes, restart the timer, and refresh immediately.
- `deactivate` disposes commands, the status bar item, and the poll timer.

## Known Limits

- The extension trusts the API's `remaining` field when it exists, even if it is larger than `limit - used`.
- It performs lightweight response normalization instead of strict schema validation, so partial API responses can still render.
- Network failures are shown in the status bar and details view; the next poll can recover automatically.
