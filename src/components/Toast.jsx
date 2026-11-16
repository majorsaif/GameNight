import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';

const ToastContext = createContext(null);

const TONES = {
  info: { icon: Info, className: 'text-brand-300' },
  success: { icon: CircleCheck, className: 'text-success' },
  error: { icon: CircleAlert, className: 'text-danger' }
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message, tone = 'info', durationMs = 3200) => {
    idRef.current += 1;
    const id = idRef.current;
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);
    setTimeout(() => dismiss(id), durationMs);
  }, [dismiss]);

  const api = useMemo(() => ({
    show,
    info: (m, d) => show(m, 'info', d),
    success: (m, d) => show(m, 'success', d),
    error: (m, d) => show(m, 'error', d ?? 4500)
  }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-gutter pt-safe"
        role="status"
        aria-live="polite"
      >
        <div className="h-3 shrink-0" aria-hidden="true" />
        {toasts.map((toast) => {
          const tone = TONES[toast.tone] || TONES.info;
          const Icon = tone.icon;
          return (
            <button
              key={toast.id}
              type="button"
              onClick={() => dismiss(toast.id)}
              className="pointer-events-auto flex w-full max-w-sm animate-enter items-center gap-3 rounded-control border border-line-strong bg-surface-raised px-4 py-3 text-left shadow-pop"
            >
              <Icon className={`h-5 w-5 shrink-0 ${tone.className}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 text-sm font-medium text-ink">{toast.message}</span>
            </button>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
