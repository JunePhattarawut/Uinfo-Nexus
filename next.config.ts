import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App is stateless (HANDOFF D15): no local file writes, no in-memory session state.
  output: "standalone",
};

export default nextConfig;
