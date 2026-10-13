# ISB Family Knowledge Assistant

A public, bilingual knowledge browser and grounded question-answering assistant for International School of Beijing families. Answers use reviewed knowledge records and include official-source citations and verification dates.

## Local development

Requires Node.js 22 and pnpm 10.

```bash
pnpm install
pnpm build:index
pnpm --filter @isb/web build
pnpm --filter @isb/web exec vite preview --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173/isb-knowledge-bot/`.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm playwright test
```

## Architecture

- `apps/web`: static React interface for GitHub Pages.
- `api/v1`: Vercel Functions for health and chat.
- `packages/knowledge`: versioned knowledge schema and bilingual retrieval.
- `packages/answering`: provider-neutral grounded answer service.
- `packages/api-core`: HTTP validation, CORS, rate limiting, and budget controls.
- `data/knowledge`: reviewed public records and deterministic search index.

Deployment, rollback, and secret configuration are documented in [deployment operations](docs/operations/deployment.md). Privacy boundaries are documented in [privacy operations](docs/operations/privacy.md).
