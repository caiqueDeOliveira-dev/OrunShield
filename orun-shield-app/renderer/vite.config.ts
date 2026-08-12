import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

/** Injeta a meta CSP no build de produção (dev precisa de HMR/inline). */
function cspPlugin(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self' http://localhost:11434",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join("; ");
  return {
    name: "orun-shield-csp",
    apply: "build",
    transformIndexHtml(html) {
      if (html.includes("Content-Security-Policy")) return html;
      const meta = `    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n`;
      return html.replace("<title>Orun Shield</title>", `<title>Orun Shield</title>\n${meta}`);
    },
  };
}

export default defineConfig({
  root: path.resolve(__dirname, "."),
  base: "./",
  plugins: [react(), tailwindcss(), cspPlugin()],
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
