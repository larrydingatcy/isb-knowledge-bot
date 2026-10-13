# ISB Dragons’ Gate Local Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely capture authorized Dragons’ Gate pages from the user’s logged-in Chrome session, redact and review them locally, and publish only approved structured school knowledge without exporting credentials or private family data.

**Architecture:** An unpacked Chrome extension uses explicit host permissions and the existing browser login to open allowlisted pages, extract inert page content, and send it to a loopback-only local receiver authenticated by a per-install token. The local connector reuses the ingestion platform’s normalization, PII, draft, and release contracts; a weekly Chrome alarm triggers scans while a manual “sync now” control remains available.

**Tech Stack:** Existing TypeScript monorepo, Chrome Manifest V3 extension APIs, Fastify bound to loopback, existing ingestion package, Vitest, Playwright for extension fixtures, macOS `launchd`, native macOS notifications.

**Spec:** `docs/superpowers/specs/2026-10-13-isb-knowledge-bot-design.md`

## Global Constraints

- Execute this plan after `2026-10-13-isb-ingestion-platform.md`.
- The connector uses only the user’s authorized logged-in Chrome session and never bypasses login, SSO, CAPTCHA, or access controls.
- Cookies, authorization headers, SSO state, raw browser profiles, and raw page HTML never leave the Mac or enter Git.
- The receiver listens only on `127.0.0.1` and `::1`; every request requires a per-install token and strict origin/host checks.
- Children, family, account, class-specific personal schedules, balances, email, phone, and identifiers are blocked from publication by default.
- Dragons’ Gate entries require administrator preview and approval before their first publication; later low-risk unchanged-schema updates may follow the recorded source policy.
- Normal runs with no changes stay quiet; failures, expired login, and blocked important changes notify the administrator locally.
- Use test-driven development and make one focused commit at the end of every task.

## Review Focus

- A malicious website attempting to POST to localhost must fail token, origin, content-type, and size checks; pinned in Task 1.
- A Dragons’ Gate page redirected to login or displaying an expired-session shell must not overwrite previous knowledge; pinned in Tasks 2 and 3.
- A page containing a child’s name beside a class, balance, or schedule must be blocked even when the rest of the page is general school information; pinned in Task 3.
- If Chrome or the Mac is asleep at the scheduled time, the next browser start must run one catch-up scan without duplicate publication; pinned in Task 5.
- If Git publication fails after local approval, the approved draft must remain recoverable and no raw capture may appear in `git status`; pinned in Task 4.

---

## File Structure

```text
local/dragons-gate/receiver/             Loopback capture and local workflow
local/dragons-gate/extension/            Unpacked Manifest V3 Chrome extension
local/dragons-gate/config.yml            URL allowlist and extraction settings
local/dragons-gate/launchd/              Local service template
data/private/dragons-gate/                Git-ignored raw temporary captures
docs/operations/dragons-gate-sync.md     Installation, privacy, and recovery
```

### Task 1: Authenticated loopback receiver

**Files:**
- Create: `local/dragons-gate/receiver/package.json`
- Create: `local/dragons-gate/receiver/tsconfig.json`
- Create: `local/dragons-gate/receiver/src/config.ts`
- Create: `local/dragons-gate/receiver/src/server.ts`
- Create: `local/dragons-gate/receiver/src/server.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `DG_CONNECTOR_TOKEN`, `DG_ALLOWED_EXTENSION_ID`, and capture payloads from the extension.
- Produces: `createReceiver(deps): FastifyInstance`, `POST /v1/captures`, `POST /v1/runs/:runId/complete`, and `GET /v1/health`; accepted captures return a local draft ID.

- [ ] **Step 1: Write failing receiver security tests**

  Test loopback-only binding configuration, missing/wrong token, wrong Chrome extension origin, browser-page origins, incorrect host header, non-JSON content, payload over 2 MiB, schema-invalid payload, replayed capture nonce, and valid capture acceptance. Assert logs contain no body or token.

- [ ] **Step 2: Verify receiver tests fail**

  Run: `pnpm vitest run local/dragons-gate/receiver/src/server.test.ts`  
  Expected: FAIL because the receiver does not exist.

- [ ] **Step 3: Implement the local receiver**

  Bind explicitly to loopback, compare tokens in constant time, allow only `chrome-extension://<configured-id>`, cap JSON bodies, store capture payloads under git-ignored `data/private/dragons-gate/<run-id>/`, and log only run IDs, sizes, hashes, and status.

- [ ] **Step 4: Verify security behavior**

  Run: `pnpm vitest run local/dragons-gate/receiver/src/server.test.ts`  
  Expected: all tests PASS.

