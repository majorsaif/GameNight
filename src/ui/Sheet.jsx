import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './cn';
import { Button, IconButton } from './Button';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let openSheets = 0;

/**
 * The one modal. A bottom sheet on phones, a centred dialog from tablet up.
 * Traps focus, closes on Escape or a backdrop tap, and locks page scroll.
 */
export function Sheet({ open, onClose, title, description, children, footer, dismissible = true }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    openSheets += 1;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    // Focus the panel itself so the keyboard doesn't pop open on phones
    panel?.focus({ preventScroll: true });

    const onKeyDown = (event) => {
      // Only the top-most sheet reacts
      const sheets = document.querySelectorAll('[data-sheet-panel]');
      if (sheets[sheets.length - 1] !== panel) return;
      if (event.key === 'Escape' && dismissible) {
        event.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openSheets -= 1;
      if (openSheets <= 0) {
        openSheets = 0;
        document.body.style.overflow = '';
      }
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open, dismissible]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div
        className="absolute inset-0 animate-fade bg-black/70"
        onClick={dismissible ? () => onClose?.() : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        data-sheet-panel
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col border border-line bg-surface shadow-pop focus-visible:outline-none',
          'animate-sheet-up rounded-t-sheet border-b-0',
          'md:max-h-[86dvh] md:max-w-md md:animate-pop md:rounded-sheet md:border-b'
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong md:hidden" aria-hidden="true" />
        <header className="flex shrink-0 items-start justify-between gap-3 px-gutter pb-3 pt-3 md:pt-5">
          <div className="min-w-0 pt-2">
            <h2 id={titleId} className="text-xl font-semibold text-ink">{title}</h2>
            {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          </div>
          {dismissible && <IconButton icon={X} label="Close" onClick={() => onClose?.()} />}
        </header>
        <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-gutter', footer ? 'pb-4' : 'pb-safe md:pb-5')}>
          {children}
        </div>
        {footer && <div className="shrink-0 border-t border-line px-gutter pb-safe pt-4 md:pb-5">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/** Yes/no question, built on Sheet so every dialog in the app matches. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel
}) {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      footer={(
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} className="flex-1" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      )}
    >
      {message && <p className="text-base text-ink-muted">{message}</p>}
    </Sheet>
  );
}
