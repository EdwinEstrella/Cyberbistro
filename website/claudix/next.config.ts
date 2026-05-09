import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compress responses with gzip
  compress: true,
  
  // Optimize images
  images: {
    formats: ["image/avif", "image/webp"],
  },

  // Power prefix for static assets (improves CDN caching)
  poweredByHeader: false,

  // Enable experimental optimizations
  experimental: {
    // Optimize package imports — tree-shake lucide-react barrel exports
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
