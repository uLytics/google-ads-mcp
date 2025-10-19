import { GoogleAdsApi } from "google-ads-api";
import type { Row } from "./types.js";

type GaqlInput = {
  start: string;
  end: string;
  campaignId?: string;
  adGroupId?: string;
};

const REQUIRED_ENV_VARS = [
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
] as const;

const MOCK_ROWS: Row[] = [
  {
    searchTerm: "free resume template",
    date: "2024-05-01",
    campaignId: "1234567890",
    adGroupId: "1111111111",
    impressions: 120,
    clicks: 25,
    costMicros: 1750000,
    conversions: 0,
  },
  {
    searchTerm: "how to write a resume",
    date: "2024-05-02",
    campaignId: "1234567890",
    adGroupId: "1111111111",
    impressions: 95,
    clicks: 18,
    costMicros: 2400000,
    conversions: 1,
  },
  {
    searchTerm: "executive recruiting services",
    date: "2024-05-02",
    campaignId: "1234567890",
    adGroupId: "2222222222",
    impressions: 60,
    clicks: 7,
    costMicros: 3300000,
    conversions: 3,
  },
  {
    searchTerm: "job board for developers",
    date: "2024-05-03",
    campaignId: "1234567890",
    adGroupId: "2222222222",
    impressions: 210,
    clicks: 35,
    costMicros: 4150000,
    conversions: 0,
  },
  {
    searchTerm: "resume review service",
    date: "2024-05-03",
    campaignId: "1234567890",
    adGroupId: "3333333333",
    impressions: 44,
    clicks: 4,
    costMicros: 950000,
    conversions: 0,
  },
];

export function buildGaql({ start, end, campaignId, adGroupId }: GaqlInput): string {
  const campaignFilter = campaignId ? `  AND campaign.id = '${campaignId}'` : "";
  const adGroupFilter = adGroupId ? `  AND ad_group.id = '${adGroupId}'` : "";

  return `SELECT\n  search_term_view.search_term,\n  segments.date,\n  campaign.id,\n  ad_group.id,\n  metrics.impressions,\n  metrics.clicks,\n  metrics.cost_micros,\n  metrics.conversions\nFROM search_term_view\nWHERE segments.date BETWEEN '${start}' AND '${end}'\n  AND campaign.status = 'ENABLED'\n${campaignFilter ? `${campaignFilter}\n` : ""}${adGroupFilter ? `${adGroupFilter}\n` : ""}`.trimEnd();
}

function hasGoogleAdsCredentials(env: NodeJS.ProcessEnv): boolean {
  return REQUIRED_ENV_VARS.every((key) => Boolean(env[key] && env[key]?.trim().length));
}

export async function fetchRowsOrMock(
  env: NodeJS.ProcessEnv,
  gaql: string,
  customerId?: string,
): Promise<Row[]> {
  if (!hasGoogleAdsCredentials(env)) {
    console.info("google-ads-mcp: Using mock search term data (missing Google Ads credentials).");
    return MOCK_ROWS;
  }

  if (!customerId) {
    console.info("google-ads-mcp: Using mock data because no customerId was provided.");
    return MOCK_ROWS;
  }

  const api = new GoogleAdsApi({
    developer_token: env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    client_id: env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: env.GOOGLE_ADS_CLIENT_SECRET!,
    refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN!,
  });

  const customer = api.Customer({
    customer_id: customerId,
    login_customer_id: env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || undefined,
  });

  try {
    const response = await customer.query(gaql);

    return response.map((row: any) => ({
      searchTerm: row.search_term_view?.search_term ?? "",
      date: row.segments?.date ?? "",
      campaignId: row.campaign?.id != null ? String(row.campaign.id) : null,
      adGroupId: row.ad_group?.id != null ? String(row.ad_group.id) : null,
      impressions: Number(row.metrics?.impressions ?? 0),
      clicks: Number(row.metrics?.clicks ?? 0),
      costMicros: row.metrics?.cost_micros != null ? Number(row.metrics.cost_micros) : null,
      conversions: Number(row.metrics?.conversions ?? 0),
    }));
  } catch (error) {
    console.error("google-ads-mcp: Failed to query Google Ads API, falling back to mock data.", error);
    return MOCK_ROWS;
  }
}
