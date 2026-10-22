# Firecrawl for Convex

[![npm version](https://img.shields.io/npm/v/@firecrawl/firecrawl-convex.svg)](https://www.npmjs.com/package/@firecrawl/firecrawl-convex)

Scrape, map, and search the web from Convex functions, and run **durable
crawls** whose progress and pages live in your Convex database — so your UI
subscribes to a crawl instead of polling for it.

```ts
const firecrawl = new FirecrawlClient(components.firecrawl);

// One-shot
const page = await firecrawl.scrape(ctx, "https://firecrawl.dev", {
  formats: ["markdown"],
});

// Durable: returns immediately, pages stream into your database
const { crawlId } = await firecrawl.startCrawl(ctx, {
  url: "https://docs.firecrawl.dev",
  options: { limit: 50 },
  onComplete: internal.myModule.indexCrawledPages,
});
```

## What you get

|              |                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| `scrape`     | One URL → markdown, HTML, screenshot, summary, structured JSON                                       |
| `map`        | Every URL on a site, fast                                                                            |
| `search`     | Web search, optionally scraping each result                                                          |
| `startCrawl` | A whole site, tracked in your database: reactive status, pages as they arrive, a completion callback |

Crawls are the reason this is a component rather than a few `fetch` calls. A
crawl of a large site takes minutes and outlives any single action, so the
component owns a `crawls` row and a `pages` table, advances them from Firecrawl
webhooks (with a poll watchdog behind them), and exposes plain Convex queries.
Your client gets live progress through the normal subscription mechanism.

## Install

```sh
npm install @firecrawl/firecrawl-convex
```

Add the component to your app, wiring the API key through typed component env:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import { v } from "convex/values";
import firecrawl from "@firecrawl/firecrawl-convex/convex.config";

const app = defineApp({
  env: {
    FIRECRAWL_API_KEY: v.string(),
    FIRECRAWL_WEBHOOK_SECRET: v.optional(v.string()),
  },
});

app.use(firecrawl, {
  // Mounts the webhook route at <your-site>/firecrawl/webhook.
  // Required for crawls in webhook mode.
  httpPrefix: "/firecrawl/",
  env: {
    FIRECRAWL_API_KEY: app.env.FIRECRAWL_API_KEY,
    FIRECRAWL_WEBHOOK_SECRET: app.env.FIRECRAWL_WEBHOOK_SECRET,
  },
});

export default app;
```

Then set the key on your deployment:

```sh
npx convex env set FIRECRAWL_API_KEY fc-your-key
# Recommended: from the Firecrawl dashboard → Advanced → webhook secret
npx convex env set FIRECRAWL_WEBHOOK_SECRET whsec-your-secret
npx convex dev
```

Get a key at [firecrawl.dev](https://firecrawl.dev).

## Scrape, map, search

Call the component from your own actions. Keeping a wrapper in your app is where
authentication, authorization, and rate limiting belong — components can't see
`ctx.auth`. The [example app](example/convex/example.ts) shows the full pattern:
a `requireUser` gate on every paid endpoint, and an app-owned crawl → user table
checked before any crawl can be read, cancelled, or deleted.

```ts
// convex/web.ts
import { v } from "convex/values";
import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import { action } from "./_generated/server";
import { components } from "./_generated/api";

const firecrawl = new FirecrawlClient(components.firecrawl);

export const scrapePage = action({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await firecrawl.scrape(ctx, args.url, {
      formats: [
        "markdown",
        { type: "json", prompt: "Extract the pricing table" },
      ],
      onlyMainContent: true,
      maxAge: 3_600_000, // reuse Firecrawl's cache for an hour
    });
  },
});

export const siteUrls = action({
  args: { url: v.string() },
  handler: (ctx, args) => firecrawl.map(ctx, args.url, { limit: 500 }),
});

export const searchWeb = action({
  args: { query: v.string() },
  handler: (ctx, args) =>
    firecrawl.search(ctx, args.query, {
      limit: 5,
      scrapeOptions: { formats: ["markdown"] },
    }),
});
```

Option names match the
[Firecrawl v2 API](https://docs.firecrawl.dev/api-reference/v2-introduction) and
are passed through untouched, so the Firecrawl docs are the reference for what
they do. The typed surface covers the common options; a few enterprise and niche
ones (`profile`, `threatProtection`, `auditMetadata`, search `enterprise`) are
deliberately left out of the types. Those, and anything Firecrawl ships before
this package catches up, go through `extra`:

```ts
await firecrawl.scrape(ctx, url, {
  extra: { threatProtection: { mode: "off" } },
});
```

`scrape`, `map`, and `search` return the API response as-is (validated as
`v.any()` at the component boundary) rather than a re-modelled shape, so a new
response field is available the day Firecrawl ships it. The `FirecrawlClient`
methods give you TypeScript types over those responses.

## Data provider tools

`findTools` searches Firecrawl's catalogue of data provider tools (Alexandria),
such as npm download counts or package metadata, and is free. `runProviderTool`
runs one of them and costs that tool's credits (each item's `creditsCost`).

```ts
export const npmDownloads = action({
  args: { packages: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const { items } = await firecrawl.findTools(ctx, "npm package downloads", {
      limit: 3,
    });
    const tool = items[0];
    return await firecrawl.runProviderTool(
      ctx,
      tool.provider,
      tool.capability,
      {
        packages: args.packages,
        period: "last-week",
      },
    );
  },
});
```

Pass
`{ providers: [provider], capabilities: [capability], expand: ["options", "examples"] }`
to `findTools` to read a tool's options before you call it.

## Durable crawls

```ts
export const crawlDocs = action({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await firecrawl.startCrawl(ctx, {
      url: args.url,
      options: {
        limit: 100,
        includePaths: ["^/docs/.*"],
        scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
      },
      onComplete: internal.web.onCrawlComplete,
      context: { userId },
    });
  },
});
```

`startCrawl` returns `{ crawlId, jobId }` right away. From there:

```ts
// Live status: total, completed, pageCount, creditsUsed, error
export const crawlProgress = query({
  args: { crawlId: v.string() },
  handler: (ctx, args) => firecrawl.getCrawl(ctx, args.crawlId),
});

