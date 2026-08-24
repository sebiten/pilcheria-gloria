"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/actions/auth";
import { sendMetaPurchaseEvent } from "@/lib/meta/conversions";
import { sendAdminSalePush } from "@/lib/notifications/admin-push";
import { sendOrderEmail } from "@/lib/notifications/email";
import { getBankTransferSettings } from "@/lib/payments/bank-transfer";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const settingsSchema = z
  .object({
    enabled: z.boolean(),
    accountAlias: z.string().trim().max(120),
    accountHolder: z.string().trim().max(160),
    institutionName: z.string().trim().max(160).optional(),
    accountNumber: z.string().trim().max(64).optional(),
  })
  .refine(
    (value) => !value.enabled || (value.accountAlias.length > 0 && value.accountHolder.length > 0),
    { message: "Completá alias y titular antes de activar la transferencia." }
  );

const uuidSchema = z.string().uuid();

export { getBankTransferSettings };

export async function updateBankTransferSettings(input: z.infer<typeof settingsSchema>) {
  await requireAdmin();
  const payload = settingsSchema.parse(input);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("bank_transfer_settings").upsert(
    {
      id: 1,
      enabled: payload.enabled,
      account_alias: payload.accountAlias,
      account_holder: payload.accountHolder,
      institution_name: payload.institutionName || null,
      account_number: payload.accountNumber || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) throw error;
  revalidatePath("/checkout");
  revalidatePath("/dashboard/settings");
}

export async function approveBankTransfer(
  orderId: string,
  attemptId: string,
  formData: FormData
) {
  await requireAdmin();
  const { userId } = await auth();
  if (!userId) throw new Error("Administrador no autenticado");
  const reference = z.string().trim().max(200).optional().parse(
    formData.get("bankReference")?.toString() || undefined
  );
  const supabase = getSupabaseAdmin();
  const { data: changed, error } = await supabase.rpc("approve_bank_transfer", {
    p_order_id: uuidSchema.parse(orderId),
    p_attempt_id: uuidSchema.parse(attemptId),
    p_reviewed_by: userId,
    p_bank_reference: reference || null,
  });
  if (error) throw new Error(error.message);
  if (changed) {
    await Promise.allSettled([
      sendOrderEmail(orderId, "payment-approved"),
      sendAdminSalePush(orderId),
      sendMetaPurchaseEvent(orderId),
    ]);
  }
  revalidateOrder(orderId);
}

export async function rejectBankTransfer(orderId: string, attemptId: string) {
  await requireAdmin();
  const supabase = getSupabaseAdmin();
  const { data: changed, error } = await supabase.rpc("reject_bank_transfer", {
    p_order_id: uuidSchema.parse(orderId),
    p_attempt_id: uuidSchema.parse(attemptId),
    p_reason: "Transferencia no recibida",
  });
  if (error) throw new Error(error.message);
  if (changed) await sendOrderEmail(orderId, "cancelled").catch(console.error);
  revalidateOrder(orderId);
}

function revalidateOrder(orderId: string) {
  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath(`/order-confirmation/${orderId}`);
  revalidatePath("/account/orders");
}
