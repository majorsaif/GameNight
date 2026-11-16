import React from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { cn } from './cn';

/** On/off setting. The whole row is the tap target. */
export function Toggle({ label, description, checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center justify-between gap-4 rounded-control py-2 text-left disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block text-base font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-ink-faint">{description}</span>}
      </span>
      <span
        aria-hidden="true"
        className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150', checked ? 'bg-brand-600' : 'bg-line-strong')}
      >
        <span className={cn('absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform duration-150', checked && 'translate-x-5')} />
      </span>
    </button>
  );
}

/** Number setting with 44px minus and plus buttons. */
export function Stepper({ label, value, min = 1, max = 1, onChange, format = (v) => String(v) }) {
  const numeric = Number.isFinite(Number(value)) ? Math.round(Number(value)) : min;
  const current = Math.min(max, Math.max(min, numeric));
  const step = (delta) => {
    const next = Math.min(max, Math.max(min, current + delta));
    if (next !== current) onChange?.(next);
  };
  const stepButton = 'inline-flex h-tap w-tap items-center justify-center rounded-full border border-line bg-surface-raised text-ink transition-colors duration-150 hover:border-line-strong disabled:cursor-not-allowed disabled:text-ink-faint disabled:opacity-50';
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 py-2">
      <span className="text-base font-medium text-ink">{label}</span>
      <div className="flex items-center gap-1">
        <button type="button" className={stepButton} onClick={() => step(-1)} disabled={current <= min} aria-label={`Decrease ${label}`}>
          <Minus className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="tabular w-20 text-center text-lg font-semibold text-ink" aria-live="polite">{format(current)}</span>
        <button type="button" className={stepButton} onClick={() => step(1)} disabled={current >= max} aria-label={`Increase ${label}`}>
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * A list row you can pick (a player to vote for, a narrator, ...).
 * Shows a radio-style mark on the right when `selected`.
 */
export function SelectableRow({ selected = false, disabled = false, onClick, leading, title, subtitle, trailing, mark = true, className }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-16 w-full items-center gap-3 rounded-control border px-3 py-2 text-left transition-colors duration-150',
        selected ? 'border-brand-500 bg-brand-500/15' : 'border-line bg-surface',
        disabled ? 'cursor-not-allowed' : !selected && 'hover:border-line-strong',
        disabled && !selected && 'opacity-60',
        className
      )}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium text-ink">{title}</span>
        {subtitle && <span className="mt-0.5 block text-sm text-ink-faint">{subtitle}</span>}
      </span>
      {trailing}
      {mark && (
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
            selected ? 'border-brand-500 bg-brand-500 text-white' : 'border-line-strong text-transparent'
          )}
        >
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