// Pages as they land — works with usePaginatedQuery
export const crawlPages = query({
  args: { crawlId: v.string(), paginationOpts: paginationOptsValidator },
  handler: (ctx, args) => firecrawl.listPages(ctx, args),
});
```

```tsx
function CrawlView({ crawlId }: { crawlId: string }) {
  const crawl = useQuery(api.web.crawlProgress, { crawlId });
  const { results } = usePaginatedQuery(
    api.web.crawlPages,
    { crawlId },
    { initialNumItems: 25 },
  );
  return (
    <>
      <progress value={crawl?.pageCount ?? 0} max={crawl?.total ?? 1} />
      <ul>
        {results.map((p) => (
          <li key={p._id}>{p.url}</li>
        ))}
      </ul>
    </>
  );
}
```

### The completion callback

`onComplete` takes an **internal mutation** of your app, run exactly once when
the crawl reaches a terminal state. `context` comes back untouched, so you can
carry a user id, a document id, whatever.

```ts
export const onCrawlComplete = internalMutation({
  args: {
    crawlId: v.string(),
    jobId: v.optional(v.string()),
    status: v.union(
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    pageCount: v.number(),
    unstored: v.optional(v.number()),
    error: v.optional(v.string()),
    context: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (args.status !== "completed") return;
    if (args.unstored)
      console.warn(`${args.unstored} pages were too large to store`);
    // e.g. hand the pages to an embedding pipeline
    await ctx.scheduler.runAfter(0, internal.rag.indexCrawl, {
      crawlId: args.crawlId,
      userId: args.context?.userId,
    });
  },
});
```

### Webhook mode vs poll mode

|                  | webhook (default)                                                                   | poll                                                        |
| ---------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| How pages arrive | Firecrawl pushes `crawl.page` events; a slow watchdog poll catches anything dropped | the component polls the status endpoint, backing off to 30s |
| Requires         | `httpPrefix` mounted, and a deployment Firecrawl can reach over the internet        | nothing                                                     |
| Use it when      | normal cloud deployments                                                            | local dev, self-hosted behind a firewall                    |

```ts
await firecrawl.startCrawl(ctx, { url, mode: "poll" });
```

A local Convex deployment isn't reachable from Firecrawl's servers, so use
`mode: "poll"` there — or the mock server described below, which delivers
webhooks to your local deployment for you.

Deliveries are checked twice: the `X-Firecrawl-Signature` HMAC (whenever
`FIRECRAWL_WEBHOOK_SECRET` is set) and a per-crawl token the component hands
Firecrawl when it registers the webhook. A delivery failing either check is
rejected with 401, and nothing is written.

### Other crawl operations

```ts
await firecrawl.getCrawlByJobId(ctx, jobId); // look up by Firecrawl's id
await firecrawl.listCrawls(ctx, { status: "scraping", limit: 20 });
await firecrawl.getPage(ctx, { crawlId, url });
await firecrawl.cancelCrawl(ctx, crawlId); // action
await firecrawl.deleteCrawl(ctx, crawlId); // mutation: crawl + its pages
await firecrawl.resumeCrawl(ctx, crawlId); // mutation: see below
```

The component stops checking on a crawl after ~250 status checks (roughly two
hours of polling, or a day of webhook watchdog) and finalizes it as `failed`
with an explanatory error, so subscribers and `onComplete` are never left
waiting on a job that will never report. If the job really is still running on
Firecrawl, `resumeCrawl` picks tracking back up where it left off.

Pass `storeContent: false` to `startCrawl` to record only URLs and metadata —
useful when you just want the callback, or when you re-fetch content elsewhere.

## Good to know

- **Errors** are `ConvexError`s carrying `{ code, status, path, message }`, so
  you can branch on `error.data.status === 402` (out of credits) or `429` (rate
  limited). Transient failures (408, 425, 429, 5xx) are retried three times with
  backoff, honoring `Retry-After`.
- **Document limits.** Convex documents cap at 1MB, so every page is budgeted in
  UTF-8 bytes across the whole document before it's written. Text and link lists
  are truncated; a screenshot, extracted `json`, or `changeTracking` blob that
  doesn't fit is dropped whole; oversized `metadata` falls back to its essential
  keys. Any of that sets `truncated: true` on the page. If Firecrawl returns
  pages that still can't be stored, the count shows up as `unstored` on the
  crawl and in the `onComplete` payload — never silently. For very large
  corpora, consider `storeContent: false` plus your own storage.
- **Credits** show up as `creditsUsed` on the crawl row and in each page's
  `metadata`.
- **Self-hosted Firecrawl:** declare `FIRECRAWL_API_URL` in the component env
  and point it at your instance.
- **Runtime:** everything runs in the Convex runtime — no `"use node"`, no
  bundled SDK. Requests go straight to the v2 REST API.

## Testing

Register the component in your own tests:

```ts
import { convexTest } from "convex-test";
import firecrawl from "@firecrawl/firecrawl-convex/test";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

export function initConvexTest() {
  process.env.FIRECRAWL_API_KEY = "fc-test-key";
  const t = convexTest(schema, modules);
  firecrawl.register(t);
  return t;
}
```

Then stub `fetch` to return canned Firecrawl responses — see
[`example/convex/example.test.ts`](example/convex/example.test.ts).

## Try it locally

The [`example/`](example) app exercises every entry point, and
[`example/mock-firecrawl.mjs`](example/mock-firecrawl.mjs) stands in for the
Firecrawl API — including signed webhook deliveries — so you can watch a crawl
progress without spending credits:

```sh
npm install

# terminal 1
FIRECRAWL_WEBHOOK_SECRET=whsec-mock npm run dev:mock

# terminal 2
npx convex env set FIRECRAWL_API_KEY fc-mock-key
npx convex env set FIRECRAWL_API_URL http://127.0.0.1:4242
npx convex env set FIRECRAWL_WEBHOOK_SECRET whsec-mock
npm run dev

# terminal 3
npx convex env set DEMO_ALLOW_ANONYMOUS true   # local CLI demo only
npx convex run example:startCrawl '{"url":"https://mock.test","limit":3}'
npx convex run example:myCrawls '{}'
npx convex run example:reports '{}'
```

Swap in a real key (and drop `FIRECRAWL_API_URL`) to hit the live API. See
[`example/README.md`](example/README.md) for the full list of commands.

## Development

```sh
npm run dev         # component codegen + build watcher + convex dev
npm test            # vitest, including type tests
npm run typecheck
npm run lint
```

`npm run dev` runs the three steps the
[authoring docs](https://docs.convex.dev/components/authoring) describe, in
order: component codegen, package build, then `convex dev` for the example app.

## License

MIT
