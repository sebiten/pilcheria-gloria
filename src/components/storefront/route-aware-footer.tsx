"use client";

import { usePathname } from "next/navigation";

export function RouteAwareFooter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/checkout") return null;

  return pathname.startsWith("/uniformes/") ? (
    <div className="pb-[8.125rem] lg:pb-0">{children}</div>
  ) : (
    children
  );
}
