# Verge — edge-native blogging engine

Built on Cloudflare Workers, D1, R2, Queues, Durable Objects, Workers AI.

## Observability: Workers Logs → Logpush → Axiom

Verge emits one JSON line per event via `console.log` from `src/lib/log.ts`. Cloudflare Workers Logs auto-captures stdout, and a Logpush job ships those logs to Axiom for querying and dashboards.

### Events emitted

| event | source | fields |
|---|---|---|
| `post_view` | `src/pages/post/[slug].astro` (cache MISS only) | `postId`, `slug`, `country` |
| `post_published` | `src/queue/consumer.ts` (after AI step) | `postId`, `slug`, `publishedAt` |
| `comment_posted` | `src/durable-objects/comment-room.ts` | `postId`, `userId`, `commentId` |
| `ai_call` | `src/lib/ai-cache.ts` | `model`, `ms`, `cached` |
| `subscribe` | `src/api/routes/subscribe.ts` | `email` |
| `newsletter_sent` / `newsletter_skipped` | `src/queue/consumer.ts` | `postId`, `sent`, `failed`, `total` |
| `error` | Hono `onError`, queue try/catch | `path`, `method`, `message`, `stack` |

### One-time setup

1. **Enable Workers Logs.** Cloudflare dashboard → your Worker (`verge`) → **Logs** tab → toggle **Workers Logs** on. (Free tier ships 24 h of retained logs; paid plans extend it. `observability.enabled: true` is already in [`wrangler.jsonc`](./wrangler.jsonc).)
2. **Create an Axiom dataset.** In Axiom → **Datasets** → **New Dataset** → name it `verge`. Then **Settings** → **API Tokens** → **New Ingest Token**. Copy the token (it looks like `xaat-…`). Locally, store it as `AXIOM_LOGPUSH_VERGE_TOKEN` in [`.dev.vars`](./.dev.vars) for reference.
3. **Add the Logpush job.** Cloudflare dashboard → **Analytics & Logs** → **Logpush** → **Create a Logpush job** → choose **Workers Logs** as the dataset → choose **HTTP** destination, with:
   - Destination URL: `https://api.axiom.co/v1/datasets/verge/ingest`
   - Headers:
     - `Authorization: Bearer <AXIOM_LOGPUSH_VERGE_TOKEN>`
     - `Content-Type: application/x-ndjson`
   - Filter: leave at default (all events) — Axiom is happy with the full stream.
4. **Verify ingest.** Hit the live site once; in Axiom run `['verge'] | where event == 'post_view' | take 20`. Events arrive within ~30 s.

> **Screenshot placeholder:** [add `docs/logpush-axiom.png` showing the Cloudflare → Logpush job form filled in with the Axiom destination URL and the dataset filter set to Workers Logs.]

### Useful Axiom queries

```
['verge'] | where event == 'ai_call' | summarize avg(ms), count() by model, cached
['verge'] | where event == 'post_view' | summarize count() by country | order by count_ desc
['verge'] | where event == 'error' | take 50
['verge'] | where event == 'comment_posted' | summarize count() by bin(_time, 1h)
```

## Local development

```sh
pnpm install
pnpm db:local       # apply D1 migrations to .wrangler/state
pnpm dev            # astro dev with miniflare bindings
```

Secrets live in [`.dev.vars`](./.dev.vars) (gitignored): `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `RESEND_API_KEY` (optional — newsletter sends are skipped without it), `AXIOM_LOGPUSH_VERGE_TOKEN` (reference only; the actual Logpush job lives on the Cloudflare dashboard).
