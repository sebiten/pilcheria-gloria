"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/actions/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const uuidSchema = z.string().uuid();

export async function getInventoryDashboard() {
  await requireAdmin();
  const supabase = getSupabaseAdmin();
  const { data: grandmaSource, error: sourceError } = await supabase
    .from("inventory_sources")
    .select("id, name")
    .eq("code", "grandma_store")
    .single();

  if (sourceError) throw sourceError;

  const paidStatuses = ["paid", "ready_for_pickup", "shipped", "delivered"];
  const [
    { data: ownOffers, error: ownOffersError },
    { data: paidItems, error: paidItemsError },
    { data: pendingItems, error: pendingItemsError },
    { data: ledgerEntries, error: ledgerError },
    { data: settlements, error: settlementsError },
  ] = await Promise.all([
    supabase
      .from("variant_offers")
      .select("stock_quantity, source:inventory_sources!inner(code)")
      .eq("active", true)
      .eq("availability_mode", "finite")
      .eq("source.code", "own"),
    supabase
      .from("order_items")
      .select(
        "source_code, quantity, net_amount, seller_share, partner_share, order:orders!inner(status)"
      )
      .in("order.status", paidStatuses),
    supabase
      .from("order_items")
      .select(
        "id, quantity, unit_price, net_amount, seller_share, partner_share, procurement_status, product:products(name), variant:product_variants(size, size_system, color), order:orders!inner(id, status, created_at)"
      )
      .eq("source_id", grandmaSource.id)
      .eq("procurement_status", "pending_collection")
      .order("created_at", { referencedTable: "orders", ascending: true }),
    supabase
      .from("partner_ledger_entries")
      .select("amount")
      .eq("source_id", grandmaSource.id)
      .is("settlement_id", null),
    supabase
      .from("partner_settlements")
      .select("id, total_amount, notes, paid_at")
      .eq("source_id", grandmaSource.id)
      .order("paid_at", { ascending: false })
      .limit(30),
  ]);

  const queryError =
    ownOffersError ||
    paidItemsError ||
    pendingItemsError ||
    ledgerError ||
    settlementsError;
  if (queryError) throw queryError;

  const ownStock = (ownOffers ?? []).reduce(
    (total, offer: any) => total + Number(offer.stock_quantity ?? 0),
    0
  );
  const ownSales = (paidItems ?? [])
    .filter((item: any) => item.source_code === "own")
    .reduce((total, item: any) => total + Number(item.net_amount ?? 0), 0);
  const commissionEarned = (paidItems ?? [])
    .filter((item: any) => item.source_code === "grandma_store")
    .reduce((total, item: any) => total + Number(item.seller_share ?? 0), 0);
  const partnerBalance = (ledgerEntries ?? []).reduce(
    (total, entry: any) => total + Number(entry.amount ?? 0),
    0
  );
  const settlementsPaid = (settlements ?? []).reduce(
    (total, settlement: any) =>
      total + Number(settlement.total_amount ?? 0),
    0
  );
  const pendingCollectionQuantity = (pendingItems ?? []).reduce(
    (total, item: any) => total + Number(item.quantity ?? 0),
    0
  );

  return {
    source: grandmaSource,
    metrics: {
      ownStock,
      ownSales,
      commissionEarned,
      partnerBalance,
      settlementsPaid,
      pendingCollectionQuantity,
    },
    pendingItems: pendingItems ?? [],
    settlements: settlements ?? [],
  };
}

export async function markOrderItemCollected(
  orderItemId: string,
  _formData?: FormData
) {
  await requireAdmin();
  const parsedId = uuidSchema.parse(orderItemId);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.rpc("mark_order_item_collected", {
    p_order_item_id: parsedId,
  });

  if (error) throw error;
  revalidatePath("/dashboard/finance");
  revalidatePath("/dashboard/orders");
}

export async function createGrandmaSettlement(formData: FormData) {
  await requireAdmin();
  const notes = z
    .string()
    .trim()
    .max(500)
    .optional()
    .parse(formData.get("notes")?.toString() || undefined);
  const supabase = getSupabaseAdmin();
  const { data: source, error: sourceError } = await supabase
    .from("inventory_sources")
    .select("id")
    .eq("code", "grandma_store")
    .single();

  if (sourceError) throw sourceError;
  const { error } = await supabase.rpc("create_partner_settlement", {
    p_source_id: source.id,
    p_notes: notes ?? null,
  });

  if (error) throw error;
  revalidatePath("/dashboard/finance");
}
