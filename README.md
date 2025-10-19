# Google Ads Negative Keyword MCP Server

A starter repository for running a Model Context Protocol (MCP) tool server on Netlify Functions. The server exposes Google Ads search term utilities that can either connect to the live Google Ads API or fall back to deterministic mock data for local development.

## Features

- ✅ **Netlify Function** entry point at [`/netlify/functions/mcp.ts`](netlify/functions/mcp.ts) served from `/mcp`.
- ✅ Implements two MCP tools using [`@modelcontextprotocol/sdk`](https://modelcontextprotocol.io/):
  - `fetch_search_terms` – builds GAQL for `search_term_view` and returns live or mock rows.
  - `suggest_negative_keywords` – analyses rows to recommend EXACT/PHRASE negative keywords with human-readable reasons.
- ✅ Uses [`fetch-to-node`](https://github.com/netlify/fetch-to-node) to adapt Netlify’s `Request`/`Response` objects for the MCP transport.
- ✅ Shared TypeScript types, Zod validation, and JSON/text dual outputs for MCP-aware and plain clients.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

If you are offline or blocked from the npm registry, install packages when connectivity is available.

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your Google Ads API credentials. When any credential is missing, the server logs a message and returns the bundled mock search-term dataset.

```bash
cp .env.example .env
# Edit .env as needed
```

### 3. Run locally with Netlify Dev

```bash
npm run dev
```

Netlify Dev serves the function at <http://localhost:8888/mcp>. The function only responds to POST requests that follow the MCP HTTP specification.

### 4. Inspect via MCP tools

You can proxy the HTTP endpoint into the MCP Inspector using the [`mcp-remote`](https://github.com/modelcontextprotocol/remote) adapter:

```bash
npx @modelcontextprotocol/inspector npx mcp-remote@next http://localhost:8888/mcp
```

When deployed to Netlify:

```bash
npx @modelcontextprotocol/inspector npx mcp-remote@next https://<your-site>.netlify.app/mcp
```

## Project Structure

```
├── netlify/functions/mcp.ts   # Netlify handler registering MCP tools
├── src/
│   ├── googleAds.ts           # GAQL builder + live/mock data fetcher
│   ├── types.ts               # Shared Row & Candidate interfaces
│   └── util/mcp.ts            # Helper to format MCP tool results
├── .env.example               # Required Google Ads credentials
├── netlify.toml               # Netlify configuration (Node 20 + esbuild)
├── package.json               # Scripts & dependencies (TypeScript + linting)
├── tsconfig.json              # Strict ESM configuration targeting ES2022
└── README.md                  # This file
```

## Available Scripts

- `npm run dev` – start Netlify Dev locally.
- `npm run build` – type-check and emit JS to `dist/`.
- `npm run typecheck` – run TypeScript without emitting files.
- `npm run lint` – lint the repository with ESLint + `@typescript-eslint`.

## Tool Contracts

### `fetch_search_terms`

- **Input**
  ```json
  {
    "customerId": "1234567890",
    "start": "2024-05-01",
    "end": "2024-05-07",
    "campaignId": "optional",
    "adGroupId": "optional"
  }
  ```
- **Output**
  ```json
  {
    "rows": [
      {
        "searchTerm": "free resume template",
        "date": "2024-05-01",
        "campaignId": "1234567890",
        "adGroupId": "1111111111",
        "impressions": 120,
        "clicks": 25,
        "costMicros": 1750000,
        "conversions": 0
      }
    ]
  }
  ```

### `suggest_negative_keywords`

- **Input**
  ```json
  {
    "rows": [ /* output from fetch_search_terms */ ],
    "minClicks": 5,
    "maxConvRate": 0.005,
    "badPhrases": ["free", "job", "jobs", "hiring", "how to", "what is", "review", "reviews"]
  }
  ```
- **Output**
  ```json
  {
    "summary": "Identified 2 negative keyword candidates from 5 rows (minClicks=5, maxConvRate=0.50%).",
    "candidates": [
      {
        "text": "free resume template",
        "match_types": ["EXACT", "PHRASE"],
        "reasons": [
          "Low conv-rate (0.00%) on 25 clicks; cost ~$1.75",
          "Search term contains phrase \"free\"."
        ]
      }
    ]
  }
  ```

Both tools automatically format responses with plain-text JSON and structured content for MCP clients.

## Deployment

1. Ensure `netlify.toml` is committed.
2. Connect the repository to Netlify.
3. Set your environment variables in Netlify’s UI.
4. Deploy with `netlify deploy` or via CI. The MCP endpoint will be available at `https://<site>.netlify.app/mcp`.

## Testing Notes

The repository is designed for stateless, request/response MCP interactions. Long-lived SSE connections are not required or supported.
