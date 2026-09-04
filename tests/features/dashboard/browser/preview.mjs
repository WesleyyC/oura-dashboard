import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const project = fileURLToPath(new URL("../../../../", import.meta.url));
const fixture = fileURLToPath(new URL("fixture", import.meta.url));
const server = await createServer({
  configFile: false,
  envDir: false,
  root: fixture,
  publicDir: `${project}/public`,
  cacheDir: fileURLToPath(new URL("work/vite", import.meta.url)),
  plugins: [react()],
  resolve: { alias: { "@": project } },
  server: {
    host: "127.0.0.1",
    port: 5189,
    strictPort: true,
    fs: { allow: [project] },
  },
});
await server.listen();
server.printUrls();
async function close() {
  await server.close();
  process.exit(0);
}
process.once("SIGTERM", close);
process.once("SIGINT", close);
