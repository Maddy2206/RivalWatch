/**
 * Tiny static server for offline end-to-end pipeline runs. Serves the fixture
 * HTML at every path (robots.txt allows everything). The file is re-read on
 * each request, so swapping fixtures/site/current.html simulates a page change
 * without restarting.
 *
 *   pnpm --filter worker fixture-server            # serves fixtures/site/current.html on :8787
 */
import { readFile } from "node:fs/promises";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.FIXTURE_PORT ?? 8787);
const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? join(here, "../../fixtures/site/current.html");

const server = http.createServer((req, res) => {
  void (async () => {
    if (req.url === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("User-agent: *\nDisallow:\n");
      return;
    }
    try {
      const html = await readFile(file, "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (error) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(String(error));
    }
  })();
});

server.listen(PORT, () => {
  console.log(`fixture server: serving ${file} at http://localhost:${PORT}/ (any path)`);
});
