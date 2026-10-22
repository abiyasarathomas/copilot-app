import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// In development, serve the /api routes from this same server, so `npm run dev`
// is all you need. In production, Vercel runs the files in /api itself.
function devApi(): Plugin {
  return {
    name: "copilot-dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/api\/(brief|day|prioritize|chat)$/);
        if (!m) return next();
        const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`);
        const handler = req.method === "OPTIONS" ? mod.OPTIONS : mod.POST;
        if (!handler) { res.statusCode = 405; return res.end(); }
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const response: Response = await handler(new Request(`http://localhost${req.url}`, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
        }));
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

// `npm run build:test` makes a build that runs inside a Claude artifact: Claude is
// reached through the artifact instead of our server, so it needs no API key.
function artifactApi(): Plugin {
  return {
    name: "copilot-artifact-api",
    enforce: "pre",
    resolveId(source, importer) {
      if (source === "./api" && importer?.includes("/src/") && !importer.endsWith("api.artifact.ts")) {
        return this.resolve("./api.artifact", importer);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), "")); // ANTHROPIC_API_KEY from .env
  if (mode === "artifact") return { base: "./", build: { outDir: "dist-test", rollupOptions: { output: { inlineDynamicImports: true } } }, plugins: [react(), artifactApi()] };
  return {
    plugins: [
      react(),
      devApi(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icon.svg"],
        manifest: {
          name: "Co-Pilot",
          short_name: "Co-Pilot",
          description: "Your work brief: meetings, conversations and to-dos in one place.",
          theme_color: "#1f6f5c",
          background_color: "#f6f5f1",
          display: "standalone",
          start_url: "/",
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: { navigateFallbackDenylist: [/^\/api\//] },
      }),
    ],
  };
});
