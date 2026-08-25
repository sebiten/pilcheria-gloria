"use server";

import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { cache } from "react";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { Profile } from "@/types";
import type { Role } from "@/types";
import { reportDataFallback } from "@/lib/logging";
import {
  isValidArgentinaContactPhone,
  normalizeArgentinaWhatsAppPhone,
} from "@/lib/contact";

const idSchema = z.string().uuid();
const addressSchema = z.object({
  name: z.string().trim().min(1).max(120),
  street: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  zip: z.string().trim().max(20).optional(),
  isDefault: z.boolean().optional(),
});
const profileContactSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  phone: z
    .string()
    .trim()
    .max(32)
    .refine((phone) => !phone || isValidArgentinaContactPhone(phone), {
      message: "Ingresá un WhatsApp válido con código de área.",
    })
    .optional(),
});

type ProfileRow = {
  id: string;
  clerk_user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: Role;
  created_at?: string | null;
};

function buildProfileFromRow(data: ProfileRow): Profile {
  return {
    id: data.id,
    clerk_user_id: data.clerk_user_id,
    email: data.email,
    full_name: data.full_name,
    phone: data.phone,
    role: data.role,
    created_at: data.created_at ?? "",
  };
}

async function getClerkUserBasics(userId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email =
    user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)
      ?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    `${userId}@pilcheriagloria.local`;
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.username ||
    email.split("@")[0] ||
    "Cliente";

  return { email, displayName };
}

const getProfileFromDb = cache(async function getProfileFromDb(userId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, clerk_user_id, email, full_name, phone, role, created_at")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (error) {
    reportDataFallback("profile", error);
    return null;
  }
  return data ? buildProfileFromRow(data as ProfileRow) : null;
});

export async function ensureUserProfile() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Usuario no autenticado");
  }

  const supabase = getSupabaseAdmin();
  const existingProfile = await getProfileFromDb(userId);

  if (existingProfile) {
    return existingProfile;
  }

  let clerkBasics: Awaited<ReturnType<typeof getClerkUserBasics>>;
  try {
    clerkBasics = await getClerkUserBasics(userId);
  } catch (error) {
    reportDataFallback("clerk-user", error);
    throw new Error("User not found in Clerk");
  }

  const payload = {
    id: randomUUID(),
    clerk_user_id: userId,
    email: clerkBasics.email,
    full_name: clerkBasics.displayName,
    role: "client",
  };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "clerk_user_id" })
    .select("id, clerk_user_id, email, full_name, phone, role, created_at")
    .single();

  if (error) {
    console.error("Error upserting profile:", error);
    throw error;
  }

  return buildProfileFromRow(data as ProfileRow);
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const { userId } = await auth();
  if (!userId) return null;

  return getProfileFromDb(userId);
}

export async function getProfile(): Promise<Profile | null> {
  const { userId } = await auth();
  if (!userId) return null;

  try {
    return await ensureUserProfile();
  } catch (error) {
    reportDataFallback("current-profile", error);
    return null;
  }
}

export async function isAdmin(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;

  const profile = await getProfileFromDb(userId);
  return profile?.role === "admin";
}

export async function requireAdmin(): Promise<void> {
  const admin = await isAdmin();
  if (!admin) {
    throw new Error("Acceso solo para administradores");
  }
}

export async function updateRole(profileId: string, role: "client" | "admin") {
  await requireAdmin();
  const safeProfileId = idSchema.parse(profileId);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", safeProfileId);

  if (error) throw error;
  revalidatePath("/dashboard");
}

export async function getAddresses() {
  const { userId } = await auth();
  if (!userId) return [];

  await ensureUserProfile();
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("addresses")
    .select("*")
    .eq("clerk_user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function addAddress(address: {
  name: string;
  street: string;
  city: string;
  state: string;
  zip?: string;
  isDefault?: boolean;
}) {
  const { userId } = await auth();
  if (!userId) throw new Error("User not authenticated");

  await ensureUserProfile();
  const supabase = getSupabaseAdmin();
  const parsedAddress = addressSchema.parse(address);
  const normalizedAddress = {
    name: parsedAddress.name,
    street: parsedAddress.street,
    city: parsedAddress.city,
    state: parsedAddress.state,
    zip: parsedAddress.zip || null,
    is_default: Boolean(parsedAddress.isDefault),
  };

  let existingAddressQuery = supabase
    .from("addresses")
    .select("id")
    .eq("clerk_user_id", userId)
    .eq("name", normalizedAddress.name)
    .eq("street", normalizedAddress.street)
    .eq("city", normalizedAddress.city)
    .eq("state", normalizedAddress.state);
  existingAddressQuery = normalizedAddress.zip
    ? existingAddressQuery.eq("zip", normalizedAddress.zip)
    : existingAddressQuery.is("zip", null);
  const { data: existingAddress, error: existingAddressError } =
    await existingAddressQuery.maybeSingle();

  if (existingAddressError) throw existingAddressError;

  if (normalizedAddress.is_default) {
    await supabase
      .from("addresses")
      .update({ is_default: false })
      .eq("clerk_user_id", userId);
  }

  if (existingAddress) {
    const { error } = await supabase
      .from("addresses")
      .update(normalizedAddress)
      .eq("id", existingAddress.id)
      .eq("clerk_user_id", userId);

    if (error) throw error;
  } else {
    const { count, error: countError } = await supabase
      .from("addresses")
      .select("id", { count: "exact", head: true })
      .eq("clerk_user_id", userId);

    if (countError) throw countError;
    if ((count ?? 0) >= 10) {
      throw new Error("Alcanzaste el límite de 10 direcciones guardadas");
    }

    const { error } = await supabase.from("addresses").insert({
      clerk_user_id: userId,
      ...normalizedAddress,
    });

    if (error) throw error;
  }

  revalidatePath("/account");
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
}

export async function deleteAddress(id: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("User not authenticated");

  await ensureUserProfile();
  const safeId = idSchema.parse(id);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("addresses")
    .delete()
    .eq("id", safeId)
    .eq("clerk_user_id", userId);

  if (error) throw error;
  revalidatePath("/account");
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
}

export async function setDefaultAddress(id: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("User not authenticated");

  await ensureUserProfile();
  const safeId = idSchema.parse(id);
  const supabase = getSupabaseAdmin();

  const { error: resetError } = await supabase
    .from("addresses")
    .update({ is_default: false })
    .eq("clerk_user_id", userId);

  if (resetError) throw resetError;

  const { error } = await supabase
    .from("addresses")
    .update({ is_default: true })
    .eq("id", safeId)
    .eq("clerk_user_id", userId);

  if (error) throw error;
  revalidatePath("/account");
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
}

export async function createProfile(): Promise<void> {
  const { userId } = await auth();
  if (!userId) return;

  await ensureUserProfile();
}

export async function updateProfileContact(input: {
  fullName?: string;
  phone?: string;
}) {
  const { userId } = await auth();
  if (!userId) throw new Error("User not authenticated");

  await ensureUserProfile();
  const supabase = getSupabaseAdmin();
  const parsedInput = profileContactSchema.parse(input);
  const payload = {
    full_name: parsedInput.fullName || null,
    phone: parsedInput.phone
      ? normalizeArgentinaWhatsAppPhone(parsedInput.phone)
      : null,
  };

  const { error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("clerk_user_id", userId);

  if (error) throw error;
  revalidatePath("/account");
  revalidatePath("/checkout");
}
