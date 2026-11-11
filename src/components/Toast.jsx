import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

const TONE_CLASSES = {
  info: 'bg-slate-900/95 border-slate-700 text-slate-100',
  success: 'bg-emerald-900/95 border-emerald-700 text-emerald-50',
  error: 'bg-red-900/95 border-red-700 text-red-50'
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
        className="fixed top-4 inset-x-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            onClick={() => dismiss(toast.id)}
            className={`pointer-events-auto max-w-sm w-full text-left px-4 py-3 rounded-xl border shadow-2xl text-sm font-semibold animate-fade-in ${TONE_CLASSES[toast.tone] || TONE_CLASSES.info}`}
          >
            {toast.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
