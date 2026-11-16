import React from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from './cn';

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-700',
  secondary: 'bg-surface-raised text-ink border border-line hover:border-line-strong active:bg-surface',
  ghost: 'text-ink-muted hover:bg-surface-raised hover:text-ink',
  danger: 'bg-danger-strong text-white hover:bg-red-700 active:bg-red-700',
  'danger-quiet': 'bg-surface-raised text-danger border border-line hover:border-danger'
};

const SIZES = {
  sm: 'h-11 px-4 text-sm',
  md: 'h-12 px-5 text-base',
  lg: 'h-14 px-6 text-lg'
};

/**
 * The one button. Variants change colour only; shape, height and type are
 * shared so buttons look the same on every screen.
 */
export function Button({
  as: Component = 'button',
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  disabled = false,
  icon: Icon = null,
  className,
  children,
  ...rest
}) {
  const isButton = Component === 'button';
  const inactive = disabled || loading;
  return (
    <Component
      {...(isButton ? { type: 'button', disabled: inactive } : {})}
      aria-busy={loading || undefined}
      aria-disabled={!isButton && inactive ? true : undefined}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-control font-semibold transition-colors duration-150',
        SIZES[size],
        inactive
          ? 'cursor-not-allowed border border-transparent bg-surface-raised text-ink-faint'
          : VARIANTS[variant],
        block && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? (
        <LoaderCircle className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true" />
      ) : Icon ? (
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      ) : null}
      <span className="truncate">{children}</span>
    </Component>
  );
}

/** Round 44px icon-only button. `label` is required for screen readers. */
export function IconButton({ icon: Icon, label, tone = 'default', className, ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-tap w-tap shrink-0 items-center justify-center rounded-full border border-line bg-surface-raised transition-colors duration-150 hover:border-line-strong',
        tone === 'danger' ? 'text-ink-muted hover:text-danger' : 'text-ink-muted hover:text-ink',
        className
      )}
      {...rest}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
