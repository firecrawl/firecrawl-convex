# Changelog

## 0.2.0

- `batchScrape` and `getBatchScrape` actions over `/v2/batch/scrape`, with
  matching `FirecrawlClient` methods and a `BatchScrapeStatus` type. Batch
  scrapes are stateless for now: the component starts the job and fetches its
  status on request, without storing results or registering a webhook.

## 0.1.1

Packaging fixes. No runtime changes.

- Published as `@firecrawl/firecrawl-convex`, under the `firecrawl` npm org.
  0.1.0 shipped under that name too, but with the docs and example still
  referring to the unscoped `firecrawl-convex`.
- Dropped a bogus `"main": "eslint.config.js"` that npm's rename normalization
  introduced in 0.1.0. It pointed at a file the package doesn't even ship, and
  was only ever inert because `exports` takes precedence.
- README, example app, and `PUBLISHING.md` now use the scoped name throughout.

## 0.1.0

Initial release.

- `scrape`, `map`, and `search` actions over the Firecrawl v2 API, running in the
  Convex runtime (no `"use node"`, no bundled SDK).
- Durable crawls: `startCrawl` tracks a crawl in the component's own tables,
  advanced by Firecrawl webhooks with a poll watchdog behind them, and exposes
  reactive `getCrawl` / `listPages` queries plus an `onComplete` callback.
- Webhook deliveries verified by `X-Firecrawl-Signature` HMAC and a per-crawl
  token.
- Typed `FirecrawlClient` for app code, and a `@firecrawl/firecrawl-convex/test` helper for
  registering the component in `convex-test`.
- Page documents are budgeted in UTF-8 bytes across every variable-sized field,
  so oversized `metadata`, `json`, `changeTracking`, or `links` can't push a
  write past Convex's 1MB limit. Pages that still can't be stored are counted as
  `unstored` on the crawl and in the `onComplete` payload rather than being lost
  silently, and a failed write no longer strands the crawl mid-poll.
- Crawls always reach a terminal state. After ~250 status checks the component
  finalizes as `failed` with an explanatory error instead of sitting in
  `scraping` forever; `resumeCrawl` picks tracking back up if the job is still
  running on Firecrawl.
