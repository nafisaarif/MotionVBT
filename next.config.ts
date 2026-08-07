import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid requiring the optional Cloudflare Images paid binding. MotionVBT's
  // bundled images are small static assets and can be served directly.
  images: { unoptimized: true },
};

export default nextConfig;
