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

/**
 * Run one Alexandria call through `/v2/scrape` and return its data. A call that
 * fails arrives inside a 200 response, so its `error` is raised here.
 */
async function alexandria(
  provider: string,
  capability: string,
  options: Record<string, unknown>,
): Promise<any> {
  const body = await firecrawlRequest("/v2/scrape", {
    body: { alexandria: [{ provider, capability, options }] },
  });
  const result = body.data?.alexandria?.[0];
  if (result?.error) {
    throw new ConvexError({
      code: "firecrawl_tool_failed",
      status: result.error.status ?? 0,
      path: `${provider}/${capability}`,
      message: `Firecrawl ${provider}/${capability} failed: ${result.error.message ?? result.error.code}`,
    });
  }
  return result?.data ?? {};
}

/**
 * Find data provider tools (Alexandria) for a task. Free. Returns
 * `{ items, total, next }`; each item names the `provider` and `capability`
 * to pass to `runProviderTool`.
 */
export const findTools = action({
  args: {
    query: v.optional(v.string()),
    options: v.optional(v.record(v.string(), v.any())),
  },
  returns: v.any(),
  handler: async (_ctx, args) =>
    await alexandria("firecrawl", "find-tools", {
      ...(args.options ?? {}),
      ...(args.query ? { query: args.query } : {}),
    }),
});

/** Run one data provider tool found with `findTools`. Returns the tool's data. */
export const runProviderTool = action({
  args: {
    provider: v.string(),
    capability: v.string(),
    options: v.optional(v.record(v.string(), v.any())),
  },
  returns: v.any(),
  handler: async (_ctx, args) =>
    await alexandria(args.provider, args.capability, args.options ?? {}),
});
