# Public crawler recovery

The daily workflow validates the registry and ingestion tests before touching published knowledge. A failed crawl, empty result, PII block, or stale source writes `artifacts/ingestion-summary.json` and does not commit. The last known good `data/knowledge` release remains live.

## Layout or login-shell failure

1. Download the workflow's `ingestion-summary` artifact and identify the source.
2. Reproduce with `pnpm ingest crawl <source-id> --dry-run`, then run a fixture-backed adapter test locally.
3. Update selectors or the custom adapter without weakening empty/login-page quality gates.
4. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm ingest source validate`.
5. Dispatch the workflow manually. Review the knowledge diff and status file before allowing the bot commit.

## Rollback

Revert only the bad `chore: refresh ISB public knowledge` commit and push the revert. Pages will redeploy the prior validated release. Do not delete history or overwrite `main`.
