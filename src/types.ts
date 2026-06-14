export interface UsageResponse {
  daily_usage?: DailyUsage[];
  days_until_expiry?: number;
  expires_at?: string;
  isValid?: boolean;
  mode?: string;
  model_stats?: ModelStat[];
  rate_limits?: RateLimit[];
  status?: string;
  usage?: UsageSummary;
}

export interface DailyUsage {
  date?: string;
  requests?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  cache_creation_tokens?: number;
  total_tokens?: number;
  cost?: number;
  actual_cost?: number;
}

export interface ModelStat {
  model?: string;
  requests?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  total_tokens?: number;
  cost?: number;
  actual_cost?: number;
  account_cost?: number;
}

export interface RateLimit {
  limit?: number;
  remaining?: number;
  reset_at?: string;
  used?: number;
  window?: string;
  window_start?: string;
}

export interface UsageSummary {
  average_duration_ms?: number;
  rpm?: number;
  today?: UsageCounters;
  total?: UsageCounters;
  tpm?: number;
}

export interface UsageCounters {
  actual_cost?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  cost?: number;
  input_tokens?: number;
  output_tokens?: number;
  requests?: number;
  total_tokens?: number;
}

export type RateLimitWindow = "5h" | "7d";
