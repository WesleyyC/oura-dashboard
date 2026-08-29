import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./platform/database/schema.ts",
  dialect: "sqlite",
});
