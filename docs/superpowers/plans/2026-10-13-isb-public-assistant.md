# ISB Public Assistant MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a public, no-login bilingual ISB knowledge browser and grounded chat experience using a versioned seed knowledge set, with citations, freshness status, abuse protection, and production deployment.

**Architecture:** A Vite/React static frontend deploys to GitHub Pages under `/isb-knowledge-bot/`. Vercel Functions expose a versioned chat API that searches a build-time JSON knowledge index, calls the OpenAI Responses API, and validates grounded citations before returning an answer. Shared TypeScript packages own the data contract and retrieval behavior so later ingestion systems can publish into the same interface.

**Tech Stack:** Node.js 22, pnpm 10, TypeScript 5, React 19, Vite, MiniSearch, Zod, OpenAI JavaScript SDK, Upstash Redis rate limiting, Vitest, Testing Library, Playwright, GitHub Actions, GitHub Pages, Vercel Functions.

**Spec:** `docs/superpowers/specs/2026-10-13-isb-knowledge-bot-design.md`

## Global Constraints

- Public pages require no login and must work under the GitHub Pages base path `/isb-knowledge-bot/`.
- Every factual answer must expose at least one valid official citation and a last-verified timestamp.
- Missing, conflicting, or stale evidence must be stated explicitly; the system must not guess.
- OpenAI and Upstash credentials exist only in Vercel environment variables or GitHub Secrets.
- The public index contains only entries whose `visibility` is `public` and whose review status permits publication.
- Raw Dragons’ Gate HTML, cookies, SSO data, and personal information are never included in this phase or committed.
- Question text is not written to application logs; only anonymous operational counters may be recorded.
- Use test-driven development and make one focused commit at the end of every task.

## Review Focus

- A prompt-injection string in the user question or knowledge text must remain data and cannot change system instructions; pinned in Task 3.
- A question with no sufficiently relevant source must return a bilingual unknown response with no fabricated citation; pinned in Task 3.
- A citation ID invented by the model or missing from the retrieved set must make answer validation fail closed; pinned in Task 3.
- A cross-origin caller outside the production and local allowlist must be rejected before model use; pinned in Task 4.
- A GitHub Pages deep link or asset request under `/isb-knowledge-bot/` must resolve correctly on mobile and desktop; pinned in Task 6.

---

## File Structure

```text
api/v1/chat.ts                         Vercel HTTP entry point
apps/web/                              Public React application
data/knowledge/items.json              Published public knowledge entries
data/knowledge/manifest.json           Index version and source freshness
packages/knowledge/                    Shared schema, index builder, retrieval
packages/answering/                    Grounded prompt, model adapter, validation
packages/api-core/                     Request validation, CORS, rate limiting
tests/e2e/                             Public end-to-end flows
.github/workflows/pages.yml            Static site build and Pages deployment
vercel.json                            Function runtime and routing configuration
```

