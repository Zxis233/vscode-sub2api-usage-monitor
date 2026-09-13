# Changelog

## 0.4.0

- Validate Sub2api response identity and returned quota windows; reject empty/error JSON while accepting missing statistics and null window start times.
- Cancel and invalidate requests when the endpoint or API key changes, including SecretStorage changes from other windows.
- Label cached usage as stale after refresh failures and include the last successful refresh time and error in details and copied summaries.
- Avoid API requests for display-only configuration changes and prevent late requests from updating disposed UI.
- Added 1d quota support and the `sub2apiUsage.show1d` setting.
- Automatically display only returned quota windows in the status bar, tooltip, details, and copied summary.
- Prioritize 7d, then 1d, then 5h in compact mode and for threshold alerts.
- Use the configured placeholder when no available quota windows are enabled.

## 0.3.5

- Added `sub2apiUsage.statusLabel` for customizing the status bar usage prefix.
- Preserved trailing spaces in `sub2apiUsage.statusLabel` when rendering status bar usage text.

## 0.3.3

- Added explicit Settings UI ordering so related settings appear in a predictable order.
- Ensured Warn threshold settings appear before Danger threshold settings in VS Code Settings.

## 0.3.1

- Renamed threshold settings to grouped `sub2apiUsage.threshold.*` keys so related options stay adjacent in VS Code Settings.
- Kept compatibility with legacy threshold settings when the new grouped settings are not configured.

## 0.3.0

- Added optional status bar threshold background colors for 7d Warn and Danger usage levels.
- Added configurable Warn and Danger threshold background theme colors.
- Changed threshold icon escalation to use the 7d usage percentage only.

## 0.2.0

- Made `sub2apiUsage.endpoint` empty by default and required explicit user configuration before refresh.
- Removed the settings-based API key fallback; tokens are now read only from VS Code SecretStorage.
- Added missing-endpoint status bar and details states.
- Added endpoint validation requiring HTTPS, except localhost testing.
- Added API client tests for missing, invalid, and localhost endpoints.
- Added package metadata for extension kind, workspace capabilities, and marketplace keywords.
- Added `npm run verify` and a separate build TypeScript config for packaging.
- Updated README setup, endpoint, token, development, and design notes.

## 0.1.0

- Initial Sub2api Usage Monitor implementation.
- Added status bar usage display with percentage, quota, remaining, and compact modes.
- Added SecretStorage token commands.
- Added manual refresh, details Quick Pick, settings command, polling, and configuration handling.
- Added formatter unit tests for rate limit parsing and display fallbacks.
- Added configurable placeholder text when both quota windows are hidden.
