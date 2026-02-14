import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type MetricsProvider = 'ga4' | 'gsc' | 'cloudflare' | 'adsense';

export interface DateRangeShape {
  start: string;
  end: string;
}

export interface ProviderResultShape {
  provider: MetricsProvider;
  date_range?: DateRangeShape;
  generated_at?: string;
  metrics?: Record<string, number>;
  rows?: Array<Record<string, unknown>>;
  notes?: string[];
  errors?: string[];
}

export interface SummaryProviderSliceShape {
  provider: MetricsProvider;
  metrics?: Record<string, number>;
  row_count?: number;
  errors?: string[];
  notes?: string[];
}

export interface SummaryResultShape {
  generated_at?: string;
  date_range?: DateRangeShape;
  providers?: SummaryProviderSliceShape[];
  kpis?: Record<string, number>;
  warnings?: string[];
}

const DATE_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const resolveMetricsBasePath = (basePath: string) => {
  if (!basePath) return path.resolve(process.cwd(), '../data/metrics');
  if (path.isAbsolute(basePath)) return path.normalize(basePath);
  return path.resolve(process.cwd(), basePath);
};

export const loadJson = <T>(filePath: string): T | null => {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isObjectRecord(parsed) && !Array.isArray(parsed)) return null;
    return parsed as T;
  } catch {
    return null;
  }
};

export const findLatestMetricsDir = (basePath: string): string | null => {
  const resolvedBase = resolveMetricsBasePath(basePath);
  if (!existsSync(resolvedBase)) return null;

  const candidates = readdirSync(resolvedBase, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && DATE_DIR_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  for (const dirName of candidates) {
    if (existsSync(path.join(resolvedBase, dirName, 'summary.json'))) {
      return dirName;
    }
  }

  return candidates[0] || null;
};

export const loadLatestSummary = (basePath: string): SummaryResultShape | null => {
  const resolvedBase = resolveMetricsBasePath(basePath);
  const latestDir = findLatestMetricsDir(resolvedBase);
  if (!latestDir) return null;

  return loadJson<SummaryResultShape>(path.join(resolvedBase, latestDir, 'summary.json'));
};

export const loadSummaryFile = (basePath: string, dateDir: string): SummaryResultShape | null => {
  const resolvedBase = resolveMetricsBasePath(basePath);
  if (!dateDir || !DATE_DIR_PATTERN.test(dateDir)) return null;
  return loadJson<SummaryResultShape>(path.join(resolvedBase, dateDir, 'summary.json'));
};

export const loadProviderFile = (
  basePath: string,
  dateDir: string,
  provider: MetricsProvider
): ProviderResultShape | null => {
  const resolvedBase = resolveMetricsBasePath(basePath);
  if (!dateDir || !DATE_DIR_PATTERN.test(dateDir)) return null;
  return loadJson<ProviderResultShape>(path.join(resolvedBase, dateDir, `${provider}.json`));
};
