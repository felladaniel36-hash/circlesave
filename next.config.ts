import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the Turbopack root to the current working directory (i.e. this project
  // folder) so a stray parent package-lock.json — e.g. one in the user's home
  // folder — doesn't confuse Turbopack's workspace detection.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
