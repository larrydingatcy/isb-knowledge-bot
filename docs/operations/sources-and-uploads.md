# Sources and document uploads

## Add an ordinary official site

Add one entry to `config/sources.yml`. Every start URL and every redirect host must use HTTPS and appear in `allowedHosts`. Choose `html` for individual pages or `sitemap` for an XML sitemap. Validate before committing:

```bash
pnpm ingest source validate
pnpm ingest crawl <source-id> --dry-run
```

For a source with a unique structure, add a `SourceAdapter` under `packages/ingestion/src/adapters`, register its explicit name, and provide fixture-based tests. Adapters receive a guarded fetch client and must not create their own network client.

## Upload a document

The administrator machine needs a running ClamAV daemon and `clamdscan` on `PATH`. Uploads are limited to 20 MiB and support PDF, DOCX, text, Markdown, and inert HTML.

```bash
pnpm ingest upload /absolute/path/to/notice.pdf
pnpm ingest draft preview <draft-id>
pnpm ingest draft approve <draft-id>
pnpm ingest publish
```

Files containing identifiers, contact details, or account balances remain blocked. Redact them locally and record explicit acknowledgment before approval. Raw files and drafts stay in git-ignored `data/drafts/`; only validated derived knowledge may enter `data/knowledge/`.

To withdraw published derived content, review the ID and run `pnpm ingest withdraw <draft-id> --yes`.
