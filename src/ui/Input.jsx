import React, { forwardRef, useId } from 'react';
import { cn } from './cn';

export const inputClass =
  'h-12 w-full rounded-control border border-line bg-surface-sunken px-4 text-base text-ink placeholder:text-ink-faint transition-colors duration-150 hover:border-line-strong focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus-visible:outline-none';

/** Text input, always 16px so iOS doesn't zoom the page on focus. */
export const Input = forwardRef(function Input({ label, hint, error, className, id, ...rest }, ref) {
  const autoId = useId();
  const inputId = id || autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-ink-muted">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(inputClass, error && 'border-danger', className)}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-2 text-sm text-danger">{error}</p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-2 text-sm text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
});