### Task 1: Workspace and versioned knowledge contract

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.js`
- Create: `vitest.config.ts`
- Create: `packages/knowledge/package.json`
- Create: `packages/knowledge/tsconfig.json`
- Create: `packages/knowledge/src/schema.ts`
- Create: `packages/knowledge/src/migrations.ts`
- Create: `packages/knowledge/src/schema.test.ts`
- Create: `data/knowledge/items.json`
- Create: `data/knowledge/manifest.json`
- Create: `.gitignore`

**Interfaces:**
- Consumes: Confirmed fields in design spec section 7.
- Produces: `KnowledgeItemSchema`, `KnowledgeManifestSchema`, `KnowledgeItem`, `KnowledgeManifest`, and `parsePublicKnowledge(input: unknown): KnowledgeItem[]` from `@isb/knowledge/schema`.

- [ ] **Step 1: Write failing schema tests**

  Add tests named `accepts_a_complete_public_item`, `rejects_private_or_unreviewed_items`, `rejects_invalid_dates_and_urls`, `requires_schema_version_1`, and `rejects_unknown_future_schema_versions`. Assert `parsePublicKnowledge` accepts only `visibility: "public"`, `reviewStatus: "approved" | "auto-published"`, ISO timestamps, and HTTPS official source URLs; assert the migration registry accepts v1 documents and fails closed on unsupported versions.

- [ ] **Step 2: Verify the schema tests fail**

  Run: `pnpm vitest run packages/knowledge/src/schema.test.ts`  
  Expected: FAIL because `@isb/knowledge/schema` does not exist.

- [ ] **Step 3: Create the workspace and schema API**

  Implement the exact exported types and parser with Zod plus `migrateKnowledgeDocument(input: unknown): KnowledgeDocumentV1`. Use camelCase JSON fields, `schemaVersion: 1`, and a discriminated review-status enum. Seed `items.json` with one clearly labeled, manually verified public ISB item and `manifest.json` with version `1`.

- [ ] **Step 4: Verify the contract and repository checks**

  Run: `pnpm vitest run packages/knowledge/src/schema.test.ts && pnpm exec tsc -p packages/knowledge/tsconfig.json --noEmit`  
  Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit the contract**

  Run: `git add package.json pnpm-workspace.yaml tsconfig.base.json eslint.config.js vitest.config.ts .gitignore packages/knowledge data/knowledge && git commit -m "feat: define versioned knowledge contract"`

### Task 2: Deterministic public index and retrieval

**Files:**
- Create: `packages/knowledge/src/index.ts`
- Create: `packages/knowledge/src/retrieval.ts`
- Create: `packages/knowledge/src/retrieval.test.ts`
- Create: `scripts/build-index.ts`
- Create: `data/knowledge/search-index.json`
- Modify: `packages/knowledge/package.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `KnowledgeItem[]` from `parsePublicKnowledge`.
- Produces: `buildSearchIndex(items: KnowledgeItem[]): SerializedSearchIndex` and `retrieve(query: string, options: { language: "zh" | "en"; category?: string; limit: number; now: Date }): RetrievalResult[]`, where every result contains `item`, `score`, and `freshness: "current" | "stale" | "expired"`.

- [ ] **Step 1: Write failing retrieval tests**

  Cover Chinese token matching, English matching, category filtering, deterministic score order, stale/expired classification, empty queries, and a 500-character Unicode query. Assert results never include non-public entries even if an invalid fixture bypasses file loading.

- [ ] **Step 2: Verify retrieval tests fail**

  Run: `pnpm vitest run packages/knowledge/src/retrieval.test.ts`  
  Expected: FAIL because retrieval exports do not exist.

- [ ] **Step 3: Implement index building and retrieval**

  Use MiniSearch with title, content, category, and tags fields. Normalize Unicode with NFKC, use language-aware tokenization hooks, cap input at 500 characters, and apply freshness as metadata rather than silently hiding expired entries.

- [ ] **Step 4: Generate and verify a reproducible index**

  Run: `pnpm build:index && git diff --exit-code data/knowledge/search-index.json || true` twice.  
  Expected: the second run produces no diff; all retrieval tests PASS.

- [ ] **Step 5: Commit retrieval**

  Run: `git add packages/knowledge scripts/build-index.ts data/knowledge/search-index.json package.json && git commit -m "feat: add bilingual knowledge retrieval"`

### Task 3: Grounded bilingual answer service

**Files:**
- Create: `packages/answering/package.json`
- Create: `packages/answering/src/types.ts`
- Create: `packages/answering/src/prompt.ts`
- Create: `packages/answering/src/model.ts`
- Create: `packages/answering/src/answer.ts`
- Create: `packages/answering/src/answer.test.ts`

**Interfaces:**
- Consumes: `RetrievalResult[]` and `ModelClient.generate(input: GroundedModelInput): Promise<GroundedModelOutput>`.
- Produces: `answerQuestion(input: { question: string; language: "zh" | "en"; category?: string; now: Date }, deps: { retrieve: RetrieveFn; model: ModelClient }): Promise<AnswerResult>`; `AnswerResult` is either `{ status: "answered"; answer: string; citations: Citation[]; freshness: ... }` or `{ status: "unknown" | "conflict"; answer: string; citations: Citation[] }`.

