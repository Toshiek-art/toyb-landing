import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const port = Number(process.env.A11Y_PORT || 4173);

const routes = [
  "/",
  "/privacy",
  "/accessibility",
  "/terms",
  "/imprint",
];

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const resolveFilePath = (requestPath) => {
  const cleanPath = decodeURIComponent(requestPath.split("?")[0] || "/");
  const routePath = cleanPath.replace(/^\/+/, "");

  const candidate =
    cleanPath.endsWith("/") || path.extname(routePath) === ""
      ? path.resolve(distDir, routePath, "index.html")
      : path.resolve(distDir, routePath);

  if (!candidate.startsWith(distDir)) {
    return null;
  }

  return candidate;
};

const getMimeType = (filePath) => {
  const extension = path.extname(filePath);
  return mimeTypes[extension] ?? "application/octet-stream";
};

const ensureBuildExists = async () => {
  try {
    await stat(distDir);
  } catch {
    console.error(
      "dist/ not found. Run `npm run build` before `npm run test:a11y`.",
    );
    process.exit(1);
  }
};

const startStaticServer = () =>
  new Promise((resolve) => {
    const server = createServer(async (request, response) => {
      const requestedPath = request.url || "/";
      const filePath = resolveFilePath(requestedPath);

      if (!filePath) {
        response.statusCode = 403;
        response.end("Forbidden");
        return;
      }

      try {
        const file = await readFile(filePath);
        response.statusCode = 200;
        response.setHeader("Content-Type", getMimeType(filePath));
        response.end(file);
      } catch {
        response.statusCode = 404;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end("Not found");
      }
    });

    server.listen(port, "127.0.0.1", () => resolve(server));
  });

const testRoutes = async (baseUrl) => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const failures = [];

  try {
    for (const route of routes) {
      const url = `${baseUrl}${route}`;
      await page.goto(url, { waitUntil: "networkidle" });

      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      if (result.violations.length > 0) {
        failures.push({ route, violations: result.violations });
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return failures;
};

await ensureBuildExists();
const server = await startStaticServer();
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const failures = await testRoutes(baseUrl);

  if (failures.length > 0) {
    console.error("Accessibility violations detected:");
    for (const failure of failures) {
      console.error(`\nRoute: ${failure.route}`);
      for (const violation of failure.violations) {
        console.error(`- ${violation.id}: ${violation.help}`);
        for (const node of violation.nodes) {
          const target = node.target.join(", ");
          console.error(`  Target: ${target}`);
        }
      }
    }
    process.exitCode = 1;
  } else {
    console.log("Accessibility checks passed (axe-core, WCAG 2 A/AA tags).");
  }
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
