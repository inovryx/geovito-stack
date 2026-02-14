import { captureException } from './sentry';

type BoundaryOptions = {
  fallbackSelector?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

export const runWithClientBoundary = (name: string, run: () => void, options: BoundaryOptions = {}) => {
  try {
    run();
  } catch (error) {
    captureException(error, {
      tags: {
        source: 'client_boundary',
        boundary: name,
        ...(options.tags || {}),
      },
      extra: {
        ...(options.extra || {}),
      },
    });

    if (!options.fallbackSelector) return;
    const fallback = document.querySelector(options.fallbackSelector);
    if (fallback instanceof HTMLElement) {
      fallback.hidden = false;
      fallback.removeAttribute('aria-hidden');
    }
  }
};

