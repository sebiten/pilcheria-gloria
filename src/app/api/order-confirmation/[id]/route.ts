import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getOrderConfirmationCookieName,
  secureTokenEquals,
} from "@/lib/orders/confirmation-access";

interface ConfirmationRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: ConfirmationRouteContext) {
  const { id: rawId } = await context.params;
  const parsedId = z.string().uuid().safeParse(rawId);
  const requestUrl = new URL(request.url);
  const cleanUrl = new URL(
    `/order-confirmation/${encodeURIComponent(rawId)}`,
    request.url
  );

  if (!parsedId.success) {
    return NextResponse.redirect(new URL("/products", request.url), 303);
  }

  const id = parsedId.data;
  const legacyToken = requestUrl.searchParams.get("token");

  if (!legacyToken) {
    cleanUrl.searchParams.set("verification", "failed");
    return NextResponse.redirect(cleanUrl, 303);
  }

  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from("orders")
    .select("guest_access_token")
    .eq("id", id)
    .maybeSingle();

  const guestToken = order?.guest_access_token;
  const legacyTokenIsValid = Boolean(
    guestToken && secureTokenEquals(legacyToken, guestToken)
  );

  if (error || !guestToken || !legacyTokenIsValid) {
    cleanUrl.searchParams.set("verification", "failed");
    return NextResponse.redirect(cleanUrl, 303);
  }

  const response = NextResponse.redirect(cleanUrl, 303);
  response.cookies.set(getOrderConfirmationCookieName(id), guestToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/order-confirmation/${id}`,
    maxAge: 7 * 24 * 60 * 60,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
