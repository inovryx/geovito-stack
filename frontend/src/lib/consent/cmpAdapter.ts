import { defaultConsent, getConsent, setConsent } from '.';
import type { ConsentState } from './types';

export type CmpSignal = {
  tcfString?: string;
  gdprApplies?: boolean;
  purposes?: {
    analytics?: boolean;
    ads?: boolean;
  };
  vendors?: {
    google?: boolean;
  };
};

const canUseWindow = () => typeof window !== 'undefined';

export const readCmpSignal = async (): Promise<CmpSignal | null> => {
  if (!canUseWindow()) return null;

  // Placeholder: a certified IAB TCF CMP adapter can be plugged in later.
  return null;
};

export const mapCmpToConsent = (signal: CmpSignal): Partial<ConsentState> => {
  return {
    analytics: signal.purposes?.analytics === true,
    ads: signal.purposes?.ads === true,
    source: 'cmp',
  };
};

export const maybeSyncConsentFromCmp = async (): Promise<void> => {
  if (!canUseWindow()) return;

  try {
    const signal = await readCmpSignal();
    if (!signal) return;

    const mapped = mapCmpToConsent(signal);
    const current = getConsent() || defaultConsent();

    const nextAnalytics = mapped.analytics ?? current.analytics ?? false;
    const nextAds = mapped.ads ?? current.ads ?? false;

    const unchanged =
      current.analytics === nextAnalytics &&
      current.ads === nextAds &&
      current.source === 'cmp';

    if (unchanged) return;

    setConsent({
      v: 2,
      ts: Date.now(),
      necessary: true,
      analytics: nextAnalytics,
      ads: nextAds,
      source: 'cmp',
    });
  } catch {
    // CMP sync must never break page runtime.
  }
};
