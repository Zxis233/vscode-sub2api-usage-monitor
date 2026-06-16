# Sub2api Usage Monitor

<div align="center">
  <img height="160px" src="assets/logo.png" style="max-width: 100%; height: auto; max-height: 160px;">
</div>

Sub2api Usage Monitor is a VS Code extension that shows Sub2api relay API usage in the bottom status bar.

Examples:

- `$(pulse) Sub2api 5h 13.17% | 7d 2.20%`
- `$(pulse) Sub2api 5h $3.95/$30.00 | 7d $3.95/$180.00`
- `$(pulse) Sub2api 5h $176.05 left | 7d $176.05 left`
- `$(gear) Sub2api Usage: Set endpoint`
- `$(key) Sub2api Usage: Set token`

## First Use

1. Open VS Code user settings.
2. Set `sub2apiUsage.endpoint` to your Sub2api usage endpoint.
3. Run `Sub2api Usage: Set API Key`.
4. Paste the Bearer token. The input is password masked.
5. Run `Sub2api Usage: Refresh`, or leave `sub2apiUsage.autoStart` enabled.

Example `settings.json`:

```json
{
  "sub2apiUsage.endpoint": "https://your-sub2api.example.com/v1/usage"
}
```

## Configure Endpoint and Token

Endpoint:

- `sub2apiUsage.endpoint` is empty by default and must be configured before refresh.
- Configure it in VS Code user settings, not workspace settings.
- HTTPS is required, except for localhost testing.

Token:

1. Open Command Palette.
2. Run `Sub2api Usage: Set API Key`.
3. Paste the Bearer token. The input is password masked.
4. The token is stored in VS Code SecretStorage.

## Commands

- `Sub2api Usage: Refresh`: manually refresh usage.
- `Sub2api Usage: Set API Key`: save the token to SecretStorage.
- `Sub2api Usage: Clear API Key`: delete the SecretStorage token.
- `Sub2api Usage: Show Details`: open detailed usage Quick Pick.
- `Sub2api Usage: Open Settings`: open extension settings.

## Settings

- `sub2apiUsage.endpoint`: usage endpoint. Empty by default and read from user settings only.
- `sub2apiUsage.pollIntervalSeconds`: polling interval in seconds. Range `30` to `86400`.
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
- `sub2apiUsage.enableThresholdColors`: change the status bar background color when 7d usage reaches a threshold.
- `sub2apiUsage.warnThresholdColor`: status bar background theme color used after the warn threshold.
- `sub2apiUsage.dangerThresholdColor`: status bar background theme color used after the danger threshold.
- `sub2apiUsage.autoStart`: refresh and poll automatically after startup.

Example threshold color settings:

```json
{
  "sub2apiUsage.enableThresholdColors": true,
  "sub2apiUsage.warnThresholdPercent": 80,
  "sub2apiUsage.dangerThresholdPercent": 95,
  "sub2apiUsage.warnThresholdColor": "statusBarItem.warningBackground",
  "sub2apiUsage.dangerThresholdColor": "statusBarItem.errorBackground"
}
```

## Display Behavior

The extension reads `rate_limits` by `window`:

- `window === "5h"` is treated as the 5h quota.
- `window === "7d"` is treated as the 7d quota.
- Missing windows show `N/A`.
- `sub2apiUsage.show5h` and `sub2apiUsage.show7d` can independently hide each window.
- If both windows are hidden, the status bar shows `sub2apiUsage.placeholderText`.
- A missing or zero `limit` makes percentage display `N/A`.
- `remaining` uses the API value first. If it is absent, the extension computes `limit - used`.

- The status icon and threshold background color use the 7d percentage only.
- If 7d is unavailable or has an invalid/zero `limit`, no threshold icon or color is applied.
- Threshold colors are optional and controlled by `sub2apiUsage.enableThresholdColors`.
- VS Code currently supports `statusBarItem.warningBackground` and `statusBarItem.errorBackground` for status bar item backgrounds.

## Details View

Click the status bar item or run `Sub2api Usage: Show Details` to see:

- status, mode, expiry, RPM, TPM
- today and total cost
- 5h and 7d limit, used, remaining, reset time, raw remaining
- model usage summary
- actions for refresh, settings, and copying a summary

## Design Notes

- The token is stored only in VS Code SecretStorage, never hard-coded, and not printed to logs.
- The endpoint is read from user settings only, so workspace settings cannot redirect the stored token.
- Refresh requires a configured endpoint and API key. External HTTP endpoints are rejected.
- Polling reuses an in-flight refresh promise to avoid concurrent requests.
- Configuration changes recreate the status bar only when alignment or priority changes, restart the timer, and refresh only when auto start is enabled.
- `deactivate` disposes commands, the status bar item, and the poll timer.

## Known Limits

- The extension trusts the API's `remaining` field when it exists, even if it is larger than `limit - used`.
- It performs lightweight response normalization instead of strict schema validation, so partial API responses can still render.
- Network failures are shown in the status bar and details view; the next poll can recover automatically.

## Development

Run locally:

1. Run `npm install`.
2. Run `npm run compile`.
3. Open this folder in VS Code.
4. Press `F5` and choose `Run Extension`.
5. In the Extension Development Host, configure `sub2apiUsage.endpoint` in user settings.
6. Run `Sub2api Usage: Set API Key`.

Verify:

```bash
npm run verify
```

Package VSIX:

```bash
npm run package
```

The generated `.vsix` can be installed from VS Code with `Extensions: Install from VSIX...`.
