import type { NextConfig } from "next";

/* Security headers (feature 23), on every response.

   The Content Security Policy allows only what the app uses:
   - Clerk: its Frontend API host (read from the publishable key, so it
     follows the instance: *.clerk.accounts.dev in development,
     clerk.<domain> in production), img.clerk.com, its telemetry, and
     Cloudflare's bot check in the sign-up form.
   - Vercel Blob: videos, posters, captions, podcasts and documents are
     read from this app's own store only, BLOB_PUBLIC_HOST (feature 24,
     S8; lib/env.ts checks it at startup), not from every Blob store.
     Browser uploads talk to vercel.com/api/blob.
   - Trigger.dev: Realtime job progress from api.trigger.dev.
   Scripts need 'unsafe-inline' because this policy has no per-request
   nonce (Next.js inlines its bootstrap scripts). A nonce-based policy set
   in proxy.ts is the stricter next step; it needs every page rendered per
   request. Everything the app renders from users is sanitized, so the
   policy is a second line of defence, not the first. */

function clerkFrontendApi(): string | null {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const encoded = key?.split("_")[2];
  if (!encoded) return null;
  const host = Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
  return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
}

/* Same pattern as lib/env.ts (this file can't import app modules). A bad
   value adds no host, so Blob media fails loudly; lib/env.ts names it. */
function blobStore(): string[] {
  const host = process.env.BLOB_PUBLIC_HOST?.trim();
  return host && /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(host) ? [`https://${host}`] : [];
}

const isDev = process.env.NODE_ENV === "development";
const clerk = clerkFrontendApi();
const blobRead = blobStore();

const csp: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : []), ...(clerk ? [clerk] : []), "https://challenges.cloudflare.com"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:", "https://img.clerk.com", ...blobRead],
  "media-src": ["'self'", "blob:", ...blobRead],
  "font-src": ["'self'", "data:"],
  "connect-src": [
    "'self'",
    ...(clerk ? [clerk] : []),
    "https://clerk-telemetry.com",
    "https://*.clerk-telemetry.com",
    "https://api.trigger.dev",
    "https://vercel.com",
    ...blobRead,
  ],
  "frame-src": ["'self'", "https://challenges.cloudflare.com", ...(clerk ? [clerk] : [])],
  "worker-src": ["'self'", "blob:"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
};

const cspHeader = [
  ...Object.entries(csp).map(([directive, sources]) => `${directive} ${sources.join(" ")}`),
  // Only where the site is served over HTTPS (Vercel); on http://localhost it would break loading.
  ...(process.env.VERCEL ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspHeader },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
