import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataOut = path.resolve(__dirname, "../data/out");
const root = path.resolve(__dirname, "..");

/** Serve construct JSON from ../data/out and handle /api/export */
function loomApi(): Plugin {
  return {
    name: "loom-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();

        if (req.url.startsWith("/data/")) {
          const rel = decodeURIComponent(req.url.slice("/data/".length).split("?")[0]);
          const file = path.normalize(path.join(dataOut, rel));
          if (!file.startsWith(dataOut) || !fs.existsSync(file)) {
            res.statusCode = 404;
            res.end("not found");
            return;
          }
          res.setHeader("Content-Type", "application/json");
          fs.createReadStream(file).pipe(res);
          return;
        }

        if (req.url.startsWith("/api/export") && req.method === "POST") {
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", () => {
            let opts: Record<string, string> = {};
            try {
              opts = body ? JSON.parse(body) : {};
            } catch {
              /* empty */
            }
            const args = [
              path.join(root, "export/export-pdf.ts"),
              "--size",
              opts.size || "a1",
              "--construct",
              opts.construct || "voice_cartoons",
              "--hero",
              opts.hero || "timeline",
              "--url",
              "http://127.0.0.1:5173",
            ];
            const skip = new Set(["size", "construct", "hero", "url"]);
            for (const [k, v] of Object.entries(opts)) {
              if (skip.has(k) || v == null || v === "") continue;
              args.push(`--${k}`, String(v));
            }
            const child = spawn("npx", ["tsx", ...args], {
              cwd: path.join(root, "app"),
              env: process.env,
            });
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", (d) => (stdout += d));
            child.stderr.on("data", (d) => (stderr += d));
            child.on("close", (code) => {
              res.setHeader("Content-Type", "application/json");
              if (code === 0) {
                const m = stdout.match(/Wrote\s+(.+)/);
                res.end(JSON.stringify({ ok: true, path: m?.[1]?.trim() || stdout.trim() }));
              } else {
                res.statusCode = 500;
                res.end(JSON.stringify({ ok: false, error: stderr || stdout || `exit ${code}` }));
              }
            });
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const pages = process.env.GITHUB_PAGES === "1" || mode === "pages";
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] || "imbd_loom";

  return {
    plugins: [react(), loomApi()],
    // Project Pages need /repo/; local + user Pages root use /
    base: pages ? `/${repo}/` : "/",
    server: {
      port: 5173,
      strictPort: true,
      host: "127.0.0.1",
      fs: { allow: [root] },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
