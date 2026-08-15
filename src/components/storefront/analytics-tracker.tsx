"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackStorefrontEvent } from "@/lib/analytics/client";

export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    trackStorefrontEvent({ event: "page_view", dedupe: true });
  }, [pathname]);

  return null;
}
