import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function Dialog({
  titleId,
  onClose,
  children,
  destructive = false,
}: {
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  destructive?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const node = ref.current!;
    if (!previousFocus.current)
      previousFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    const previous = previousFocus.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    node
      .querySelector<HTMLElement>(
        "[data-initial-focus],input:not([disabled]),textarea:not([disabled])",
      )
      ?.focus();
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      aria-modal="true"
      role={destructive ? "alertdialog" : "dialog"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const items = Array.from(
          ref.current!.querySelectorAll<HTMLElement>(
            "a[href],button,input,textarea,select,summary,[tabindex]",
          ),
        ).filter(
          (el) =>
            el.tabIndex >= 0 &&
            !el.matches(":disabled") &&
            el.getClientRects().length > 0,
        );
        const first = items[0],
          last = items.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
    >
      <button
        className="close icon"
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
      >
        <X aria-hidden="true" />
      </button>
      {children}
    </dialog>,
    document.body,
  );
}
