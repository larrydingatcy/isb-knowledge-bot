# ISB Extensible Ingestion Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configuration-driven official-site crawling and administrator-controlled document ingestion that publish validated, redacted, versioned knowledge into the existing public assistant.

**Architecture:** A shared ingestion package loads allowlisted source definitions, invokes pluggable adapters, normalizes results to the established `KnowledgeItem` contract, performs PII and publication-policy checks, and writes an atomic candidate release. Public crawling runs daily in GitHub Actions; document ingestion runs through an administrator CLI with draft, preview, approve, publish, and withdraw states.

**Tech Stack:** Existing TypeScript monorepo, Zod, Undici, Cheerio, Mozilla Readability with JSDOM, robots-parser, pdf-parse, Mammoth, file-type, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-13-isb-knowledge-bot-design.md`

## Global Constraints

- Execute this plan after `2026-10-13-isb-public-assistant.md`.
- New ordinary sites are added through `config/sources.yml`; special sites use adapter modules without changing answering code.
- Only HTTPS hosts explicitly listed in source configuration may be fetched; redirects must remain in the same allowlist.
- Crawlers obey per-source rate limits and robots rules unless an authenticated adapter has a documented, authorized policy.
- Uploaded files are administrator-only, start as drafts, and require explicit approval before public publication.
- Raw copyrighted or access-restricted documents are not published; only approved derived text and citation metadata are stored.
- Failed or empty crawl results never replace the last known good public release.
- Use test-driven development and make one focused commit at the end of every task.

## Review Focus

- A configured URL that redirects to localhost, link-local, private IP, or a non-allowlisted host must be blocked as SSRF; pinned in Task 1.
- A page whose layout changes to return empty navigation or login text must fail quality gates and preserve the prior release; pinned in Task 3.
- A PDF or DOCX containing a student identifier, email, phone, or account balance must remain draft-blocked until redacted and approved; pinned in Task 4.
- Two sources publishing the same event with different deadlines must survive as a conflict rather than one silently overwriting the other; pinned in Task 3.
- A failed daily run must produce a machine-readable failure summary while leaving the published manifest unchanged; pinned in Task 6.

---

## File Structure

```text
config/sources.yml                     Declarative official source registry
packages/ingestion/src/config/         Source schema and safe fetch policy
packages/ingestion/src/adapters/       Pluggable source and file adapters
packages/ingestion/src/pipeline/       Normalize, deduplicate, redact, release
packages/ingestion/src/admin/          Draft and approval state machine
scripts/ingest.ts                      Administrator CLI
data/drafts/                            Git-ignored local draft workspace
data/knowledge/                         Published versioned output
.github/workflows/ingest-public.yml    Daily crawler and controlled release
```

### Task 1: Source registry and safe fetch boundary

**Files:**
- Create: `config/sources.yml`
- Create: `packages/ingestion/package.json`
- Create: `packages/ingestion/src/config/schema.ts`
- Create: `packages/ingestion/src/config/load.ts`
- Create: `packages/ingestion/src/config/safe-url.ts`
- Create: `packages/ingestion/src/config/config.test.ts`

**Interfaces:**
- Consumes: YAML source definitions.
- Produces: `SourceDefinition`, `loadSources(path: string): Promise<SourceDefinition[]>`, and `assertSafeSourceUrl(url: URL, source: SourceDefinition, resolveDns: ResolveDns): Promise<void>`.

- [ ] **Step 1: Write failing configuration and SSRF tests**

  Test unique IDs, HTTPS-only URLs, valid adapter names, positive crawl intervals, allowlisted redirects, DNS resolving to loopback/private/link-local ranges, mixed public/private DNS answers, encoded IPv4, IPv6 loopback, and a valid official host.

- [ ] **Step 2: Verify tests fail**

  Run: `pnpm vitest run packages/ingestion/src/config/config.test.ts`  
  Expected: FAIL because the configuration package does not exist.

- [ ] **Step 3: Implement the registry and URL guard**

  Define `SourceDefinition` fields `id`, `name`, `baseUrl`, `startUrls`, `adapter`, `languages`, `categories`, `crawlIntervalHours`, `maxPages`, `requestDelayMs`, and `visibilityPolicy`. Validate every initial URL and redirect target before a request.

- [ ] **Step 4: Verify safe configuration loading**

  Run: `pnpm vitest run packages/ingestion/src/config/config.test.ts`  
  Expected: all tests PASS.

- [ ] **Step 5: Commit the source boundary**

  Run: `git add config/sources.yml packages/ingestion && git commit -m "feat: add safe source registry"`

### Task 2: Pluggable public-web adapters

**Files:**
- Create: `packages/ingestion/src/adapters/types.ts`
- Create: `packages/ingestion/src/adapters/registry.ts`
- Create: `packages/ingestion/src/adapters/html.ts`
- Create: `packages/ingestion/src/adapters/sitemap.ts`
- Create: `packages/ingestion/src/adapters/adapters.test.ts`
- Create: `packages/ingestion/test/fixtures/official-page.html`
- Create: `packages/ingestion/test/fixtures/sitemap.xml`

**Interfaces:**
- Consumes: `SourceDefinition` and a guarded `FetchClient`.
- Produces: `SourceAdapter.collect(context: AdapterContext): AsyncIterable<RawDocument>` and `createAdapter(name: "html" | "sitemap"): SourceAdapter`; `RawDocument` includes canonical URL, title, language, HTML/text, published date, fetched date, and attachments.

- [ ] **Step 1: Write failing adapter contract tests**

  Assert canonical URL extraction, title/content/date extraction, sitemap traversal capped by `maxPages`, per-request delay invocation, robots denial, same-content deduplication, unsupported content type rejection, and a registry error for unknown adapter names.

- [ ] **Step 2: Verify adapter tests fail**

  Run: `pnpm vitest run packages/ingestion/src/adapters/adapters.test.ts`  
  Expected: FAIL because adapter interfaces are missing.

- [ ] **Step 3: Implement HTML and sitemap adapters**

  Use Readability for article extraction and Cheerio for metadata. Inject fetch, clock, delay, and robots dependencies so tests require no network. Do not execute page scripts.

- [ ] **Step 4: Verify adapters against fixed fixtures**

  Run: `pnpm vitest run packages/ingestion/src/adapters/adapters.test.ts`  
  Expected: all tests PASS with zero external requests.

- [ ] **Step 5: Commit adapters**

  Run: `git add packages/ingestion/src/adapters packages/ingestion/test && git commit -m "feat: add public source adapters"`

### Task 3: Normalization, conflicts, and atomic releases

**Files:**
- Create: `packages/ingestion/src/pipeline/normalize.ts`
- Create: `packages/ingestion/src/pipeline/pii.ts`
- Create: `packages/ingestion/src/pipeline/deduplicate.ts`
- Create: `packages/ingestion/src/pipeline/quality.ts`
- Create: `packages/ingestion/src/pipeline/release.ts`
- Create: `packages/ingestion/src/pipeline/release.test.ts`
- Create: `data/knowledge/status.json`

**Interfaces:**
- Consumes: `RawDocument[]`, existing `KnowledgeItem[]`, and `KnowledgeManifest`.
- Produces: `prepareRelease(input: ReleaseInput): ReleaseCandidate` and `publishRelease(candidate: ReleaseCandidate, targetDir: string): Promise<ReleaseSummary>`; the candidate contains public items, blocked items, conflicts, warnings, content hashes, and next manifest.

- [ ] **Step 1: Write failing release tests**

  Cover deterministic IDs, Unicode normalization, unchanged hashes, duplicate merges, conflicting dates retained and tagged, PII-blocked public documents, empty/login-page quality failure, partial source failure, and atomic write failure. Assert every failure leaves prior files byte-identical.

- [ ] **Step 2: Verify release tests fail**

  Run: `pnpm vitest run packages/ingestion/src/pipeline/release.test.ts`  
  Expected: FAIL because the pipeline is missing.

- [ ] **Step 3: Implement staged release creation**

  Write candidate files to a sibling temporary directory, validate them with `parsePublicKnowledge`, rebuild the search index, then atomically replace published files. Preserve same-fact conflicts as linked entries and record source-level freshness in `status.json`.

- [ ] **Step 4: Verify failure preservation and deterministic output**

  Run: `pnpm vitest run packages/ingestion/src/pipeline/release.test.ts && pnpm build:index`  
  Expected: all tests PASS and a repeated build produces no diff.

- [ ] **Step 5: Commit the release pipeline**

  Run: `git add packages/ingestion/src/pipeline data/knowledge/status.json && git commit -m "feat: publish validated knowledge releases"`

### Task 4: Secure PDF, DOCX, text, Markdown, and HTML ingestion

**Files:**
- Create: `packages/ingestion/src/adapters/files.ts`
- Create: `packages/ingestion/src/adapters/files.test.ts`
- Create: `packages/ingestion/src/adapters/malware.ts`
- Create: `packages/ingestion/src/admin/drafts.ts`
- Create: `packages/ingestion/src/admin/drafts.test.ts`
- Create: `packages/ingestion/test/fixtures/sample.pdf`
- Create: `packages/ingestion/test/fixtures/sample.docx`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: local file path plus `UploadMetadata { sourceName, sourceUrl?, categories, validUntil?, visibility }`.
- Produces: `MalwareScanner.scan(path: string): Promise<{ clean: boolean; signature?: string }>`, `ingestFile(path: string, metadata: UploadMetadata): Promise<DraftDocument>`, and `DraftStore` methods `create`, `preview`, `approve`, `withdraw`; draft state transitions are `draft -> blocked | approved -> published | withdrawn`.

- [ ] **Step 1: Write failing file and state-machine tests**

  Test MIME-by-content rather than extension, allowed formats, maximum 20 MiB file size, encrypted/corrupt PDF rejection, DOCX parsing, HTML script removal, an EICAR-style malware fixture through a fake scanner, scanner-unavailable fail-closed behavior, PII detection for student IDs/email/phone/account balance, duplicate file hashes, illegal state transitions, and withdrawal of published derived items.

- [ ] **Step 2: Verify file tests fail**

  Run: `pnpm vitest run packages/ingestion/src/adapters/files.test.ts packages/ingestion/src/admin/drafts.test.ts`  
  Expected: FAIL because file ingestion and draft storage are missing.

- [ ] **Step 3: Implement local draft ingestion and approval**

  Use `file-type`, `pdf-parse`, and Mammoth; strip active HTML; call an injected malware scanner whose production adapter uses `clamdscan`; keep raw files inside git-ignored `data/drafts/`; write an audit record containing hashes and metadata but never document contents. Require a redaction acknowledgment before approving a blocked draft.

- [ ] **Step 4: Verify secure upload lifecycle**

  Run: `pnpm vitest run packages/ingestion/src/adapters/files.test.ts packages/ingestion/src/admin/drafts.test.ts`  
  Expected: all tests PASS.

- [ ] **Step 5: Commit document ingestion**

  Run: `git add packages/ingestion/src/adapters/files.ts packages/ingestion/src/adapters/files.test.ts packages/ingestion/src/adapters/malware.ts packages/ingestion/src/admin packages/ingestion/test/fixtures .gitignore && git commit -m "feat: add reviewed document ingestion"`

### Task 5: Administrator ingestion CLI

**Files:**
- Create: `scripts/ingest.ts`
- Create: `scripts/ingest.test.ts`
- Create: `docs/operations/sources-and-uploads.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: source registry, adapters, pipeline, and `DraftStore`.
- Produces: commands `pnpm ingest crawl [source-id]`, `pnpm ingest source validate`, `pnpm ingest upload <path>`, `pnpm ingest draft preview <id>`, `pnpm ingest draft approve <id>`, `pnpm ingest publish`, and `pnpm ingest withdraw <id>`.

