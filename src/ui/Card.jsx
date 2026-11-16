import React from 'react';
import { cn } from './cn';

const PADDING = { none: '', sm: 'p-4', md: 'p-5' };

export function Card({ as: Component = 'div', padding = 'md', className, children, ...rest }) {
  return (
    <Component className={cn('rounded-card border border-line bg-surface', PADDING[padding], className)} {...rest}>
      {children}
    </Component>
  );
}

/** Small heading for a section of a screen, with an optional action on the right. */
export function SectionHeading({ children, count = null, action = null, className }) {
  return (
    <div className={cn('flex min-h-tap items-center justify-between gap-3', className)}>
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        {children}
        {count != null && (
          <span className="tabular rounded-full bg-surface-raised px-2 py-0.5 text-xs font-semibold text-ink-muted">{count}</span>
        )}
      </h2>
      {action}
    </div>
  );
}
