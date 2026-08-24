import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigin = (() => {
  try {
    return supabaseUrl ? new URL(supabaseUrl).origin : "";
  } catch {
    return "";
  }
})();
const supabaseHostname = (() => {
  try {
    return supabaseUrl ? new URL(supabaseUrl).hostname : null;
  } catch {
    return null;
  }
})();

const retiredCategorySlugs = [
  "colchones",
  "sommiers",
  "accesorios",
  "hombre",
  "hombre-remeras",
  "hombre-jeans",
  "mujer",
  "mujer-remeras",
  "mujer-jeans",
  "mujer-otras-prendas",
];

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
  } https://*.clerk.accounts.dev https://*.clerk.com https://*.clerk.dev https://clerk.pilcheriagloria.com.ar https://challenges.cloudflare.com https://*.protect.clerk.com https://www.googletagmanager.com https://connect.facebook.net https://www.mercadopago.com https://*.mercadopago.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://images.unsplash.com${supabaseOrigin ? ` ${supabaseOrigin}` : ""} https://*.clerk.com https://*.clerk.dev https://img.clerk.com https://*.google-analytics.com https://www.googletagmanager.com https://www.facebook.com https://www.mercadopago.com https://*.mercadopago.com`,
  "font-src 'self' data:",
  "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://*.clerk.dev https://clerk.pilcheriagloria.com.ar https://clerk-telemetry.com https://*.clerk-telemetry.com https://img.clerk.com https://*.protect.clerk.com https://api.clerk.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.google.com https://connect.facebook.net https://www.facebook.com https://www.mercadopago.com https://*.mercadopago.com",
  "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://*.protect.clerk.com https://www.google.com",
  "worker-src 'self' blob:",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
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
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      ...(supabaseHostname
        ? [{ protocol: "https" as const, hostname: supabaseHostname }]
        : []),
    ],
  },
  async redirects() {
    return [
      ...retiredCategorySlugs.map((slug) => ({
        source: `/categories/${slug}`,
        destination: "/uniformes",
        permanent: true,
      })),
      {
        source: "/products",
        destination: "/uniformes",
        permanent: true,
      },
      {
        source: "/products/:slug",
        destination: "/uniformes/:slug",
        permanent: true,
      },
    ];
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
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-Permitted-Cross-Domain-Policies",
            value: "none",
          },
          {
            key: "Origin-Agent-Cluster",
            value: "?1",
          },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
