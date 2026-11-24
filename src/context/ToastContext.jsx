import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container (fixed top-center / top-right, mobile-friendly) */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-auto sm:right-4 z-50 flex flex-col gap-2 w-11/12 sm:w-80 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-xl shadow-lg border text-sm font-medium transition-all duration-200 animate-in fade-in slide-in-from-top-2 ${
              toast.type === 'error'
                ? 'bg-red-950/95 text-red-200 border-red-800'
                : toast.type === 'success'
                ? 'bg-emerald-950/95 text-emerald-200 border-emerald-800'
                : toast.type === 'warning'
                ? 'bg-amber-950/95 text-amber-200 border-amber-800'
                : 'bg-charcoal/95 text-white border-gold/40'
            }`}
          >
            <span className="flex-1 mr-2 break-words">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-white/60 hover:text-white p-1 shrink-0"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
