import { BellRing, X } from "lucide-react";
import type { Toast } from "../hooks/useAlerts";
import { useI18n } from "../i18n/context";

/** Notification cards at the top of the page - they work on every device, even without pop-up permission. */
export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const { t } = useI18n();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={toast.sticky ? "toast is-serious" : "toast"}>
          <BellRing size={18} aria-hidden="true" />
          <div className="toast-text">
            <strong>{toast.title}</strong>
            <p>{toast.body}</p>
          </div>
          <button
            type="button"
            className="icon-btn is-quiet"
            onClick={() => onDismiss(toast.id)}
            aria-label={t("close")}
            title={t("close")}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
