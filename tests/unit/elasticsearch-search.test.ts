import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ElasticsearchClient, type SearchDocument } from "@/modules/search/service";

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, body: unknown, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

describe("Elasticsearch/OpenSearch client", () => {
  const requests: Array<{ method?: string; url?: string; body: string; authorization?: string }> = [];
  let baseUrl = "";
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    const server = createServer(async (req, res) => {
      const body = await readBody(req);
      requests.push({ method: req.method, url: req.url, body, authorization: req.headers.authorization });

      if (req.method === "PUT" && req.url === "/workhub_test") return sendJson(res, { acknowledged: true });
      if (req.method === "POST" && req.url === "/_bulk") return sendJson(res, { errors: false, items: [] });
      if (req.method === "POST" && req.url === "/workhub_test/_search") {
        return sendJson(res, {
          hits: {
            hits: [
              {
                _source: {
                  workspaceId: "ws-1",
                  type: "issue",
                  id: "issue-1",
                  title: "CTI-1 Login issue",
                  href: "/p/CTI/issues/CTI-1",
                  excerpt: "Search body",
                  meta: "CTI · To Do",
                  body: "Search body",
                  updatedAt: "2026-07-14T00:00:00.000Z",
                },
              },
            ],
          },
        });
      }
      return sendJson(res, { error: "unexpected request" }, 404);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Failed to start test search server");
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeServer = () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  afterAll(async () => {
    await closeServer();
  });

  it("creates an index, bulk-indexes documents, and maps search hits", async () => {
    const client = new ElasticsearchClient({ url: baseUrl, index: "workhub_test", apiKey: "test-key", timeoutMs: 1000 });
    const document: SearchDocument = {
      workspaceId: "ws-1",
      type: "issue",
      id: "issue-1",
      title: "CTI-1 Login issue",
      href: "/p/CTI/issues/CTI-1",
      excerpt: "Search body",
      meta: "CTI · To Do",
      body: "Search body",
      updatedAt: "2026-07-14T00:00:00.000Z",
    };

    await client.ensureIndex();
    await expect(client.bulkIndexDocuments([document])).resolves.toEqual({ indexed: 1 });
    const results = await client.searchDocuments("ws-1", "login", "issue");

    expect(results).toEqual([{ type: "issue", id: "issue-1", title: "CTI-1 Login issue", href: "/p/CTI/issues/CTI-1", excerpt: "Search body", meta: "CTI · To Do" }]);
    expect(requests.some((request) => request.method === "PUT" && request.url === "/workhub_test")).toBe(true);
    const bulk = requests.find((request) => request.method === "POST" && request.url === "/_bulk");
    expect(bulk?.body).toContain('"_index":"workhub_test"');
    expect(bulk?.authorization).toBe("ApiKey test-key");
    const search = requests.find((request) => request.method === "POST" && request.url === "/workhub_test/_search");
    expect(search?.body).toContain('"workspaceId":"ws-1"');
    expect(search?.body).toContain('"type":["issue"]');
  });
});
