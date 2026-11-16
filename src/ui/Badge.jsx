import React from 'react';
import { cn } from './cn';

const TONES = {
  neutral: 'bg-surface-raised text-ink-muted',
  brand: 'bg-brand-500/15 text-brand-300',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  mafia: 'bg-mafia/15 text-mafia',
  imposter: 'bg-imposter/15 text-imposter',
  spyfall: 'bg-spyfall/15 text-spyfall'
};

export function Badge({ tone = 'neutral', icon: Icon = null, className, children }) {
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-semibold', TONES[tone], className)}>
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      {children}
    </span>
  );
}
