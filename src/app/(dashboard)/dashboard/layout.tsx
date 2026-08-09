import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { getCurrentProfile } from "@/actions/auth";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login?redirect_url=/dashboard");
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/");
  }

  if (profile.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="flex min-h-dvh bg-muted/30">
      <DashboardSidebar />
      <main className="min-w-0 flex-1 pt-16 lg:pt-0">
        <div className="dashboard-content mx-auto w-full max-w-[1440px] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 xl:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
