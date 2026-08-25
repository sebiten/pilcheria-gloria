"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, BellRing, CheckCheck, Smartphone, ShoppingBag } from "lucide-react";
import {
  getAdminPushPublicKey,
  getAdminSaleNotifications,
  markAdminSaleNotificationRead,
  markAllAdminSaleNotificationsRead,
  removeAdminPushSubscription,
  saveAdminPushSubscription,
  type AdminNotificationState,
} from "@/actions/admin-notifications";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

function PushNotificationSetup() {
  const [status, setStatus] = useState<
    "checking" | "unsupported" | "needs-install" | "available" | "enabled" | "denied" | "error"
  >("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const check = async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setStatus("unsupported");
        return;
      }

      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
      if (isIOS && !isStandalone) {
        setStatus("needs-install");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) setStatus("enabled");
        else if (Notification.permission === "denied") setStatus("denied");
        else setStatus("available");
      } catch {
        setStatus("error");
      }
    };
    void check();
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }
      const publicKey = await getAdminPushPublicKey();
      if (!publicKey) throw new Error("Las claves push todavía no están configuradas");
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      const serialized = subscription.toJSON();
      if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
        throw new Error("La suscripción push está incompleta");
      }
      await saveAdminPushSubscription({
        endpoint: serialized.endpoint,
        keys: { p256dh: serialized.keys.p256dh, auth: serialized.keys.auth },
      });
      setStatus("enabled");
    } catch (error) {
      console.error(error);
      setStatus("error");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removeAdminPushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("available");
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  };

  if (status === "checking") return null;

  return (
    <div className="border-t bg-muted/35 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
          {status === "enabled" ? <BellRing className="size-4" /> : <Smartphone className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">
            {status === "enabled" ? "Avisos activados en este celular" : "Avisos en el celular"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {status === "needs-install"
              ? "En iPhone: Compartir → Agregar a inicio. Después abrí Gloria desde su ícono y activalos acá."
              : status === "denied"
                ? "Los avisos están bloqueados. Habilitalos desde la configuración de notificaciones del celular."
                : status === "unsupported"
                  ? "Este navegador no admite notificaciones push. Probá desde Chrome o agregá la web al inicio en iPhone."
                  : status === "error"
                    ? "No pudimos configurar los avisos. Revisá la conexión e intentá nuevamente."
                    : status === "enabled"
                      ? "Te avisaremos cuando Mercado Pago apruebe una venta."
                      : "Recibí una notificación aunque el panel esté cerrado."}
          </p>
          {status === "available" || status === "error" ? (
            <Button type="button" size="sm" className="mt-3 min-h-10" disabled={busy} onClick={enable}>
              {busy ? "Activando…" : "Activar avisos"}
            </Button>
          ) : null}
          {status === "enabled" ? (
            <button
              type="button"
              className="mt-2 min-h-10 text-xs font-bold text-muted-foreground hover:text-foreground hover:underline"
              disabled={busy}
              onClick={disable}
            >
              Desactivar en este dispositivo
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AdminNotificationCenter({ initialState }: { initialState: AdminNotificationState }) {
  const [state, setState] = useState(initialState);
  const [open, setOpen] = useState(false);
  const [showSaleToast, setShowSaleToast] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const unreadRef = useRef(initialState.unreadCount);

  useEffect(() => {
    const refresh = async () => {
      try {
        const nextState = await getAdminSaleNotifications();
        if (nextState.unreadCount > unreadRef.current) {
          setShowSaleToast(true);
          window.setTimeout(() => setShowSaleToast(false), 6000);
        }
        unreadRef.current = nextState.unreadCount;
        setState(nextState);
      } catch {
        // Conserva el último estado válido si se interrumpe la conexión.
      }
    };

    const interval = window.setInterval(refresh, 20_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const markOneRead = (id: string) => {
    const target = state.notifications.find((item) => item.id === id);
    if (!target || target.read) return;
    setState((current) => ({
      unreadCount: Math.max(0, current.unreadCount - 1),
      notifications: current.notifications.map((item) =>
        item.id === id ? { ...item, read: true } : item
      ),
    }));
    unreadRef.current = Math.max(0, unreadRef.current - 1);
    void markAdminSaleNotificationRead(id);
  };

  const markAllRead = () => {
    setState((current) => ({
      unreadCount: 0,
      notifications: current.notifications.map((item) => ({ ...item, read: true })),
    }));
    unreadRef.current = 0;
    void markAllAdminSaleNotificationsRead();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="relative inline-flex size-11 items-center justify-center rounded-xl border bg-background text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={state.unreadCount ? `${state.unreadCount} alertas nuevas` : "Alertas de pagos y ventas"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell className="size-5" />
        {state.unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.65rem] font-black leading-5 text-primary-foreground ring-2 ring-card">
            {state.unreadCount > 99 ? "99+" : state.unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <section className="fixed inset-x-3 top-[4.5rem] z-[70] overflow-hidden rounded-2xl border bg-card shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[23rem] lg:left-0 lg:right-auto">
          <div className="flex min-h-14 items-center justify-between gap-3 border-b px-4">
            <div>
              <h2 className="font-bold">Pagos y ventas</h2>
              <p className="text-xs text-muted-foreground">
                {state.unreadCount ? `${state.unreadCount} sin revisar` : "Todo revisado"}
              </p>
            </div>
            {state.unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CheckCheck className="size-4" />
                Marcar vistas
              </button>
            ) : null}
          </div>

          <div className="max-h-[min(60vh,28rem)] overflow-y-auto">
            {state.notifications.length ? state.notifications.map((notification) => (
              <Link
                key={notification.id}
                href={`/dashboard/orders/${notification.orderId}`}
                onClick={() => {
                  markOneRead(notification.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex min-h-20 gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  !notification.read && "bg-primary/7"
                )}
              >
                <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                  {notification.eventKey === "sale_paid" ? (
                    <ShoppingBag className="size-5" />
                  ) : (
                    <AlertTriangle className="size-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="truncate text-sm font-bold">
                      {notification.eventKey === "late_approved"
                        ? `Pago tardío de ${notification.customerName}`
                        : notification.eventKey === "bank_transfer_review_overdue"
                          ? `Transferencia vencida de ${notification.customerName}`
                          : notification.eventKey === "bank_transfer_review_expired"
                            ? `Stock liberado: ${notification.customerName}`
                        : notification.eventKey === "payment_persistence_failure"
                          ? `Pago requiere conciliación`
                          : `Nueva venta de ${notification.customerName}`}
                    </span>
                    {!notification.read ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" /> : null}
                  </span>
                  <span className="mt-0.5 block text-sm">{notification.totalLabel} · Pedido {notification.orderCode}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{notification.createdLabel}</span>
                </span>
              </Link>
            )) : (
              <div className="px-6 py-10 text-center">
                <ShoppingBag className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 font-bold">Todavía no hay ventas nuevas</p>
                <p className="mt-1 text-sm text-muted-foreground">Los pagos aprobados aparecerán acá.</p>
              </div>
            )}
          </div>
          <PushNotificationSetup />
        </section>
      ) : null}

      <div
        role="status"
        aria-live="polite"
        className={cn(
          "fixed right-4 top-20 z-[80] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-2xl transition duration-300",
          showSaleToast ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0"
        )}
      >
        <ShoppingBag className="size-5" />
        <div>
          <p className="text-sm font-black">Nueva venta recibida</p>
          <p className="text-xs opacity-85">Revisala desde la campana.</p>
        </div>
      </div>
    </div>
  );
}
