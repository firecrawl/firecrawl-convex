import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server.js";
import { firecrawlRequest } from "./api.js";
import {
  mapOptionsValidator,
  scrapeOptionsValidator,
  searchOptionsValidator,
} from "./validators.js";

/**
 * Flatten an options object for the wire: `extra` is merged in at the same
 * level, and nested `scrapeOptions` get the same treatment.
 */
export function withExtra(
  options?: Record<string, any>,
): Record<string, unknown> {
  if (!options) return {};
  const { extra, scrapeOptions, ...rest } = options;
  const flattened: Record<string, unknown> = { ...rest, ...(extra ?? {}) };
  if (scrapeOptions) flattened.scrapeOptions = withExtra(scrapeOptions);
  return flattened;
}

/** Scrape a single URL. Returns a Firecrawl document. */
export const scrape = action({
  args: {
    url: v.string(),
    options: v.optional(scrapeOptionsValidator),
  },
  returns: v.any(),
  handler: async (_ctx, args) => {
    const body = await firecrawlRequest("/v2/scrape", {
      body: { url: args.url, ...withExtra(args.options) },
    });
    return body.data ?? {};
  },
});

/** List the URLs of a site. Returns `{ id?, links }`. */
export const map = action({
  args: {
    url: v.string(),
    options: v.optional(mapOptionsValidator),
  },
  returns: v.any(),
  handler: async (_ctx, args) => {
    const body = await firecrawlRequest("/v2/map", {
      body: { url: args.url, ...withExtra(args.options) },
    });
    const links = Array.isArray(body.links) ? body.links : [];
    return {
      id: body.id,
      links: links.map((link: unknown) =>
        typeof link === "string" ? { url: link } : link,
      ),
    };
  },
});

/**
 * Start a batch scrape of several URLs with shared scrape options. Returns
 * `{ id, url }`; poll `getBatchScrape` with the id for results.
 */
export const batchScrape = action({
  args: {
    urls: v.array(v.string()),
    options: v.optional(scrapeOptionsValidator),
  },
  returns: v.object({ id: v.string(), url: v.optional(v.string()) }),
  handler: async (_ctx, args) => {
    const body = await firecrawlRequest("/v2/batch/scrape", {
      body: { urls: args.urls, ...withExtra(args.options) },
    });
    if (typeof body.id !== "string" || body.id.length === 0) {
      throw new ConvexError({
        code: "firecrawl_no_job_id",
        message: "Firecrawl /v2/batch/scrape did not return a job id.",
      });
    }
    return {
      id: body.id,
      url: typeof body.url === "string" ? body.url : undefined,
    };
  },
});

/**
 * Status and results of a batch scrape. `data` holds the documents scraped so
 * far; when `next` is set, the rest are behind that URL.
 */
export const getBatchScrape = action({
  args: { jobId: v.string() },
  returns: v.any(),
  handler: async (_ctx, args) => {
    const body = await firecrawlRequest(
      `/v2/batch/scrape/${encodeURIComponent(args.jobId)}`,
      { method: "GET" },
    );
    return {
      status: body.status,
      total: body.total,
      completed: body.completed,
      creditsUsed: body.creditsUsed,
      next: typeof body.next === "string" ? body.next : undefined,
      data: Array.isArray(body.data) ? body.data : [],
    };
  },
});

/** Search the web. Returns `{ web?, news?, images?, developer? }`. */
export const search = action({
  args: {
    query: v.string(),
    options: v.optional(searchOptionsValidator),
  },
  returns: v.any(),
  handler: async (_ctx, args) => {
    const body = await firecrawlRequest("/v2/search", {
      body: { query: args.query, ...withExtra(args.options) },
    });
    return body.data ?? {};
  },
});
