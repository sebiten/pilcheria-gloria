"use client";

import { usePathname } from "next/navigation";

export function RouteAwareFooter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return pathname === "/checkout" ? null : children;
}