- [ ] **Step 5: Commit the receiver**

  Run: `git add local/dragons-gate/receiver .gitignore && git commit -m "feat: add secure local capture receiver"`

### Task 2: Logged-in Chrome capture extension

**Files:**
- Create: `local/dragons-gate/extension/manifest.json`
- Create: `local/dragons-gate/extension/package.json`
- Create: `local/dragons-gate/extension/tsconfig.json`
- Create: `local/dragons-gate/extension/vite.config.ts`
- Create: `local/dragons-gate/extension/src/background.ts`
- Create: `local/dragons-gate/extension/src/content.ts`
- Create: `local/dragons-gate/extension/src/popup.tsx`
- Create: `local/dragons-gate/extension/src/popup.html`
- Create: `local/dragons-gate/extension/src/capture.ts`
- Create: `local/dragons-gate/extension/src/capture.test.ts`
- Create: `local/dragons-gate/config.yml`

**Interfaces:**
- Consumes: an explicit Dragons’ Gate host allowlist, start URLs, local receiver URL, and per-install token stored in `chrome.storage.local`.
- Produces: `extractCapture(document: Document, context: CaptureContext): CapturePayload`, manual `syncNow()`, and weekly `chrome.alarms` scheduling.

- [ ] **Step 1: Write failing extension extraction tests**

  Test title/canonical URL/main-text extraction, removal of scripts/forms/hidden inputs, login-page detection, off-host redirect rejection, token exclusion from capture payloads, maximum text size, navigation timeout, and a manual sync progress state.

- [ ] **Step 2: Verify extension tests fail**

  Run: `pnpm vitest run local/dragons-gate/extension/src/capture.test.ts`  
  Expected: FAIL because extension capture code is missing.

- [ ] **Step 3: Implement the Manifest V3 extension**

  Request permissions only for storage, alarms, tabs, scripting, notifications, loopback receiver, and configured Dragons’ Gate hosts. Open capture tabs inactive, wait for complete, execute the content extractor, close only tabs created by the extension, and stop the run immediately on login/session-expiry detection.

- [ ] **Step 4: Build and verify the extension**

  Run: `pnpm vitest run local/dragons-gate/extension/src/capture.test.ts && pnpm --filter @isb/dg-extension build`  
  Expected: tests PASS and the unpacked extension artifact contains no secret token or non-allowlisted host permission.

- [ ] **Step 5: Commit the extension**

  Run: `git add local/dragons-gate/extension local/dragons-gate/config.yml && git commit -m "feat: capture authorized Dragons Gate pages"`

### Task 3: Dragons’ Gate redaction and approval policy

**Files:**
- Create: `local/dragons-gate/receiver/src/process.ts`
- Create: `local/dragons-gate/receiver/src/policy.ts`
- Create: `local/dragons-gate/receiver/src/process.test.ts`
- Create: `local/dragons-gate/receiver/test/fixtures/general-event.json`
- Create: `local/dragons-gate/receiver/test/fixtures/private-child-page.json`

**Interfaces:**
- Consumes: completed local capture runs and ingestion platform `RawDocument`, `prepareRelease`, PII scanner, and `DraftStore`.
- Produces: `processCaptureRun(runId: string, policy: DragonsGatePolicy): Promise<ProcessSummary>` with approved candidates, blocked items, conflicts, login-expired status, and redaction preview paths.

- [ ] **Step 1: Write failing privacy-policy tests**

  Test general school event acceptance; child name plus class/schedule block; balance/account block; email/phone/student ID block; login shell rejection; mixed general/private page block; identical recapture no-change; changed deadline review-required; and source URL retained without private query parameters.

- [ ] **Step 2: Verify process tests fail**

  Run: `pnpm vitest run local/dragons-gate/receiver/src/process.test.ts`  
  Expected: FAIL because the processor is missing.

- [ ] **Step 3: Implement local conversion and review policy**

  Convert inert capture text to `RawDocument`, strip URL query/fragment, apply high-sensitivity PII rules, generate a local redaction preview, and create drafts. Never auto-approve a first-seen source or a change to dates, fees, eligibility, or policy text.

- [ ] **Step 4: Verify privacy defaults**

  Run: `pnpm vitest run local/dragons-gate/receiver/src/process.test.ts`  
  Expected: all tests PASS and fixture child data never appears in generated public candidates.

