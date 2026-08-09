import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
  } https://*.clerk.accounts.dev https://*.clerk.com https://*.clerk.dev https://clerk.pilcheriagloria.com.ar https://challenges.cloudflare.com https://*.protect.clerk.com https://sdk.mercadopago.com https://www.googletagmanager.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co https://*.clerk.com https://*.clerk.dev https://img.clerk.com https://*.google-analytics.com https://www.googletagmanager.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.clerk.accounts.dev https://*.clerk.com https://*.clerk.dev https://clerk.pilcheriagloria.com.ar https://clerk-telemetry.com https://*.clerk-telemetry.com https://img.clerk.com https://*.protect.clerk.com https://api.clerk.com https://api.mercadopago.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
  "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://*.protect.clerk.com https://*.mercadopago.com https://www.google.com",
  "worker-src 'self' blob:",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.mercadopago.com",
  "frame-ancestors 'none'",
  ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
