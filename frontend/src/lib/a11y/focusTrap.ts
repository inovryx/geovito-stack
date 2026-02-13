const FOCUSABLE_SELECTOR =
  'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

const isVisible = (element: HTMLElement) => {
  if (element.hasAttribute('hidden')) return false;
  const styles = window.getComputedStyle(element);
  if (styles.display === 'none' || styles.visibility === 'hidden') return false;
  return element.offsetParent !== null || styles.position === 'fixed';
};

const getFocusable = (container: HTMLElement) => {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
};

interface FocusTrapOptions {
  onEscape?: () => void;
  initialFocusEl?: HTMLElement | null;
}

export const createFocusTrap = (containerEl: HTMLElement, options: FocusTrapOptions = {}) => {
  const { onEscape, initialFocusEl = null } = options;

  const focusFirst = () => {
    const focusable = getFocusable(containerEl);
    const next = initialFocusEl && isVisible(initialFocusEl) ? initialFocusEl : focusable[0] || containerEl;
    next.focus();
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onEscape?.();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = getFocusable(containerEl);
    if (!focusable.length) {
      event.preventDefault();
      containerEl.focus();
      return;
    }

    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const currentIndex = active ? focusable.indexOf(active) : -1;

    if (event.shiftKey) {
      if (currentIndex <= 0) {
        event.preventDefault();
        focusable[focusable.length - 1]?.focus();
      }
      return;
    }

    if (currentIndex === -1 || currentIndex >= focusable.length - 1) {
      event.preventDefault();
      focusable[0]?.focus();
    }
  };

  const handleFocusIn = (event: FocusEvent) => {
    if (containerEl.contains(event.target as Node)) return;
    const focusable = getFocusable(containerEl);
    (focusable[0] || containerEl).focus();
  };

  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('focusin', handleFocusIn);
  queueMicrotask(focusFirst);

  return () => {
    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('focusin', handleFocusIn);
  };
};
