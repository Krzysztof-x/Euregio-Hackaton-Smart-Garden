import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { handleApi } from "./server/api.js";

/**
 * Runs the plant assistant API (/api/...) inside the Vite dev server, so `npm run dev` is enough.
 * The API key is read on the server side (server/gemini.js) and never ends up in the browser code.
 */
function chatApi(): Plugin {
  return {
    name: "smart-garden-chat-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handleApi(req, res).then((handled: boolean) => handled || next(), next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        handleApi(req, res).then((handled: boolean) => handled || next(), next);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), chatApi()],
  build: {
    // The MQTT library alone is ~500 kB - fine for a dashboard on the local network
    chunkSizeWarningLimit: 800,
  },
});
