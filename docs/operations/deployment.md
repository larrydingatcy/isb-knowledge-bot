# Deployment and rollback

## Production topology

- GitHub Pages hosts the static application at `/isb-knowledge-bot/`.
- Vercel hosts the versioned API routes under `/api/v1/`.
- Upstash Redis supplies distributed IP rate limiting and the monthly request counter.
- OpenAI is called only from the Vercel Function; its key is never part of the Pages build.

## GitHub setup

1. Create the public repository `larrydingatcy/isb-knowledge-bot` and push `main`.
2. In **Settings → Pages**, select **GitHub Actions** as the source.
3. Add repository variable `VITE_API_BASE_URL` containing the verified Vercel origin, without a trailing slash.
4. Run **Deploy GitHub Pages**. The workflow uploads only `apps/web/dist`.

## Vercel setup

1. Import the GitHub repository as project `isb-knowledge-bot-api` with the repository root as the project root.
2. Add `OPENAI_API_KEY`, `OPENAI_MODEL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ALLOWED_ORIGINS`, and `MONTHLY_REQUEST_BUDGET` to Production, Preview, and Development as appropriate.
3. Set `ALLOWED_ORIGINS=https://larrydingatcy.github.io` and a positive integer budget.
4. Deploy, then verify `GET /api/v1/health` returns `{"status":"ok"}`.
5. Never paste secret values into GitHub variables, source files, build logs, or support tickets.

## Verification

Run locally before deployment:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm playwright test
```

After deployment, verify the Pages URL loads without login, one Chinese and one English question return official citations, the health endpoint succeeds, and a request with an unsupported `Origin` returns HTTP 403.

## Rollback

- **GitHub Pages:** open the failed Pages workflow, identify the last known-good commit, revert the faulty commit on `main`, and let the Pages workflow redeploy that revision. Do not force-push shared history.
- **Vercel:** open the project’s Deployments page, select the last known-good production deployment, and use **Promote to Production**. Keep the Pages `VITE_API_BASE_URL` unchanged unless the API origin itself changes.
- **Knowledge data:** revert only the affected `data/knowledge` commit. Atomic releases ensure a failed ingestion never replaces the prior valid files.
