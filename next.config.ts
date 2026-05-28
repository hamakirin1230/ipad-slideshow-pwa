import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/ipad-slideshow-pwa",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
