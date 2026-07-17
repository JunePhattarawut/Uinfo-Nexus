import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App is stateless (HANDOFF D15): no local file writes, no in-memory session state.
  output: "standalone",
  // Prevent Webpack from bundling Node.js-only packages (pg uses require('fs')).
  serverExternalPackages: ["pg", "pg-connection-string", "@prisma/client", "@prisma/adapter-pg"],
};

export default nextConfig;
