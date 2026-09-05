import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const project = fileURLToPath(new URL("../../../../", import.meta.url));
const server = await createServer({
  configFile: false, envDir: false,
  define: { "process.env": JSON.stringify({ NODE_ENV: "development" }) },
  root: fileURLToPath(new URL("fixture", import.meta.url)),
  publicDir: `${project}/public`,
  cacheDir: fileURLToPath(new URL("work/vite", import.meta.url)),
  plugins: [react()],
  resolve: { alias: { "@": project, "next/link": fileURLToPath(import.meta.resolve("vinext/shims/link")) } },
  server: { host: "127.0.0.1", port: 5190, strictPort: true, fs: { allow: [project] } },
});
await server.listen();
server.printUrls();
async function close() { await server.close(); process.exit(0); }
process.once("SIGTERM", close);
process.once("SIGINT", close);
