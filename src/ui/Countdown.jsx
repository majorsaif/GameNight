import React from 'react';
import { cn } from './cn';

export function formatClock(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

const SIZES = {
  md: 'text-2xl',
  lg: 'text-display',
  xl: 'text-timer'
};

/**
 * Countdown clock, big enough to read at arm's length. Turns amber for the
 * last `warnAt` seconds and red at zero.
 */
export function Countdown({ seconds, label = 'Time left', size = 'xl', warnAt = 10, className }) {
  if (seconds == null) return null;
  const tone = seconds <= 0 ? 'text-danger' : seconds <= warnAt ? 'text-warning' : 'text-ink';
  return (
    <div className={cn('text-center', className)} role="timer" aria-label={`${label}: ${formatClock(seconds)}`}>
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <p className={cn('tabular font-bold', SIZES[size], tone)}>{formatClock(seconds)}</p>
    </div>
  );
}
