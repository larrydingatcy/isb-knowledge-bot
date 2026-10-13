# Dragons’ Gate local sync

This connector uses your existing authorized Chrome login. It does not copy cookies, SSO state, browser profiles, raw HTML, or credentials. Raw inert text remains under git-ignored `data/private/dragons-gate/` until it is sanitized locally.

## Install

1. Run `pnpm install` and `pnpm --filter @isb/dg-extension build`.
2. In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `local/dragons-gate/extension/dist`.
3. Copy the generated 32-character extension ID.
4. Run `pnpm tsx scripts/install-dragons-gate-sync.ts <extension-id>`.
5. Open the extension popup, copy the generated connector token from the private config into **Local connector token**, and choose **Save token locally**. Never paste it into Git, an issue, or chat.
6. Click **Sync now** once and grant only the displayed Dragons’ Gate and localhost permissions.

The receiver is installed as a user LaunchAgent and binds to `127.0.0.1:43117`. The private config is mode `0600`. Weekly runs use `Asia/Nicosia`; a missed run is attempted once on the next browser start. No-change runs stay quiet. Login expiry, failures, important changes, and required approvals create local notifications.

## Review and publish

Use `pnpm dragons-gate status`, then `preview`, `approve`, and `publish`. First-seen sources and changes to dates, fees, eligibility, or policies always require approval. Publication refuses unrelated worktree changes and stages only named `data/knowledge` files.

## Recovery and removal

If login expires, sign in normally in Chrome and run **Sync now**; the connector never bypasses authentication or CAPTCHA. If a push fails, keep the approved draft and retry `publish` after restoring Git connectivity.

Run `pnpm tsx scripts/uninstall-dragons-gate-sync.ts` to remove the LaunchAgent while preserving private review state. Add `--purge` only when you intentionally want to delete that local state.
