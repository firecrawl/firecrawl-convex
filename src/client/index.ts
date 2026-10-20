import { createFunctionHandle } from "convex/server";
import type {
  FunctionReference,
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  PaginationOptions,
  PaginationResult,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";

// ---------------------------------------------------------------------------
// Firecrawl types (see https://docs.firecrawl.dev/api-reference/v2-introduction)
// ---------------------------------------------------------------------------

export type FormatString =
  | "markdown"
  | "html"
  | "rawHtml"
  | "links"
  | "images"
  | "screenshot"
  | "summary"
  | "changeTracking"
  | "json"
  | "attributes"
  | "branding"
  | "product"
  | "menu"
  | "audio"
  | "video";

export type FormatObject = {
  type: FormatString;
  prompt?: string;
  schema?: Record<string, unknown>;
  modes?: string[];
  tag?: string;
  fullPage?: boolean;
  quality?: number;
  viewport?: { width: number; height: number };
  selectors?: Array<{ selector: string; attribute: string }>;
  question?: string;
  query?: string;
  mode?: string;
};

export type Format = FormatString | FormatObject;

export type LocationConfig = { country?: string; languages?: string[] };

export type ScrapeOptions = {
  formats?: Format[];
  headers?: Record<string, string>;
  includeTags?: string[];
  excludeTags?: string[];
  onlyMainContent?: boolean;
  timeout?: number;
  waitFor?: number;
  mobile?: boolean;
  parsers?: unknown[];
  actions?: unknown[];
  location?: LocationConfig;
  skipTlsVerification?: boolean;
  removeBase64Images?: boolean;
  blockAds?: boolean;
  proxy?: "basic" | "stealth" | "enhanced" | "auto" | string;
  maxAge?: number;
  minAge?: number;
  storeInCache?: boolean;
  lockdown?: boolean;
  redactPII?: boolean | Record<string, unknown>;
  zeroDataRetention?: boolean;
  /** Escape hatch for API fields this component version doesn't model yet. */
  extra?: Record<string, unknown>;
};

export type DocumentMetadata = {
  title?: string;
  description?: string;
  url?: string;
  sourceURL?: string;
  language?: string;
  statusCode?: number;
  contentType?: string;
  creditsUsed?: number;
  cacheState?: "hit" | "miss";
  error?: string;
  [key: string]: unknown;
};

export type FirecrawlDocument = {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  summary?: string;
  screenshot?: string;
  links?: string[];
  images?: string[];
  json?: unknown;
  changeTracking?: Record<string, unknown>;
  metadata?: DocumentMetadata;
  warning?: string;
  [key: string]: unknown;
};

export type MapOptions = {
  search?: string;
  sitemap?: "only" | "include" | "skip";
  includeSubdomains?: boolean;
  ignoreQueryParameters?: boolean;
  limit?: number;
  timeout?: number;
  location?: LocationConfig;
  extra?: Record<string, unknown>;
};

export type MapLink = { url: string; title?: string; description?: string };

export type MapResult = { id?: string; links: MapLink[] };

export type SearchOptions = {
  sources?: Array<"web" | "news" | "images" | { type: string }>;
  categories?: Array<"github" | "research" | "pdf" | "developer" | { type: string }>;
  includeDomains?: string[];
  excludeDomains?: string[];
  limit?: number;
  tbs?: string;
  location?: string;
  ignoreInvalidURLs?: boolean;
  timeout?: number;
  highlights?: boolean;
  scrapeOptions?: ScrapeOptions;
  extra?: Record<string, unknown>;
};

export type SearchResult = {
  url?: string;
  title?: string;
  description?: string;
  position?: number;
  [key: string]: unknown;
};

export type SearchResponse = {
  web?: Array<SearchResult | FirecrawlDocument>;
  news?: Array<SearchResult | FirecrawlDocument>;
  images?: Array<SearchResult | FirecrawlDocument>;
  developer?: Array<SearchResult | FirecrawlDocument>;
};

export type BatchScrapeStatus = {
  status: "scraping" | "completed" | "failed" | "cancelled";
  total?: number;
  completed?: number;
  creditsUsed?: number;
  /** Set when more results are waiting; fetch it to page through them. */
  next?: string;
  data: FirecrawlDocument[];
};

export type CrawlOptions = {
  prompt?: string;
  includePaths?: string[];
  excludePaths?: string[];
  maxDiscoveryDepth?: number;
  sitemap?: "only" | "include" | "skip";
  ignoreQueryParameters?: boolean;
  deduplicateSimilarURLs?: boolean;
  limit?: number;
  crawlEntireDomain?: boolean;
  allowExternalLinks?: boolean;
  allowSubdomains?: boolean;
  ignoreRobotsTxt?: boolean;
  robotsUserAgent?: string;
  delay?: number;
  maxConcurrency?: number;
  regexOnFullURL?: boolean;
  zeroDataRetention?: boolean;
  scrapeOptions?: ScrapeOptions;
  extra?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Component types
// ---------------------------------------------------------------------------

export type CrawlStatus = "scraping" | "completed" | "failed" | "cancelled";

/** How crawl progress reaches the component. */
export type CrawlMode = "webhook" | "poll";

export type Crawl = {
  _id: string;
  _creationTime: number;
  jobId?: string;
  url: string;
  status: CrawlStatus;
  mode: CrawlMode;
  storeContent: boolean;
  /** Pages Firecrawl attempted, as last reported. */
  total?: number;
  /** Pages Firecrawl finished, as last reported. */
  completed?: number;
  /** Pages stored in Convex. */
  pageCount: number;
  creditsUsed?: number;
  /** Pages Firecrawl returned that could not be stored (e.g. over 1MB). */
  unstored?: number;
  error?: string;
  context?: unknown;
  finalized: boolean;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
};

export type CrawledPage = {
  _id: string;
  _creationTime: number;
  crawlId: string;
  url: string;
  markdown?: string;
  html?: string;
  rawHtml?: string;
  summary?: string;
  screenshot?: string;
  links?: string[];
  json?: unknown;
  changeTracking?: unknown;
  metadata?: DocumentMetadata;
  /** True when content was cut or dropped to fit Convex's 1MB document limit. */
  truncated: boolean;
  scrapedAt: number;
};

/** Argument shape of the mutation you pass as `onComplete`. */
export type CrawlCompletePayload = {
  crawlId: string;
  jobId?: string;
  status: "completed" | "failed" | "cancelled";
  pageCount: number;
  /** Pages Firecrawl returned that could not be stored (e.g. over 1MB). */
  unstored?: number;
  error?: string;
  context?: any;
};

export type OnCompleteMutation = FunctionReference<
  "mutation",
  "internal",
  CrawlCompletePayload,
  null | void
>;

export type StartCrawlArgs = {
  url: string;
  options?: CrawlOptions;
  /**
   * `webhook` (the default when the component's HTTP routes are mounted) has
   * Firecrawl push progress, with a slow poll watchdog behind it. `poll` never
   * registers a webhook — use it if you haven't mounted the routes.
   */
  mode?: CrawlMode;
  /** Keep page content, not just URLs and metadata. Defaults to true. */
  storeContent?: boolean;
  /** App mutation to run once the crawl reaches a terminal state. */
  onComplete?: OnCompleteMutation;
  /** Opaque data handed back to `onComplete`. */
  context?: unknown;
};

type QueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
type MutationCtx = Pick<
  GenericMutationCtx<GenericDataModel>,
  "runQuery" | "runMutation"
>;
type ActionCtx = Pick<
  GenericActionCtx<GenericDataModel>,
  "runQuery" | "runMutation" | "runAction"
>;

/**
 * Typed client for the Firecrawl component.
 *
 * ```ts
 * const firecrawl = new FirecrawlClient(components.firecrawl);
 *
 * export const scrapePage = action({
 *   args: { url: v.string() },
 *   handler: (ctx, args) =>
 *     firecrawl.scrape(ctx, args.url, { formats: ["markdown"] }),
 * });
 * ```
 */
export class FirecrawlClient {
  constructor(public component: ComponentApi) {}

  /** Scrape one URL. */
  async scrape(
    ctx: ActionCtx,
    url: string,
    options?: ScrapeOptions,
  ): Promise<FirecrawlDocument> {
    return await ctx.runAction(this.component.lib.scrape, { url, options });
  }

  /** List the URLs of a site. */
  async map(
    ctx: ActionCtx,
    url: string,
    options?: MapOptions,
  ): Promise<MapResult> {
    return await ctx.runAction(this.component.lib.map, { url, options });
  }

  /** Search the web, optionally scraping each result. */
  async search(
    ctx: ActionCtx,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResponse> {
    return await ctx.runAction(this.component.lib.search, { query, options });
  }

  /**
   * Start a batch scrape of several URLs and return right away. Poll
   * `getBatchScrape` with the returned id for progress and results.
   */
  async batchScrape(
    ctx: ActionCtx,
    urls: string[],
    options?: ScrapeOptions,
  ): Promise<{ id: string; url?: string }> {
    return await ctx.runAction(this.component.lib.batchScrape, {
      urls,
      options,
    });
  }

  /** Status and documents of a batch scrape, fetched live from Firecrawl. */
  async getBatchScrape(
    ctx: ActionCtx,
    jobId: string,
  ): Promise<BatchScrapeStatus> {
    return await ctx.runAction(this.component.lib.getBatchScrape, { jobId });
  }

  /**
   * Start a crawl and return right away. Subscribe to `getCrawl` for progress
   * and `listPages` for results as they arrive.
   */
  async startCrawl(
    ctx: ActionCtx,
    args: StartCrawlArgs,
  ): Promise<{ crawlId: string; jobId: string }> {
    return await ctx.runAction(this.component.crawl.start, {
      url: args.url,
      options: args.options,
      mode: args.mode,
      storeContent: args.storeContent,
      onComplete: args.onComplete
        ? await createFunctionHandle(args.onComplete)
        : undefined,
      context: args.context,
    });
  }

  /** Status and progress of a crawl. Reactive — subscribe to it from a query. */
  async getCrawl(ctx: QueryCtx, crawlId: string): Promise<Crawl | null> {
    return await ctx.runQuery(this.component.crawl.get, { crawlId });
  }

  /** Look up a crawl by Firecrawl's job id. */
  async getCrawlByJobId(ctx: QueryCtx, jobId: string): Promise<Crawl | null> {
    return await ctx.runQuery(this.component.crawl.getByJobId, { jobId });
  }

  /** Recent crawls, newest first. */
  async listCrawls(
    ctx: QueryCtx,
    args: { status?: CrawlStatus; limit?: number } = {},
  ): Promise<Crawl[]> {
    return await ctx.runQuery(this.component.crawl.listCrawls, args);
  }

  /** A page of crawled pages, ordered by URL. */
  async listPages(
    ctx: QueryCtx,
    args: { crawlId: string; paginationOpts: PaginationOptions },
  ): Promise<PaginationResult<CrawledPage>> {
    return (await ctx.runQuery(
      this.component.crawl.listPages,
      args,
    )) as PaginationResult<CrawledPage>;
  }

  /** One crawled page by URL. */
  async getPage(
    ctx: QueryCtx,
    args: { crawlId: string; url: string },
  ): Promise<CrawledPage | null> {
    return await ctx.runQuery(this.component.crawl.getPage, args);
  }

  /** Ask Firecrawl to cancel a running crawl. */
  async cancelCrawl(ctx: ActionCtx, crawlId: string): Promise<null> {
    return await ctx.runAction(this.component.crawl.cancel, { crawlId });
  }

  /** Delete a crawl and its stored pages. */
  async deleteCrawl(ctx: MutationCtx, crawlId: string): Promise<null> {
    return await ctx.runMutation(this.component.crawl.deleteCrawl, { crawlId });
  }

  /**
   * Resume tracking a crawl the component gave up on (it stops after ~250
   * status checks). Returns false if there was nothing to resume.
   */
  async resumeCrawl(ctx: MutationCtx, crawlId: string): Promise<boolean> {
    return await ctx.runMutation(this.component.crawl.resume, { crawlId });
  }
}

export default FirecrawlClient;
