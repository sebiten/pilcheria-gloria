"use server";

import { z } from "zod";
import { revalidatePath, unstable_cache, updateTag } from "next/cache";
import { requireAdmin } from "@/actions/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { StoreSettings } from "@/types";
import { reportDataFallback } from "@/lib/logging";

const storeSettingsSchema = z.object({
  storeName: z.string().trim().min(2),
  contactEmail: z.string().trim().email(),
  contactPhone: z.string().trim().min(3),
  whatsappPhone: z.string().trim().optional(),
  addressLine: z.string().trim().min(4),
  city: z.string().trim().min(2),
  state: z.string().trim().min(2),
  businessHours: z.string().trim().min(4),
  instagramUrl: z.union([z.literal(""), z.string().trim().url()]).optional(),
  facebookUrl: z.union([z.literal(""), z.string().trim().url()]).optional(),
  footerText: z.string().trim().min(10),
  pickupEnabled: z.boolean(),
  localDeliveryEnabled: z.boolean(),
  localDeliveryCost: z.number().nonnegative(),
  pickupInstructions: z.string().trim().min(10),
  legalName: z.string().trim().max(160).optional(),
  taxId: z.string().trim().max(32).optional(),
  legalAddress: z.string().trim().max(240).optional(),
}).refine((settings) => settings.pickupEnabled || settings.localDeliveryEnabled, {
  message: "Activá al menos una modalidad de entrega",
  path: ["pickupEnabled"],
});

const defaultStoreSettings: StoreSettings = {
  store_name: "Pilchería Gloria",
  contact_email: "completar@ejemplo.com",
  contact_phone: "Completar",
  whatsapp_phone: null,
  address_line: "Feria, pasillo verde, local 49",
  city: "Libertador General San Martín",
  state: "Jujuy",
  business_hours: "Horarios a completar",
  instagram_url: null,
  facebook_url: null,
  footer_text:
    "Uniformes escolares en Libertador General San Martín. Encontranos en la feria, pasillo verde, local 49.",
  pickup_enabled: true,
  local_delivery_enabled: false,
  local_delivery_cost: 0,
  pickup_instructions:
    "Esperá nuestra confirmación por WhatsApp. Cuando esté listo, retiralo mostrando el código del pedido. Buscá Pilchería Gloria: es el local verde manzana.",
  legal_name: null,
  tax_id: null,
  legal_address: null,
};

const STORE_SETTINGS_CACHE_TAG = "store-settings";

function mapStoreSettings(row: Record<string, unknown>): StoreSettings {
  return {
    store_name: String(row.store_name ?? defaultStoreSettings.store_name),
    contact_email: String(row.contact_email ?? defaultStoreSettings.contact_email),
    contact_phone: String(row.contact_phone ?? defaultStoreSettings.contact_phone),
    whatsapp_phone: row.whatsapp_phone ? String(row.whatsapp_phone) : null,
    address_line: String(row.address_line ?? defaultStoreSettings.address_line),
    city: String(row.city ?? defaultStoreSettings.city),
    state: String(row.state ?? defaultStoreSettings.state),
    business_hours: String(
      row.business_hours ?? defaultStoreSettings.business_hours
    ),
    instagram_url: row.instagram_url ? String(row.instagram_url) : null,
    facebook_url: row.facebook_url ? String(row.facebook_url) : null,
    footer_text: String(row.footer_text ?? defaultStoreSettings.footer_text),
    pickup_enabled:
      row.pickup_enabled === undefined
        ? defaultStoreSettings.pickup_enabled
        : Boolean(row.pickup_enabled),
    local_delivery_enabled:
      row.local_delivery_enabled === undefined
        ? defaultStoreSettings.local_delivery_enabled
        : Boolean(row.local_delivery_enabled),
    local_delivery_cost: Number(row.local_delivery_cost) || 0,
    pickup_instructions: String(
      row.pickup_instructions ?? defaultStoreSettings.pickup_instructions
    ),
    legal_name: row.legal_name ? String(row.legal_name) : null,
    tax_id: row.tax_id ? String(row.tax_id) : null,
    legal_address: row.legal_address ? String(row.legal_address) : null,
  };
}

export async function getStoreSettings(): Promise<StoreSettings> {
  try {
    return await getStoreSettingsCached();
  } catch (error) {
    reportDataFallback("store-settings", error);
    return defaultStoreSettings;
  }
}

const getStoreSettingsCached = unstable_cache(
  async (): Promise<StoreSettings> => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("store_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;

    return data ? mapStoreSettings(data) : defaultStoreSettings;
  },
  ["store-settings-v7"],
  {
    tags: [STORE_SETTINGS_CACHE_TAG],
    revalidate: 3600,
  }
);

export async function updateStoreSettings(
  input: z.infer<typeof storeSettingsSchema>
) {
  await requireAdmin();
  const payload = storeSettingsSchema.parse(input);
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("store_settings").upsert(
    {
      id: 1,
      store_name: payload.storeName,
      contact_email: payload.contactEmail,
      contact_phone: payload.contactPhone,
      whatsapp_phone: payload.whatsappPhone || null,
      address_line: payload.addressLine,
      city: payload.city,
      state: payload.state,
      business_hours: payload.businessHours,
      instagram_url: payload.instagramUrl || null,
      facebook_url: payload.facebookUrl || null,
      footer_text: payload.footerText,
      pickup_enabled: payload.pickupEnabled,
      local_delivery_enabled: payload.localDeliveryEnabled,
      local_delivery_cost: payload.localDeliveryCost,
      pickup_instructions: payload.pickupInstructions,
      legal_name: payload.legalName || null,
      tax_id: payload.taxId || null,
      legal_address: payload.legalAddress || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) throw error;

  updateTag(STORE_SETTINGS_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/checkout");
  revalidatePath("/dashboard/settings");
}
