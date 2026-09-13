# Sub2api Usage Monitor

<div align="center">
  <img height="160px" src="assets/logo.png" style="max-width: 100%; height: auto; max-height: 160px;">
</div>

Sub2api Usage Monitor is a VS Code extension that shows Sub2api relay API usage in the bottom status bar.

Examples:

- `$(pulse) Sub2api 5h 13.17% | 7d 2.20%`
- `$(pulse) Sub2api 7d 2.20%` (7d-only API key)
- `$(pulse) Sub2api 5h 13.17% | 1d 6.59% | 7d 2.20%`
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
- `sub2apiUsage.statusLabel`: status bar text prefix shown before usage windows. Default `Sub2api`. Trailing spaces are preserved.
- `sub2apiUsage.currencySymbol`: currency prefix. Default `$`.
- `sub2apiUsage.decimals`: decimals for money and percentages. Range `0` to `6`.
- `sub2apiUsage.show5h`: show the 5h window.
- `sub2apiUsage.show1d`: show the 1d window when returned by the API. Default `true`.
- `sub2apiUsage.show7d`: show the 7d window.
- `sub2apiUsage.placeholderText`: status bar text shown when no available windows are enabled for display.
- `sub2apiUsage.statusBarAlignment`: `left` or `right`.
- `sub2apiUsage.statusBarPriority`: status bar priority.
- `sub2apiUsage.threshold.percent.warn`: warning icon threshold.
- `sub2apiUsage.threshold.percent.danger`: error icon threshold.
- `sub2apiUsage.threshold.enableColors`: change the status bar background color when the highest available quota tier reaches a threshold (7d, then 1d, then 5h).
- `sub2apiUsage.threshold.color.warn`: status bar background theme color used after the warn threshold.
- `sub2apiUsage.threshold.color.danger`: status bar background theme color used after the danger threshold.
- `sub2apiUsage.autoStart`: refresh and poll automatically after startup.

Example threshold color settings:

```json
{
  "sub2apiUsage.threshold.enableColors": true,
  "sub2apiUsage.threshold.percent.warn": 80,
  "sub2apiUsage.threshold.percent.danger": 95,
  "sub2apiUsage.threshold.color.warn": "statusBarItem.warningBackground",
  "sub2apiUsage.threshold.color.danger": "statusBarItem.errorBackground"
}
```

Example custom status label:

```json
{
  "sub2apiUsage.statusLabel": "Relay A"
}
```

## Display Behavior

The extension reads `rate_limits` by `window`:

- `window === "5h"` is treated as the 5h quota.
- `window === "1d"` is treated as the 24-hour quota.
- `window === "7d"` is treated as the 7d quota.
- Only returned windows are displayed, ordered 5h, 1d, 7d. A 7d-only key shows only 7d; a 5h/7d key shows both.
- `sub2apiUsage.show5h`, `sub2apiUsage.show1d`, and `sub2apiUsage.show7d` can independently hide each window in the status bar.
- Compact mode shows the highest enabled, available tier: 7d, then 1d, then 5h.
- If no returned windows are enabled, the status bar shows `sub2apiUsage.placeholderText`. Missing window data does not imply unlimited quota.
- Tooltip, details, and copied summaries list all returned known windows, regardless of status bar visibility settings.
- `sub2apiUsage.statusLabel` controls the prefix in displays such as `Relay A 7d 2.20%`.
- Trailing spaces in `sub2apiUsage.statusLabel` are rendered as non-breaking spaces so VS Code does not collapse them.
- A missing or zero `limit` makes percentage display `N/A`.
- `remaining` uses the API value first. If it is absent, the extension computes `limit - used`.

- The status icon and threshold background color use the highest available tier: 7d, then 1d, then 5h, regardless of visibility settings.
- If that tier has a missing/invalid usage or limit, or a zero limit, no threshold icon or color is applied. Lower tiers are not used to override it.
- Threshold colors are optional and controlled by `sub2apiUsage.threshold.enableColors`.
- VS Code currently supports `statusBarItem.warningBackground` and `statusBarItem.errorBackground` for status bar item backgrounds.
- Legacy threshold settings such as `sub2apiUsage.warnThresholdPercent` are still read when the new grouped setting is not configured.

## Details View

Click the status bar item or run `Sub2api Usage: Show Details` to see:

- status, mode, expiry, RPM, TPM
- today and total cost
- available 5h, 1d, and 7d limit, used, remaining, reset time, raw remaining
- model usage summary
- actions for refresh, settings, and copying a summary

## Design Notes

- The token is stored only in VS Code SecretStorage, never hard-coded, and not printed to logs.
- The endpoint is read from user settings only, so workspace settings cannot redirect the stored token.
- Refresh requires a configured endpoint and API key. External HTTP endpoints are rejected.
- Polling and manual refresh share an in-flight request for the current endpoint and key. Changing either cancels the old request and clears cached data; late results cannot overwrite the new state.
- SecretStorage changes from other VS Code windows also invalidate cached data. Set/Clear API Key refreshes immediately; external changes refresh automatically only when auto start is enabled.
- Display setting changes redraw without an API request. Endpoint changes and enabling auto start trigger a refresh when auto start is enabled. Alignment or priority changes recreate the status bar.
- Failed refreshes retain cached usage with a visible `stale` marker, last successful refresh time, and latest error in the tooltip, details, and copied summary. The next successful refresh clears the marker.
- `deactivate` cancels pending requests and disposes commands, the status bar item, and the poll timer.

## Known Limits

- The extension trusts the API's `remaining` field when it exists, even if it is larger than `limit - used`.
- Responses must identify a supported Sub2api mode and include its fixed fields: `mode`, boolean `isValid`, and `status` for `quota_limited`, or `planName` and `unit` for `unrestricted`. Empty objects, error responses, and unrelated API envelopes are rejected.
- Statistics and quota windows remain optional because backend queries can fail independently. Empty arrays and null optional data are accepted. Returned rate-limit entries require a unique window name, a positive numeric limit, and nonnegative numeric usage; nullable window timestamps are supported. Unknown fields and future window names remain compatible.
- Validation identifies the response format; it does not mean a key can make billable requests. In particular, expired and exhausted keys can still return valid usage responses.
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
