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
  async headers() {
    return [
      {
        source: "/mobile/whatsapp-concepten-sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/mobile/whatsapp-concepten" },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
      {
        // Sta iframe embedding toe voor de publieke buurtdata rapport pagina
        source: "/buurtdata-rapport",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;
