type RuntimeEnv = Record<string, unknown> | undefined;

type OpsControlPayload = {
  opsEnabledUntil: string | null;
  opsViewTokenHash: string | null;
};

export type OpsAccessResult = {
  enabled: boolean;
  authorized: boolean;
  canView: boolean;
};

const OPS_TOKEN_HEADER = 'x-geovito-ops-token';

const fromImportMetaEnv = (key: 'OPS_STRAPI_URL' | 'OPS_STRAPI_TOKEN' | 'STRAPI_URL') => {
  if (key === 'OPS_STRAPI_URL') return import.meta.env.OPS_STRAPI_URL as string | undefined;
  if (key === 'OPS_STRAPI_TOKEN') return import.meta.env.OPS_STRAPI_TOKEN as string | undefined;
  return import.meta.env.STRAPI_URL as string | undefined;
};

const readEnv = (
  runtimeEnv: RuntimeEnv,
  key: 'OPS_STRAPI_URL' | 'OPS_STRAPI_TOKEN' | 'STRAPI_URL'
) => {
  const runtimeValue = runtimeEnv?.[key];
  if (typeof runtimeValue === 'string' && runtimeValue.trim()) {
    return runtimeValue.trim();
  }

  if (typeof process !== 'undefined' && process?.env?.[key]?.trim()) {
    return process.env[key]?.trim();
  }

  const fallback = fromImportMetaEnv(key);
  return typeof fallback === 'string' && fallback.trim() ? fallback.trim() : '';
};

const normalizeBaseUrl = (value: string) => value.replace(/\/$/, '');

const parseSingleTypeData = (payload: any): OpsControlPayload | null => {
  const data = payload?.data;
  if (!data || typeof data !== 'object') return null;

  const source = data.attributes && typeof data.attributes === 'object' ? data.attributes : data;
  const opsEnabledUntil =
    typeof source.opsEnabledUntil === 'string' && source.opsEnabledUntil.trim()
      ? source.opsEnabledUntil.trim()
      : null;
  const opsViewTokenHash =
    typeof source.opsViewTokenHash === 'string' && source.opsViewTokenHash.trim()
      ? source.opsViewTokenHash.trim().toLowerCase()
      : null;

  return {
    opsEnabledUntil,
    opsViewTokenHash,
  };
};

const sha256Hex = async (value: string) => {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');
};

const constantTimeEquals = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
};

const isEnabledUntilFuture = (value: string | null) => {
  if (!value) return false;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return false;
  return Date.now() < timestamp;
};

const fetchOpsControl = async (runtimeEnv: RuntimeEnv): Promise<OpsControlPayload | null> => {
  const opsStrapiUrl = readEnv(runtimeEnv, 'OPS_STRAPI_URL') || readEnv(runtimeEnv, 'STRAPI_URL');
  const opsStrapiToken = readEnv(runtimeEnv, 'OPS_STRAPI_TOKEN');

  if (!opsStrapiUrl || !opsStrapiToken) {
    return null;
  }

  const requestUrl = `${normalizeBaseUrl(opsStrapiUrl)}/api/ops-control?fields[0]=opsEnabledUntil&fields[1]=opsViewTokenHash`;
  const response = await fetch(requestUrl, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${opsStrapiToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return parseSingleTypeData(payload);
};

export const resolveOpsAccess = async (
  request: Request,
  runtimeEnv: RuntimeEnv
): Promise<OpsAccessResult> => {
  const control = await fetchOpsControl(runtimeEnv);
  const enabled = isEnabledUntilFuture(control?.opsEnabledUntil || null);
  const requestToken = request.headers.get(OPS_TOKEN_HEADER)?.trim() || '';

  if (!enabled || !control?.opsViewTokenHash || !requestToken) {
    return {
      enabled,
      authorized: false,
      canView: false,
    };
  }

  const requestTokenHash = await sha256Hex(requestToken);
  const authorized = constantTimeEquals(requestTokenHash.toLowerCase(), control.opsViewTokenHash);

  return {
    enabled,
    authorized,
    canView: enabled && authorized,
  };
};
