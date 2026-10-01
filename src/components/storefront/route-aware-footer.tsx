"use client";

import { usePathname } from "next/navigation";
import { ProductInterestSurvey } from "./product-interest-survey";

export function RouteAwareFooter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/checkout") return null;

  return pathname.startsWith("/uniformes/") ? (
    <div className="pb-[8.125rem] lg:pb-0">
      <div className="container mx-auto px-4"><ProductInterestSurvey key={pathname} placement="product" /></div>
      {children}
    </div>
  ) : (
    children
  );
}