- [ ] **Step 1: Write failing grounding tests**

  Use a fake `ModelClient` to test same-language responses, zero-result unknown responses, conflicting-source responses, stale warnings, hostile instructions embedded in a knowledge item, hostile user instructions, and a model-produced citation ID absent from retrieved results. Assert invented citations return `status: "unknown"` and never reach the caller as facts.

- [ ] **Step 2: Verify grounding tests fail**

  Run: `pnpm vitest run packages/answering/src/answer.test.ts`  
  Expected: FAIL because `answerQuestion` is missing.

- [ ] **Step 3: Implement the model boundary and validator**

  Define a provider-neutral `ModelClient`; implement an OpenAI Responses API adapter configured by required `OPENAI_MODEL` and `OPENAI_API_KEY` variables. Use structured output for answer, status, and citation IDs. Clearly delimit retrieved text as untrusted evidence and validate every returned citation against the retrieval set.

- [ ] **Step 4: Verify all answer modes**

  Run: `pnpm vitest run packages/answering/src/answer.test.ts`  
  Expected: all tests PASS without network access.

- [ ] **Step 5: Commit answering**

  Run: `git add packages/answering && git commit -m "feat: add grounded bilingual answering"`

### Task 4: Versioned chat API with abuse and cost controls

**Files:**
- Create: `packages/api-core/package.json`
- Create: `packages/api-core/src/request.ts`
- Create: `packages/api-core/src/cors.ts`
- Create: `packages/api-core/src/rate-limit.ts`
- Create: `packages/api-core/src/handler.ts`
- Create: `packages/api-core/src/handler.test.ts`
- Create: `api/v1/chat.ts`
- Create: `api/v1/health.ts`
- Create: `vercel.json`

**Interfaces:**
- Consumes: `answerQuestion`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ALLOWED_ORIGINS`, and `MONTHLY_REQUEST_BUDGET`.
- Produces: `createChatHandler(deps): (request: Request) => Promise<Response>`, `POST /api/v1/chat`, and `GET /api/v1/health`.

- [ ] **Step 1: Write failing API tests**

  Test valid Chinese and English requests, malformed JSON, missing language, question lengths 0/501, unsupported origins, OPTIONS preflight, per-IP limit exhaustion, monthly budget exhaustion, rate-store failure, model timeout, and error bodies that never echo secrets or full questions.

- [ ] **Step 2: Verify API tests fail**

  Run: `pnpm vitest run packages/api-core/src/handler.test.ts`  
  Expected: FAIL because `createChatHandler` does not exist.

- [ ] **Step 3: Implement the API core and Vercel adapters**

  Validate with Zod, allow only configured production origin plus `http://localhost:*` in development, use Upstash sliding-window limits, increment a calendar-month budget counter before model invocation, fail closed if abuse controls are unavailable, and apply an 18-second model timeout.

- [ ] **Step 4: Verify API behavior and type safety**

  Run: `pnpm vitest run packages/api-core/src/handler.test.ts && pnpm exec tsc --noEmit`  
  Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit API controls**

  Run: `git add packages/api-core api vercel.json && git commit -m "feat: expose protected chat API"`

