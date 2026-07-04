import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the Turbopack root to the current working directory (i.e. this project
  // folder) so a stray parent package-lock.json doesn't confuse workspace detection.
  turbopack: {
    root: process.cwd(),
  },
  // Allow the dev server to be accessed from the machine's network IP
  // (silences the "Cross origin request detected" dev warning).
  allowedDevOrigins: ["http://10.98.78.185:3001"],
};

export default nextConfig;