- [ ] **Step 5: Commit local policy processing**

  Run: `git add local/dragons-gate/receiver/src/process.ts local/dragons-gate/receiver/src/policy.ts local/dragons-gate/receiver/src/process.test.ts local/dragons-gate/receiver/test && git commit -m "feat: enforce Dragons Gate privacy policy"`

### Task 4: Recoverable reviewed publication

**Files:**
- Create: `local/dragons-gate/receiver/src/publish.ts`
- Create: `local/dragons-gate/receiver/src/publish.test.ts`
- Create: `scripts/dragons-gate.ts`
- Create: `scripts/dragons-gate.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: approved `DraftDocument[]` and ingestion `publishRelease`.
- Produces: `publishApprovedRun(runId: string, deps: PublishDeps): Promise<PublishSummary>` and CLI commands `status`, `preview`, `approve`, `publish`, `discard`, and `cleanup`.

- [ ] **Step 1: Write failing publication tests**

  Test approval required, dirty unrelated worktree refusal, public diff preview, content-only staging, commit failure recovery, push failure recovery, idempotent retry, withdrawal, immediate raw-capture deletion after successful processing, 30-day sanitized-draft retention, and `git status` never listing raw captures or tokens.

- [ ] **Step 2: Verify publication tests fail**

  Run: `pnpm vitest run local/dragons-gate/receiver/src/publish.test.ts scripts/dragons-gate.test.ts`  
  Expected: FAIL because publication flow is missing.

- [ ] **Step 3: Implement narrow publication and CLI recovery**

  Stage only enumerated `data/knowledge` outputs and source status files; never use `git add .`. Persist approved local state before Git operations so retry is safe. Delete raw captures immediately after a successful sanitized draft is created; expire unpublished sanitized drafts after 30 days. Refuse to overwrite unrelated changes and print exact recovery commands.

- [ ] **Step 4: Verify recoverability in temporary Git repositories**

  Run: `pnpm vitest run local/dragons-gate/receiver/src/publish.test.ts scripts/dragons-gate.test.ts`  
  Expected: all tests PASS.

- [ ] **Step 5: Commit reviewed publication**

  Run: `git add local/dragons-gate/receiver/src/publish.ts local/dragons-gate/receiver/src/publish.test.ts scripts/dragons-gate.ts scripts/dragons-gate.test.ts package.json && git commit -m "feat: publish reviewed Dragons Gate knowledge"`

### Task 5: Scheduling, catch-up, notifications, and installation

**Files:**
- Create: `local/dragons-gate/receiver/src/schedule.ts`
- Create: `local/dragons-gate/receiver/src/schedule.test.ts`
- Create: `local/dragons-gate/launchd/com.isb.dragons-gate-receiver.plist.template`
- Create: `scripts/install-dragons-gate-sync.ts`
- Create: `scripts/uninstall-dragons-gate-sync.ts`
- Create: `docs/operations/dragons-gate-sync.md`

**Interfaces:**
- Consumes: extension run history, receiver health, weekly schedule, and local processing outcomes.
- Produces: `nextRunDecision(history, now): "none" | "scheduled" | "catch-up"`, launchd service installation, and local notifications only for meaningful change, login expiry, failure, or required approval.

- [ ] **Step 1: Write failing scheduling tests**

  Test weekly due time, missed run while asleep, exactly one catch-up, no duplicate within the week, daylight-saving transition, timezone `Asia/Nicosia`, no-change silence, important-date change notification, login-expired notification, and repeated identical failure throttling.

- [ ] **Step 2: Verify scheduling tests fail**

  Run: `pnpm vitest run local/dragons-gate/receiver/src/schedule.test.ts`  
  Expected: FAIL because schedule logic is missing.

- [ ] **Step 3: Implement installation, scheduling, and operations guide**

  Install the loopback receiver as a user LaunchAgent without embedding the token in a committed file; generate the token into a user-readable-only local config. Configure the extension alarm and startup catch-up. Use native notifications without auto-emailing or messaging the school.

- [ ] **Step 4: Run local end-to-end acceptance**

  Run: `pnpm test && pnpm build && pnpm dragons-gate status && git status --short`  
  Expected: tests/build PASS; status reports receiver and extension setup; Git status contains no token, raw capture, browser data, or personal fixture output.

- [ ] **Step 5: Commit installation and runbook**

  Run: `git add local/dragons-gate/receiver/src/schedule.ts local/dragons-gate/receiver/src/schedule.test.ts local/dragons-gate/launchd scripts/install-dragons-gate-sync.ts scripts/uninstall-dragons-gate-sync.ts docs/operations/dragons-gate-sync.md && git commit -m "feat: schedule private local knowledge sync"`

