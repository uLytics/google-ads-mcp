export interface Row {
  searchTerm: string;
  date: string;
  campaignId: string | null;
  adGroupId: string | null;
  impressions: number;
  clicks: number;
  costMicros: number | null;
  conversions: number;
}

export interface Candidate {
  text: string;
  match_types: Array<"EXACT" | "PHRASE">;
  reasons: string[];
}
