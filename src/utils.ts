export function maskToken(token: string | undefined): string {
  if (!token) {
    return "";
  }

  if (token.length <= 8) {
    return "****";
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function toStringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function toBooleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

export function formatFixedNumber(value: number | undefined, decimals: number): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "N/A";
  }

  return value.toFixed(decimals);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
