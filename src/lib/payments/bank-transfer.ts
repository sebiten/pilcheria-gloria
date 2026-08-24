import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { BankTransferDetails, BankTransferSettings } from "@/types";
import { isValidArgentinaContactPhone } from "@/lib/contact";

const EMPTY_SETTINGS: BankTransferSettings = {
  enabled: false,
  account_alias: "",
  account_holder: "",
  institution_name: null,
  account_number: null,
};

export async function getBankTransferSettings(): Promise<BankTransferSettings> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("bank_transfer_settings")
    .select("enabled, account_alias, account_holder, institution_name, account_number")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") return EMPTY_SETTINGS;
    throw error;
  }
  return data || EMPTY_SETTINGS;
}

export async function isBankTransferEnabled() {
  const supabase = getSupabaseAdmin();
  const [{ data: bank }, { data: store }] = await Promise.all([
    supabase
      .from("bank_transfer_settings")
      .select("enabled, account_alias, account_holder")
      .eq("id", 1)
      .maybeSingle(),
    supabase.from("store_settings").select("whatsapp_phone").eq("id", 1).maybeSingle(),
  ]);

  return Boolean(
    bank?.enabled &&
      bank.account_alias?.trim() &&
      bank.account_holder?.trim() &&
      store?.whatsapp_phone && isValidArgentinaContactPhone(store.whatsapp_phone)
  );
}

export async function getAuthorizedBankTransferDetails(): Promise<BankTransferDetails> {
  const settings = await getBankTransferSettings();
  if (!settings.account_alias.trim() || !settings.account_holder.trim()) {
    throw new Error("Los datos de la transferencia ya no están completos");
  }
  return {
    alias: settings.account_alias,
    holder: settings.account_holder,
    institution: settings.institution_name,
    accountNumber: settings.account_number,
  };
}
