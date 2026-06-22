import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle,
  WarningCircle,
  CircleNotch,
  Info,
  X,
} from "@phosphor-icons/react";

export type ToastKind = "pending" | "success" | "error" | "info";

export type Toast = {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
};

type ToastContextValue = {
  push: (t: Omit<Toast, "id">) => number;
  update: (id: number, t: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

const ICON: Record<ToastKind, ReactNode> = {
  pending: <CircleNotch size={18} className="animate-spin text-ember-400" />,
  success: <CheckCircle size={18} weight="fill" className="text-emerald-400" />,
  error: <WarningCircle size={18} weight="fill" className="text-red-400" />,
  info: <Info size={18} weight="fill" className="text-cyber-400" />,
};

const ACCENT: Record<ToastKind, string> = {
  pending: "border-ember-500/30",
  success: "border-emerald-500/30",
  error: "border-red-500/30",
  info: "border-cyber-500/30",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { ...t, id }]);
      if (t.kind === "success" || t.kind === "info") {
        setTimeout(() => dismiss(id), 5000);
      }
      return id;
    },
    [dismiss]
  );

  const update = useCallback(
    (id: number, patch: Partial<Omit<Toast, "id">>) => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
      );
      if (patch.kind === "success" || patch.kind === "error") {
        setTimeout(() => dismiss(id), 6000);
      }
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ push, update, dismiss }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex w-[min(92vw,360px)] flex-col gap-2.5">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className={`glass flex items-start gap-3 border ${ACCENT[t.kind]} p-3.5`}
            >
              <div className="mt-0.5 shrink-0">{ICON[t.kind]}</div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold text-zinc-100">
                  {t.title}
                </p>
                {t.message && (
                  <p className="mt-0.5 break-words text-xs text-zinc-400">
                    {t.message}
                  </p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-zinc-600 transition-colors hover:text-zinc-300"
              >
                <X size={14} weight="bold" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("ToastProvider is required.");
  return ctx;
}
