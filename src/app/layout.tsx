import type { Metadata, Viewport } from "next";
import { Archivo_Black, Manrope } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import {
  SITE_DESCRIPTION,
  SITE_DEPARTMENT,
  SITE_NAME,
  SITE_REGION,
  SITE_REGION_CODE,
} from "@/lib/site";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-gloria-body",
  subsets: ["latin"],
});

const archivoBlack = Archivo_Black({
  variable: "--font-gloria-display",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ),
  title: {
    default: `${SITE_NAME} | Uniformes escolares en Ledesma, Jujuy`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "shopping",
  creator: SITE_NAME,
  publisher: SITE_NAME,
  keywords: [
    "uniformes escolares en Ledesma",
    "uniformes escolares en Jujuy",
    "uniformes escolares en Libertador General San Martín",
    "uniformes para primaria",
    "uniformes para secundaria",
    "remeras escolares",
    "chombas escolares",
    "talles de uniformes escolares",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: SITE_NAME,
    title: `${SITE_NAME} | Uniformes escolares en ${SITE_DEPARTMENT}`,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | Uniformes escolares en Ledesma`,
    description: SITE_DESCRIPTION,
  },
  other: {
    "geo.region": SITE_REGION_CODE,
    "geo.placename": `${SITE_DEPARTMENT}, ${SITE_REGION}`,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#a8d829",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-AR"
      data-scroll-behavior="smooth"
      className={`${manrope.variable} ${archivoBlack.variable}`}
    >
      <body className="flex min-h-full flex-col antialiased">
        <a
          href="#contenido-principal"
          className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-lg bg-gloria-950 px-4 py-3 font-bold text-white shadow-xl transition-transform focus:translate-y-0"
        >
          Ir al contenido principal
        </a>
        <ClerkProvider
          localization={esES as any}
          publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}
          signInUrl="/login"
          signUpUrl="/register"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
