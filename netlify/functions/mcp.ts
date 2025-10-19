import { config as loadEnv } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/transport/http";
import { z } from "zod";
import { toReqRes } from "fetch-to-node";

import { buildGaql, fetchRowsOrMock } from "../../src/googleAds.js";
import type { Candidate } from "../../src/types.js";
import { formatMcpOutput } from "../../src/util/mcp.js";

loadEnv();

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected YYYY-MM-DD format");

const rowSchema = z.object({
  searchTerm: z.string(),
  date: dateSchema,
  campaignId: z.string().nullable(),
  adGroupId: z.string().nullable(),
  impressions: z.number().nonnegative(),
  clicks: z.number().nonnegative(),
  costMicros: z.number().nullable(),
  conversions: z.number().nonnegative(),
});

type RowSchema = z.infer<typeof rowSchema>;

const fetchSearchTermsInputSchema = z
  .object({
    customerId: z.string().min(1, "customerId is required"),
    start: dateSchema,
    end: dateSchema,
    campaignId: z.string().optional(),
    adGroupId: z.string().optional(),
  })
  .strict();

const fetchSearchTermsOutputSchema = z.object({
  rows: z.array(rowSchema),
});

const suggestNegativeKeywordsInputSchema = z.object({
  rows: z.array(rowSchema),
  minClicks: z.number().min(0).optional().default(5),
  maxConvRate: z.number().min(0).optional().default(0.005),
  badPhrases: z
    .array(z.string().min(1))
    .optional()
    .default(["free", "job", "jobs", "hiring", "how to", "what is", "review", "reviews"]),
});

const suggestNegativeKeywordsOutputSchema = z.object({
  summary: z.string(),
  candidates: z.array(
    z.object({
      text: z.string(),
      match_types: z.array(z.enum(["EXACT", "PHRASE"])),
      reasons: z.array(z.string()),
    }),
  ),
});

function registerTools(server: McpServer) {
  server.tool("fetch_search_terms", {
    description: "Fetch Google Ads search term performance rows (mocked when credentials are missing).",
    input: fetchSearchTermsInputSchema,
    output: fetchSearchTermsOutputSchema,
    execute: async ({ input }) => {
      const parsed = fetchSearchTermsInputSchema.parse(input);
      const gaql = buildGaql({
        start: parsed.start,
        end: parsed.end,
        campaignId: parsed.campaignId,
        adGroupId: parsed.adGroupId,
      });

      const rows = await fetchRowsOrMock(process.env, gaql, parsed.customerId);

      const output = fetchSearchTermsOutputSchema.parse({ rows });
      return formatMcpOutput(output);
    },
  });

  server.tool("suggest_negative_keywords", {
    description: "Suggest negative keyword candidates from Google Ads search term rows.",
    input: suggestNegativeKeywordsInputSchema,
    output: suggestNegativeKeywordsOutputSchema,
    execute: async ({ input }) => {
      const parsed = suggestNegativeKeywordsInputSchema.parse(input);
      const {
        rows,
        minClicks,
        maxConvRate,
        badPhrases,
      } = parsed;

      const normalizedPhrases = badPhrases.map((phrase) => phrase.toLowerCase());

      const candidates: Candidate[] = [];
      for (const row of rows) {
        const parsedRow: RowSchema = rowSchema.parse(row);
        const convRate = parsedRow.clicks === 0 ? 0 : parsedRow.conversions / parsedRow.clicks;
        const reasons: string[] = [];

        if (parsedRow.clicks >= minClicks && convRate <= maxConvRate) {
          const cost = (parsedRow.costMicros ?? 0) / 1_000_000;
          reasons.push(
            `Low conv-rate (${(convRate * 100).toFixed(2)}%) on ${parsedRow.clicks} clicks; cost ~$${cost.toFixed(2)}`,
          );
        }

        const lowerTerm = parsedRow.searchTerm.toLowerCase();
        const matchedPhrase = normalizedPhrases.find((phrase) => lowerTerm.includes(phrase));
        if (matchedPhrase) {
          reasons.push(`Search term contains phrase "${matchedPhrase}".`);
        }

        if (reasons.length > 0) {
          candidates.push({
            text: parsedRow.searchTerm,
            match_types: ["EXACT", "PHRASE"],
            reasons,
          });
        }
      }

      const summary = `Identified ${candidates.length} negative keyword ${candidates.length === 1 ? "candidate" : "candidates"} from ${rows.length} rows (minClicks=${minClicks}, maxConvRate=${(
        maxConvRate * 100
      ).toFixed(2)}%).`;

      const output = suggestNegativeKeywordsOutputSchema.parse({
        summary,
        candidates,
      });

      return formatMcpOutput(output);
    },
  });
}

export const config = { path: "/mcp" };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const server = new McpServer({ name: "ads-negatives", version: "1.0.0" });
  registerTools(server);

  const transport = new StreamableHTTPServerTransport();
  const converted = toReqRes(request as any) as any;
  const nodeReq = converted.req;
  const nodeRes = converted.res;
  const responsePromise: Promise<Response> | undefined =
    converted.response ??
    converted.responsePromise ??
    converted.res?.responsePromise;

  try {
    await server.connect(transport);
    const body = await request.json();
    await transport.handleRequest(nodeReq, nodeRes, body);

    if (responsePromise) {
      return await responsePromise;
    }

    if (typeof converted.toResponse === "function") {
      return await converted.toResponse();
    }

    return new Response(null, { status: 204 });
  } finally {
    transport.close();
    server.close();
  }
}
