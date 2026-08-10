"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function CartDrawer({ isOpen, onClose, children }: CartDrawerProps) {
  const drawerRef = React.useRef<HTMLDivElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const onCloseRef = React.useRef(onClose);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        event.preventDefault();
        drawerRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div
        ref={drawerRef}
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-full max-w-md bg-background shadow-xl transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        aria-labelledby="cart-drawer-title"
        aria-hidden={!isOpen}
        role="dialog"
        aria-modal="true"
        inert={!isOpen}
        tabIndex={-1}
        data-testid="cart-drawer"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b p-4">
            <h2 id="cart-drawer-title" className="text-xl font-bold">
              Tu carrito
            </h2>
            <Button
              ref={closeButtonRef}
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11"
              onClick={onClose}
              aria-label="Cerrar carrito"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{isOpen ? children : null}</div>
        </div>
      </div>
    </>
  );
}
