import React, { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './Button';

const WIDTHS = {
  column: 'max-w-column',
  wide: 'max-w-column md:max-w-wide'
};

const FooterSlotContext = createContext(null);

/**
 * Page frame used by every screen: full dynamic-viewport height, safe-area
 * padding, a centred column, and an action bar pinned to the bottom so the
 * main action stays in thumb reach. Fill the bar with the `footer` prop or by
 * rendering <ScreenFooter> anywhere inside the screen.
 */
export function Screen({ header = null, footer = null, width = 'column', center = false, tone = 'default', className, children }) {
  const [footerSlot, setFooterSlot] = useState(null);
  const night = tone === 'night';
  return (
    <FooterSlotContext.Provider value={footerSlot}>
      <div className={cn('flex min-h-dvh flex-col text-ink transition-colors duration-300', night ? 'bg-black' : 'bg-bg')}>
        {header}
        <main
          className={cn(
            'mx-auto flex w-full flex-1 flex-col px-safe pb-6',
            !header && 'pt-safe',
            WIDTHS[width],
            center && 'justify-center',
            className
          )}
        >
          {children}
        </main>
        <div
          ref={setFooterSlot}
          className={cn('sticky bottom-0 z-20 border-t border-line empty:hidden', night ? 'bg-black' : 'bg-bg')}
        />
        {footer && <ScreenFooter>{footer}</ScreenFooter>}
      </div>
    </FooterSlotContext.Provider>
  );
}

/** Puts its children in the enclosing Screen's pinned bottom action bar. */
export function ScreenFooter({ children }) {
  const slot = useContext(FooterSlotContext);
  if (!slot) return null;
  return createPortal(
    <div className="mx-auto flex w-full max-w-column flex-col gap-3 px-safe pb-safe pt-4">{children}</div>,
    slot
  );
}

/** Sticky top bar: back on the left, title in the middle, one action on the right. */
export function ScreenHeader({ title, subtitle = null, onBack = null, backLabel = 'Back', action = null, width = 'column', leading = null }) {
  return (
    <header className="sticky top-0 z-30 bg-bg/95 pt-safe backdrop-blur">
      <div className={cn('mx-auto flex h-16 w-full items-center gap-3 px-safe', WIDTHS[width])}>
        <div className="flex min-w-tap justify-start">
          {onBack ? <IconButton icon={ArrowLeft} label={backLabel} onClick={onBack} /> : leading}
        </div>
        <div className="min-w-0 flex-1 text-center">
          {title && <h1 className="truncate text-lg font-semibold text-ink">{title}</h1>}
          {subtitle && <p className="truncate text-xs text-ink-faint">{subtitle}</p>}
        </div>
        <div className="flex min-w-tap justify-end">{action}</div>
      </div>
    </header>
  );
}

export function Spinner({ className }) {
  return <LoaderCircle className={cn('animate-spin text-brand-400', className)} aria-hidden="true" />;
}

/** Full-screen loading state. */
export function LoadingScreen({ label = 'Loading' }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-gutter text-center" role="status">
      <Spinner className="h-9 w-9" />
      <p className="text-base text-ink-muted">{label}</p>
    </div>
  );
}

/** Full-screen message for errors, dead ends and "nothing here" states. */
export function StatusScreen({ icon: Icon, tone = 'neutral', title, message, children }) {
  const iconTone = tone === 'danger' ? 'bg-danger/15 text-danger' : 'bg-surface-raised text-brand-300';
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-gutter py-10 text-center">
      <div className="flex w-full max-w-sm animate-enter flex-col items-center">
        {Icon && (
          <span className={cn('mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full', iconTone)}>
            <Icon className="h-8 w-8" aria-hidden="true" />
          </span>
        )}
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {message && <p className="mt-2 text-base text-ink-muted">{message}</p>}
        {children && <div className="mt-6 flex w-full flex-col gap-3">{children}</div>}
      </div>
    </div>
  );
}

/** Inline placeholder for an empty list or a "waiting" moment inside a screen. */
export function EmptyState({ icon: Icon, title, message, children, className }) {
  return (
    <div className={cn('flex flex-col items-center rounded-card border border-dashed border-line px-5 py-8 text-center', className)}>
      {Icon && <Icon className="mb-3 h-7 w-7 text-ink-faint" aria-hidden="true" />}
      <p className="text-base font-medium text-ink">{title}</p>
      {message && <p className="mt-1 text-sm text-ink-muted">{message}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** Inline notice (connection problem, "you were eliminated", ...). */
export function Notice({ icon: Icon, tone = 'neutral', children, className }) {
  const tones = {
    neutral: 'border-line bg-surface text-ink-muted',
    brand: 'border-brand-500/40 bg-brand-500/10 text-brand-300',
    danger: 'border-danger/40 bg-danger/10 text-danger',
    warning: 'border-warning/40 bg-warning/10 text-warning',
    success: 'border-success/40 bg-success/10 text-success'
  };
  return (
    <div className={cn('flex items-center gap-3 rounded-control border px-4 py-3 text-sm font-medium', tones[tone], className)}>
      {Icon && <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />}
      <p className="min-w-0 flex-1 text-left">{children}</p>
    </div>
  );
}
