import type { ConsentState } from '../consent/types';
import { googleConsentDefault, googleConsentUpdate } from '../consent/googleConsent';

type TagManager = 'none' | 'gtm' | 'zaraz';

declare global {
  interface Window {
    dataLayer?: Array<unknown>;
    gtag?: (...args: unknown[]) => void;
    __gvGtmInjected?: boolean;
  }
}

const rawManager = String(import.meta.env.PUBLIC_TAG_MANAGER || 'none').toLowerCase();
const TAG_MANAGER: TagManager = rawManager === 'gtm' || rawManager === 'zaraz' ? rawManager : 'none';
const GTM_ID = String(import.meta.env.PUBLIC_GTM_ID || '').trim();
const GTM_LOAD_BEFORE_CONSENT = import.meta.env.PUBLIC_GTM_LOAD_BEFORE_CONSENT === 'true';

const canUseWindow = () => typeof window !== 'undefined';
const toFlag = (value: boolean) => (value ? 1 : 0);

const ensureDataLayer = () => {
  window.dataLayer = window.dataLayer || [];
  return window.dataLayer;
};

const ensureGoogleRuntime = () => {
  if (!canUseWindow()) return;
  ensureDataLayer();
  if (typeof window.gtag !== 'function') {
    window.gtag = (...args: unknown[]) => {
      window.dataLayer?.push(args);
    };
  }
};

const isGtmInjectAllowed = (state: ConsentState) =>
  GTM_LOAD_BEFORE_CONSENT || state.analytics === true || state.ads === true;

const injectGtm = (gtmId: string) => {
  if (!canUseWindow()) return;
  if (!gtmId) return;
  if (window.__gvGtmInjected) return;
  if (document.querySelector('script[data-gv-gtm-script="1"]')) {
    window.__gvGtmInjected = true;
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
  script.setAttribute('data-gv-gtm-script', '1');
  document.head.appendChild(script);
  window.__gvGtmInjected = true;
};

const pushConsentEvent = (eventName: string, state: ConsentState) => {
  if (!canUseWindow()) return;

  if (TAG_MANAGER === 'gtm') {
    if (!GTM_ID) return;

    const dataLayer = ensureDataLayer();
    dataLayer.push({
      event: eventName,
      analytics: toFlag(state.analytics),
      ads: toFlag(state.ads),
      manager: 'gtm',
      gtmId: GTM_ID,
    });
    return;
  }

  if (TAG_MANAGER === 'zaraz') {
    window.dispatchEvent(
      new CustomEvent('gv:tag-consent', {
        detail: {
          event: eventName,
          analytics: toFlag(state.analytics),
          ads: toFlag(state.ads),
          manager: 'zaraz',
        },
      })
    );
  }
};

export const initTags = (consentState: ConsentState): void => {
  if (!canUseWindow()) return;

  ensureGoogleRuntime();
  googleConsentDefault();
  googleConsentUpdate(consentState);

  if (TAG_MANAGER === 'none') return;

  if (TAG_MANAGER === 'gtm') {
    if (!GTM_ID) return;
    if (isGtmInjectAllowed(consentState)) {
      injectGtm(GTM_ID);
    }
  }

  pushConsentEvent('consent_default', consentState);
};

export const updateTags = (consentState: ConsentState): void => {
  if (!canUseWindow()) return;

  ensureGoogleRuntime();
  googleConsentUpdate(consentState);

  if (TAG_MANAGER === 'none') return;

  if (TAG_MANAGER === 'gtm') {
    if (!GTM_ID) return;
    if (!window.__gvGtmInjected && isGtmInjectAllowed(consentState)) {
      injectGtm(GTM_ID);
    }
  }

  pushConsentEvent('consent_update', consentState);
};
