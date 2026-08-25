"use client";

import { useRef, useState } from "react";
import { Check, Copy, Landmark, LoaderCircle, MessageCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import type { BankTransferDetails } from "@/types";

export function BankTransferPanel({
  orderId,
  total,
  details,
  notified,
}: {
  orderId: string;
  total: number;
  details: BankTransferDetails;
  notified: boolean;
}) {
  const requestId = useRef(crypto.randomUUID());
  const [copied, setCopied] = useState("");
  const [isReporting, setIsReporting] = useState(false);
  const [error, setError] = useState("");
  const orderCode = orderId.slice(0, 8).toUpperCase();

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1800);
  };

  const reportTransfer = async () => {
    setIsReporting(true);
    setError("");
    try {
      const response = await fetch(
        `/api/order-confirmation/${encodeURIComponent(orderId)}/bank-transfer/report`,
        { method: "POST", headers: { "Idempotency-Key": requestId.current } }
      );
      const data = await response.json();
      if (!response.ok || !data.whatsappUrl) {
        throw new Error(data.error || "No se pudo informar la transferencia.");
      }
      window.location.assign(data.whatsappUrl);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "No se pudo continuar.");
      setIsReporting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-14">
      <section className="rounded-3xl border border-gloria-200 bg-card p-5 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gloria-100 text-gloria-800">
            <Landmark className="size-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-gloria-700">Pedido {orderCode}</p>
            <h1 className="mt-1 text-2xl font-black text-gloria-950">
              {notified ? "Transferencia en revisión" : "Datos para transferir"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {notified
                ? "Recibimos tu aviso. Verificaremos la acreditación en la cuenta antes de confirmar el pago."
                : "Transferí el total exacto y luego avisá desde este pedido."}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-gloria-950 p-5 text-white">
          <span className="text-xs font-bold uppercase tracking-wider text-gloria-200">Total exacto</span>
          <p className="mt-1 text-3xl font-black">{formatPrice(total)}</p>
        </div>

        <dl className="mt-5 divide-y rounded-2xl border">
          <TransferRow label="Titular" value={details.holder} copied={copied} onCopy={copy} />
          <TransferRow label="Alias" value={details.alias} copied={copied} onCopy={copy} />
          {details.institution ? <TransferRow label="Banco o billetera" value={details.institution} copied={copied} onCopy={copy} /> : null}
          {details.accountNumber ? <TransferRow label="CBU / CVU" value={details.accountNumber} copied={copied} onCopy={copy} /> : null}
          <TransferRow label="Código" value={orderCode} copied={copied} onCopy={copy} />
        </dl>

        <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <p className="flex items-center gap-2 font-black"><ShieldAlert className="size-5" /> Evitá fraudes</p>
          <p className="mt-1">Verificá que el titular coincida y usá únicamente los datos mostrados dentro de este pedido.</p>
        </div>

        {!notified ? (
          <div className="mt-5">
            <p className="mb-3 text-sm leading-6 text-gloria-900">
              Te atiende la persona encargada del local para confirmar tu compra
              y coordinar el retiro o envío.
            </p>
            <Button
              className="min-h-12 w-full bg-[#25d366] font-black text-[#123d22] hover:bg-[#20c45d]"
              onClick={reportTransfer}
              disabled={isReporting}
            >
              {isReporting ? <LoaderCircle className="size-4 animate-spin" /> : <MessageCircle className="size-5" />}
              {isReporting ? "Abriendo WhatsApp…" : "Hablar con el local por WhatsApp"}
            </Button>
          </div>
        ) : null}
        {error ? <p className="mt-3 text-sm font-semibold text-red-700" role="alert">{error}</p> : null}

      </section>
    </main>
  );
}

function TransferRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: string;
  onCopy: (label: string, value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="mt-1 break-all font-bold text-gloria-950">{value}</dd>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => onCopy(label, value)} aria-label={`Copiar ${label}`}>
        {copied === label ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}
