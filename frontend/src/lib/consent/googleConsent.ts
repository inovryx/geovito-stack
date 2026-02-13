import type { ConsentState } from './types';

declare global {
  interface Window {
    dataLayer?: Array<unknown>;
    gtag?: (...args: unknown[]) => void;
  }
}

export type ConsentMode = 'default' | 'update';

const canUseWindow = () => typeof window !== 'undefined';

const ensureGoogleRuntime = () => {
  if (!canUseWindow()) return null;

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = (...args: unknown[]) => {
      window.dataLayer?.push(args);
    };
  }

  return window.gtag;
};

export const googleConsentDefault = () => {
  const gtag = ensureGoogleRuntime();
  if (!gtag) return;

  gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
};

export const googleConsentUpdate = (state: ConsentState) => {
  const gtag = ensureGoogleRuntime();
  if (!gtag) return;

  const grantedAnalytics = state.analytics ? 'granted' : 'denied';
  const grantedAds = state.ads ? 'granted' : 'denied';

  gtag('consent', 'update', {
    analytics_storage: grantedAnalytics,
    ad_storage: grantedAds,
    ad_user_data: grantedAds,
    ad_personalization: grantedAds,
  });
};

export const applyGoogleConsent = (state: ConsentState, mode: ConsentMode = 'update') => {
  if (mode === 'default') {
    googleConsentDefault();
    return;
  }
  googleConsentUpdate(state);
};
