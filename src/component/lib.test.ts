/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import { initConvexTest, mockFetch, TEST_API_KEY } from "./setup.test.js";
import { withExtra } from "./lib.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scrape", () => {
  test("posts to /v2/scrape and returns the document", async () => {
    const t = initConvexTest();
    const { calls } = mockFetch([
      { body: { success: true, data: { markdown: "# Hi", metadata: { url: "https://a.com" } } } },
    ]);

    const document = await t.action(api.lib.scrape, {
      url: "https://a.com",
      options: { formats: ["markdown"], onlyMainContent: true },
    });

    expect(document).toEqual({
      markdown: "# Hi",
      metadata: { url: "https://a.com" },
    });
    expect(calls[0].url).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toEqual({
      origin: "firecrawl-convex",
      url: "https://a.com",
      formats: ["markdown"],
      onlyMainContent: true,
    });
  });

  test("sends the API key as a bearer token", async () => {
    const t = initConvexTest();
    const { fetchMock } = mockFetch([{ body: { success: true, data: {} } }]);

    await t.action(api.lib.scrape, { url: "https://a.com" });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.headers?.Authorization).toBe(`Bearer ${TEST_API_KEY}`);
  });

  test("surfaces API errors with status and message", async () => {
    const t = initConvexTest();
    mockFetch([{ status: 402, body: { success: false, error: "Insufficient credits" } }]);

    await expect(
      t.action(api.lib.scrape, { url: "https://a.com" }),
    ).rejects.toThrow(/Firecrawl \/v2\/scrape failed \(402\): Insufficient credits/);
  });

  test("retries a 429 and succeeds", async () => {
    const t = initConvexTest();
    const { calls } = mockFetch([
      { status: 429, body: { success: false, error: "rate limited" } },
      { body: { success: true, data: { markdown: "ok" } } },
    ]);

    const document = await t.action(api.lib.scrape, { url: "https://a.com" });

    expect(document).toEqual({ markdown: "ok" });
    expect(calls).toHaveLength(2);
  });

  test("does not retry a 400", async () => {
    const t = initConvexTest();
    const { calls } = mockFetch([
      { status: 400, body: { success: false, error: "bad url" } },
    ]);

    await expect(
      t.action(api.lib.scrape, { url: "not-a-url" }),
    ).rejects.toThrow(/bad url/);
    expect(calls).toHaveLength(1);
  });
});

describe("map", () => {
  test("normalizes string links into objects", async () => {
    const t = initConvexTest();
    mockFetch([
      {
        body: {
          success: true,
          id: "map-1",
          links: ["https://a.com/one", { url: "https://a.com/two", title: "Two" }],
        },
      },
    ]);

    const result = await t.action(api.lib.map, {
      url: "https://a.com",
      options: { limit: 10 },
    });

    expect(result).toEqual({
      id: "map-1",
      links: [
        { url: "https://a.com/one" },
        { url: "https://a.com/two", title: "Two" },
      ],
    });
  });
});

describe("batchScrape", () => {
  test("posts the urls and options to /v2/batch/scrape", async () => {
    const t = initConvexTest();
    const { calls } = mockFetch([
      {
        body: {
          success: true,
          id: "batch-1",
          url: "https://api.firecrawl.dev/v2/batch/scrape/batch-1",
        },
      },
    ]);

    const result = await t.action(api.lib.batchScrape, {
      urls: ["https://a.com", "https://b.com"],
      options: { formats: ["markdown"], extra: { maxConcurrency: 2 } },
    });

    expect(result).toEqual({
      id: "batch-1",
      url: "https://api.firecrawl.dev/v2/batch/scrape/batch-1",
    });
    expect(calls[0].url).toBe("https://api.firecrawl.dev/v2/batch/scrape");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toEqual({
      origin: "firecrawl-convex",
      urls: ["https://a.com", "https://b.com"],
      formats: ["markdown"],
      maxConcurrency: 2,
    });
  });

  test("fails when Firecrawl returns no job id", async () => {
    const t = initConvexTest();
    mockFetch([{ body: { success: true } }]);

    await expect(
      t.action(api.lib.batchScrape, { urls: ["https://a.com"] }),
    ).rejects.toThrow(/did not return a job id/);
  });
});

describe("getBatchScrape", () => {
  test("gets /v2/batch/scrape/<id> and returns status and data", async () => {
    const t = initConvexTest();
    const { calls } = mockFetch([
      {
        body: {
          success: true,
          status: "completed",
          total: 2,
          completed: 2,
          creditsUsed: 2,
          expiresAt: "2026-01-01T00:00:00.000Z",
          next: "https://api.firecrawl.dev/v2/batch/scrape/batch-1?skip=2",
          data: [
            { markdown: "# A", metadata: { url: "https://a.com" } },
            { markdown: "# B", metadata: { url: "https://b.com" } },
          ],
        },
      },
    ]);

    const result = await t.action(api.lib.getBatchScrape, {
      jobId: "batch-1",
    });

    expect(calls[0].url).toBe(
      "https://api.firecrawl.dev/v2/batch/scrape/batch-1",
    );
    expect(calls[0].method).toBe("GET");
    expect(calls[0].body).toBeUndefined();
    expect(result).toEqual({
      status: "completed",
      total: 2,
      completed: 2,
      creditsUsed: 2,
      next: "https://api.firecrawl.dev/v2/batch/scrape/batch-1?skip=2",
      data: [
        { markdown: "# A", metadata: { url: "https://a.com" } },
        { markdown: "# B", metadata: { url: "https://b.com" } },
      ],
    });
  });

  test("encodes the job id and defaults data to an empty array", async () => {
    const t = initConvexTest();
    const { calls } = mockFetch([
      { body: { success: true, status: "scraping", total: 3, completed: 0 } },
    ]);

    const result = await t.action(api.lib.getBatchScrape, { jobId: "a/b c" });

    expect(calls[0].url).toBe(
      "https://api.firecrawl.dev/v2/batch/scrape/a%2Fb%20c",
    );
    expect(result).toEqual({
      status: "scraping",
      total: 3,
      completed: 0,
      data: [],
    });
  });

  test("surfaces an unknown job as an error", async () => {
    const t = initConvexTest();
    mockFetch([
      { status: 404, body: { success: false, error: "Job not found" } },
    ]);

    await expect(
      t.action(api.lib.getBatchScrape, { jobId: "missing" }),
    ).rejects.toThrow(/404.*Job not found/);
  });
});

describe("search", () => {
  test("returns the source-grouped results", async () => {
    const t = initConvexTest();
    const { calls } = mockFetch([
      { body: { success: true, data: { web: [{ url: "https://a.com" }] } } },
    ]);

    const result = await t.action(api.lib.search, {
      query: "firecrawl convex",
      options: { limit: 3, scrapeOptions: { formats: ["markdown"] } },
    });

    expect(result).toEqual({ web: [{ url: "https://a.com" }] });
    expect(calls[0].body).toEqual({
      origin: "firecrawl-convex",
      query: "firecrawl convex",
      limit: 3,
      scrapeOptions: { formats: ["markdown"] },
    });
  });
});

describe("withExtra", () => {
  test("merges extra at the top level and inside scrapeOptions", () => {
    expect(
      withExtra({
        limit: 2,
        extra: { experimentalFlag: true },
        scrapeOptions: { formats: ["markdown"], extra: { newOption: 1 } },
      }),
    ).toEqual({
      limit: 2,
      experimentalFlag: true,
      scrapeOptions: { formats: ["markdown"], newOption: 1 },
    });
  });

  test("returns an empty object for no options", () => {
    expect(withExtra(undefined)).toEqual({});
  });
});
