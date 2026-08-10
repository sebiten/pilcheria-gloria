import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { Webhook } from "svix";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET || "";
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  try {
    if (!WEBHOOK_SECRET) {
      console.error("Falta CLERK_WEBHOOK_SECRET");
      return NextResponse.json(
        { error: "Webhook unavailable" },
        { status: 503 }
      );
    }

    const headersList = await headers();
    const svix_id = headersList.get("svix-id");
    const svix_timestamp = headersList.get("svix-timestamp");
    const svix_signature = headersList.get("svix-signature");

    if (!svix_id || !svix_timestamp || !svix_signature) {
      return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
    }

    const contentLength = Number(headersList.get("content-length") || 0);
    if (contentLength > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    const wh = new Webhook(WEBHOOK_SECRET);
    let event: any;

    try {
      event = wh.verify(body, {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
      });
    } catch (err) {
      console.error("Webhook verification failed:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const { type, data } = event;

    if (type === "user.created" || type === "user.updated") {
      const supabase = getSupabaseAdmin();
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("clerk_user_id", data.id)
        .maybeSingle();

      const { error } = await supabase.from("profiles").upsert(
        {
          id: existingProfile?.id ?? randomUUID(),
          clerk_user_id: data.id,
          email: data.email_addresses?.[0]?.email_address || "",
          full_name:
            data.first_name && data.last_name
              ? `${data.first_name} ${data.last_name}`
              : data.first_name || data.last_name || "",
          role: existingProfile?.role ?? "client",
        },
        { onConflict: "clerk_user_id" }
      );

      if (error) {
        console.error("Error creating profile:", error);
        return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
      }

      console.log("Profile created/updated for user:", data.id);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
