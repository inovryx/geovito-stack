import type { ConsentState } from './types';

const CONSENT_STORAGE_KEY = 'consent.v1';
const CONSENT_VERSION = 2;

type ConsentListener = (state: ConsentState) => void;

const listeners = new Set<ConsentListener>();

const canUseWindow = () => typeof window !== 'undefined';

const toBoolean = (value: unknown) => value === true;
const toSource = (value: unknown): ConsentState['source'] =>
  value === 'cmp' || value === 'user' ? value : undefined;

const normalizeTimestamp = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return Date.now();
  }
  return Math.max(0, Math.round(value));
};

const parseStoredConsent = (value: string | null): ConsentState | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<ConsentState & { v?: number }> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.necessary !== true) return null;

    if (parsed.v === CONSENT_VERSION) {
      return {
        v: CONSENT_VERSION,
        ts: normalizeTimestamp(parsed.ts),
        necessary: true,
        analytics: toBoolean(parsed.analytics),
        ads: toBoolean(parsed.ads),
        source: toSource(parsed.source),
      };
    }

    // Migration path: consent.v1 payloads are upgraded in memory to v2.
    if (parsed.v === 1) {
      return {
        v: CONSENT_VERSION,
        ts: normalizeTimestamp(parsed.ts),
        necessary: true,
        analytics: toBoolean(parsed.analytics),
        ads: toBoolean(parsed.ads),
      };
    }

    return null;
  } catch {
    return null;
  }
};

const toState = (state: ConsentState): ConsentState => ({
  v: CONSENT_VERSION,
  ts: normalizeTimestamp(state.ts),
  necessary: true,
  analytics: toBoolean(state.analytics),
  ads: toBoolean(state.ads),
  source: toSource(state.source),
});

const emitConsentChange = (state: ConsentState) => {
  if (!canUseWindow()) return;

  listeners.forEach((listener) => listener(state));
  window.dispatchEvent(
    new CustomEvent('gv:consent-change', {
      detail: state,
    })
  );
};

export const defaultConsent = (): ConsentState => ({
  v: CONSENT_VERSION,
  ts: Date.now(),
  necessary: true,
  analytics: false,
  ads: false,
});

export const applyConsentToDocument = (state: ConsentState) => {
  if (!canUseWindow()) return;

  const root = document.documentElement;
  root.setAttribute('data-consent-necessary', '1');
  root.setAttribute('data-consent-analytics', state.analytics ? '1' : '0');
  root.setAttribute('data-consent-ads', state.ads ? '1' : '0');
};

export const getConsent = (): ConsentState | null => {
  if (!canUseWindow()) return null;

  try {
    return parseStoredConsent(window.localStorage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
};

export const hasChoice = () => getConsent() !== null;

export const setConsent = (state: ConsentState) => {
  if (!canUseWindow()) return;

  const next = toState(state);

  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // no-op
  }

  applyConsentToDocument(next);
  emitConsentChange(next);
};

export const subscribe = (listener: ConsentListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