### Task 5: Responsive bilingual public interface

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/index.html`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/i18n.ts`
- Create: `apps/web/src/api.ts`
- Create: `apps/web/src/styles.css`
- Create: `apps/web/src/components/Chat.tsx`
- Create: `apps/web/src/components/AnswerCard.tsx`
- Create: `apps/web/src/components/CategoryGrid.tsx`
- Create: `apps/web/src/components/RecentUpdates.tsx`
- Create: `apps/web/scripts/copy-knowledge.ts`
- Create: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/chat`, `data/knowledge/items.json`, and `data/knowledge/manifest.json` copied into the Vite public build.
- Produces: a static app with language toggle, chat, seven category shortcuts, recent updates, source cards, service/freshness state, and safe share links.

- [ ] **Step 1: Write failing UI tests**

  Assert browser-language defaulting, manual language persistence, all seven categories, loading/error/unknown/answered states, clickable official citations, stale labels, keyboard submission, accessible labels, and sharing that excludes question text from the URL.

- [ ] **Step 2: Verify UI tests fail**

  Run: `pnpm vitest run apps/web/src/App.test.tsx`  
  Expected: FAIL because the app does not exist.

- [ ] **Step 3: Implement the public interface**

  Build semantic React components, use CSS without a runtime UI framework, provide Chinese and English interface copy in `i18n.ts`, and configure `base: "/isb-knowledge-bot/"`. Keep static knowledge browsing usable when the chat API is unavailable.

- [ ] **Step 4: Verify component tests and production build**

  Run: `pnpm vitest run apps/web/src/App.test.tsx && pnpm --filter @isb/web build`  
  Expected: all tests PASS and `apps/web/dist/index.html` exists with `/isb-knowledge-bot/` asset paths.

- [ ] **Step 5: Commit the interface**

  Run: `git add apps/web package.json pnpm-lock.yaml && git commit -m "feat: build bilingual public assistant UI"`

### Task 6: Production workflows and end-to-end acceptance

**Files:**
- Create: `tests/e2e/public-assistant.spec.ts`
- Create: `playwright.config.ts`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/pages.yml`
- Create: `.env.example`
- Create: `docs/operations/deployment.md`
- Create: `docs/operations/privacy.md`
- Create: `README.md`

**Interfaces:**
- Consumes: build and test commands from Tasks 1–5.
- Produces: repeatable CI, Pages artifact, Vercel configuration instructions, and browser-level acceptance checks.

- [ ] **Step 1: Write failing browser acceptance tests**

  Test the app at `/isb-knowledge-bot/`, Chinese and English question flows with a mocked API, unknown-answer behavior, citation navigation, API-unavailable static browsing, 390px mobile viewport, and direct reload of a shared route.

- [ ] **Step 2: Verify browser tests fail before workflows and fixtures exist**

  Run: `pnpm playwright test tests/e2e/public-assistant.spec.ts`  
  Expected: FAIL because the test server/workflow configuration is incomplete.

- [ ] **Step 3: Add CI, Pages deployment, environment template, and runbook**

  Pin Node 22 and pnpm 10, run typecheck/unit/build/e2e in CI, upload only `apps/web/dist` to Pages, and document GitHub Pages plus Vercel linking. List variables by name without values and document rollback to a previous GitHub deployment and Vercel deployment.

- [ ] **Step 4: Run full MVP verification**

  Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm playwright test`  
  Expected: every command exits 0; Playwright passes desktop Chrome and mobile emulation; no secret-like value appears in `apps/web/dist`.

- [ ] **Step 5: Commit the deployable MVP**

  Run: `git add tests playwright.config.ts .github .env.example docs/operations README.md && git commit -m "ci: deploy and verify public assistant"`

- [ ] **Step 6: Create and configure production projects**

  Create the public GitHub repository `larrydingatcy/isb-knowledge-bot`, add it as `origin`, push `main`, enable GitHub Pages from the Actions workflow, and link the repository root to a Vercel project named `isb-knowledge-bot-api`. Configure `OPENAI_API_KEY`, `OPENAI_MODEL`, Upstash variables, `ALLOWED_ORIGINS`, and `MONTHLY_REQUEST_BUDGET` through secret-management interfaces without printing their values.

- [ ] **Step 7: Verify the live deployment**

  Run the health check and Playwright smoke test against the deployed Pages URL and API URL. Expected: the Pages URL loads without login, one Chinese and one English grounded query return citations, an unsupported origin is rejected, and no key appears in fetched JavaScript assets.

- [ ] **Step 8: Record deployment URLs and commit**

  Update `README.md` and `docs/operations/deployment.md` with the verified public Pages and Vercel health URLs, then run `git add README.md docs/operations/deployment.md && git commit -m "docs: record production deployment" && git push`.

