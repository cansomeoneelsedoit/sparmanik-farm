import path from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev-only: Next 16 blocks its own /_next dev resources when the site is
  // opened via 127.0.0.1 (only "localhost" is trusted by default). Without
  // this, the page HTML loads but client JS/HMR is refused → forms never
  // hydrate and the tab looks frozen. Ignored in production builds.
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "210mb",
    },
  },
  // Disable browser caching for everything except Next's own immutable build
  // assets (which already have content-hashed filenames so cache busting is
  // automatic). HTML pages, RSC payloads, server-action responses, and our
  // own /public/* assets always come back fresh, so a deploy is visible
  // without a hard refresh.
  async headers() {
    return [
      {
        source: "/((?!_next/static).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, max-age=0",
          },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