- [ ] **Step 1: Write failing CLI tests**

  Test help output, unknown command, unknown source, dry-run behavior, JSON summaries, nonzero exit codes, preview requiring no mutation, publish requiring approved drafts, and confirmation for withdrawal.

- [ ] **Step 2: Verify CLI tests fail**

  Run: `pnpm vitest run scripts/ingest.test.ts`  
  Expected: FAIL because the CLI is missing.

- [ ] **Step 3: Implement CLI commands and administrator documentation**

  Keep business logic in packages; the CLI only parses arguments, prompts for explicit approval, invokes interfaces, and prints human plus JSON summaries. Document adding a configured source and adding a custom adapter.

- [ ] **Step 4: Verify commands with temporary workspaces**

  Run: `pnpm vitest run scripts/ingest.test.ts && pnpm ingest source validate`  
  Expected: all tests PASS and source validation exits 0.

- [ ] **Step 5: Commit administrator tools**

  Run: `git add scripts/ingest.ts scripts/ingest.test.ts docs/operations/sources-and-uploads.md package.json && git commit -m "feat: add ingestion administration CLI"`

### Task 6: Daily public ingestion workflow and recovery

**Files:**
- Create: `.github/workflows/ingest-public.yml`
- Create: `scripts/write-ingestion-summary.ts`
- Create: `scripts/write-ingestion-summary.test.ts`
- Create: `docs/operations/crawler-recovery.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `pnpm ingest crawl`, `pnpm ingest publish`, and GitHub Actions scheduled/manual triggers.
- Produces: daily validated updates, an Actions job summary, a machine-readable `artifacts/ingestion-summary.json`, and a commit only when public output changed.

- [ ] **Step 1: Write failing summary and no-change tests**

  Assert success, no-change, partial failure, total failure, blocked-PII, and stale-source summaries; assert a failed/empty result never invokes the commit step and leaves `manifest.json` unchanged.

- [ ] **Step 2: Verify workflow helper tests fail**

  Run: `pnpm vitest run scripts/write-ingestion-summary.test.ts`  
  Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement scheduled workflow and recovery documentation**

  Schedule daily in UTC with `workflow_dispatch`, concurrency lock, least-privilege contents write permission, dependency cache, test-before-publish, deterministic bot commit, Pages trigger, and artifact upload on failure. Document structure-change recovery and rollback.

- [ ] **Step 4: Run full ingestion verification**

  Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm ingest source validate && pnpm ingest crawl --dry-run`  
  Expected: all commands exit 0; dry run reports sources without changing `data/knowledge`.

- [ ] **Step 5: Commit automated ingestion**

  Run: `git add .github scripts/write-ingestion-summary.ts scripts/write-ingestion-summary.test.ts docs/operations/crawler-recovery.md && git commit -m "ci: automate official source ingestion"`

