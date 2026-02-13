import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.devreemakelaardij.nl",
      },
    ],
  },
};

export default nextConfig;
