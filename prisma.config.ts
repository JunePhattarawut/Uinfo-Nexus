// Prisma CLI config (D17): JS/WASM schema engine + pg driver adapter.
// No native engine binaries needed — proxy/air-gap friendly installs.
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  experimental: { adapter: true },
  engine: "js",
  adapter: async () =>
    new PrismaPg({
      connectionString: process.env.DATABASE_URL ?? "postgresql://localhost:5432/workhub",
    }),
});
