import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/tenancy";
import { textFromDoc } from "@/modules/codex/service";

export type SearchType = "all" | "project" | "issue" | "page" | "comment" | "attachment";
export type SearchResult = { type: Exclude<SearchType, "all">; id: string; title: string; href: string; excerpt: string; meta?: string };
export type SearchDocument = SearchResult & { workspaceId: string; body: string; updatedAt: string };

export interface SearchProvider {
  search(userId: string, workspaceId: string, query: string, type?: SearchType): Promise<SearchResult[]>;
}

const SOURCE_TAKE = 200;
const RESULT_LIMIT = 50;
const DEFAULT_SEARCH_INDEX = "workhub_search";

function includesNeedle(...values: Array<string | null | undefined>) {
  return (q: string) => values.some((value) => (value ?? "").toLowerCase().includes(q));
}

function metadataText(value: unknown) {
  if (!value || typeof value !== "object") return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function textBody(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).join("\n");
}

function asSearchTypes(type: SearchType) {
  return type === "all" ? ["project", "issue", "page", "comment", "attachment"] : [type];
}

export class PostgresSearchProvider implements SearchProvider {
  async search(userId: string, workspaceId: string, query: string, type: SearchType = "all") {
    await requireMembership(userId, workspaceId, "VIEWER");
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results = await collectPostgresSearchResults(workspaceId, q, type);
    return results.slice(0, RESULT_LIMIT);
  }
}

async function collectPostgresSearchResults(workspaceId: string, q: string, type: SearchType) {
  const results: SearchResult[] = [];

  if (type === "all" || type === "project") {
    const projects = await prisma.project.findMany({
      where: { workspaceId },
      take: SOURCE_TAKE,
      orderBy: { updatedAt: "desc" },
      include: { statuses: { orderBy: { position: "asc" } }, _count: { select: { issues: true, members: true, sprints: true } } },
    });
    for (const project of projects) {
      const workflow = project.statuses.map((status) => status.name).join(" ");
      const matches = includesNeedle(project.key, project.name, project.description, workflow, metadataText(project.metadata))(q);
      if (matches) {
        results.push({
          type: "project",
          id: project.id,
          title: `${project.key} ${project.name}`,
          href: `/p/${project.key}/issues`,
          excerpt: project.description || `${project._count.issues} work items · ${project.statuses.length} statuses · ${project._count.members} access members`,
          meta: "Project",
        });
      }
    }
  }

  if (type === "all" || type === "issue") {
    const issues = await prisma.issue.findMany({
      where: { workspaceId, deletedAt: null },
      take: SOURCE_TAKE,
      include: { project: true, labels: { include: { label: true } }, status: true, assignee: true, reporter: true, attachments: true },
      orderBy: { updatedAt: "desc" },
    });
    for (const issue of issues) {
      const key = `${issue.project.key}-${issue.number}`;
      const body = textFromDoc(issue.description);
      const labels = issue.labels.map((l) => l.label.name).join(" ");
      const attachmentNames = issue.attachments.map((attachment) => attachment.filename).join(" ");
      const matches = includesNeedle(key, issue.title, body, issue.type, issue.priority, issue.status.name, labels, attachmentNames, metadataText(issue.customFields), issue.assignee?.name, issue.assignee?.email, issue.reporter.name, issue.reporter.email)(q);
      if (matches) results.push({ type: "issue", id: issue.id, title: `${key} ${issue.title}`, href: `/p/${issue.project.key}/issues/${key}`, excerpt: body.slice(0, 180) || `${issue.type} · ${issue.priority} · ${issue.status.name}`, meta: `${issue.project.name} · ${issue.status.name}` });
    }
  }

  if (type === "all" || type === "page") {
    const pages = await prisma.page.findMany({
      where: { workspaceId, deletedAt: null },
      take: SOURCE_TAKE,
      include: { space: true, labels: { include: { label: true } }, attachments: true },
      orderBy: { updatedAt: "desc" },
    });
    for (const page of pages) {
      const body = textFromDoc(page.content);
      const labels = page.labels.map((l) => l.label.name).join(" ");
      const attachmentNames = page.attachments.map((attachment) => attachment.filename).join(" ");
      const matches = includesNeedle(page.title, body, page.space.key, page.space.name, labels, attachmentNames)(q);
      if (matches) results.push({ type: "page", id: page.id, title: `${page.space.key}: ${page.title}`, href: `/s/${page.space.key}/pages/${page.id}`, excerpt: body.slice(0, 180) || page.space.name, meta: `Codex · ${page.space.name}` });
    }
  }

  if (type === "all" || type === "comment") {
    const comments = await prisma.comment.findMany({
      where: {
        OR: [
          { issue: { workspaceId, deletedAt: null } },
          { page: { workspaceId, deletedAt: null } },
        ],
      },
      take: SOURCE_TAKE,
      include: {
        author: { select: { name: true, email: true } },
        issue: { include: { project: true } },
        page: { include: { space: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    for (const comment of comments) {
      const body = textFromDoc(comment.body);
      const matches = includesNeedle(body, comment.author.name, comment.author.email, comment.issue?.title, comment.page?.title)(q);
      if (!matches) continue;
      if (comment.issue) {
        const key = `${comment.issue.project.key}-${comment.issue.number}`;
        results.push({ type: "comment", id: comment.id, title: `Comment on ${key}: ${comment.issue.title}`, href: `/p/${comment.issue.project.key}/issues/${key}`, excerpt: body.slice(0, 180), meta: comment.author.name ?? comment.author.email });
      } else if (comment.page) {
        results.push({ type: "comment", id: comment.id, title: `Comment on ${comment.page.space.key}: ${comment.page.title}`, href: `/s/${comment.page.space.key}/pages/${comment.page.id}`, excerpt: body.slice(0, 180), meta: comment.author.name ?? comment.author.email });
      }
    }
  }

  if (type === "all" || type === "attachment") {
    const attachments = await prisma.attachment.findMany({
      where: {
        workspaceId,
        OR: [
          { issue: { workspaceId, deletedAt: null } },
          { page: { workspaceId, deletedAt: null } },
        ],
      },
      take: SOURCE_TAKE,
      include: {
        issue: { include: { project: true } },
        page: { include: { space: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    for (const attachment of attachments) {
      const matches = includesNeedle(attachment.filename, attachment.mimeType, attachment.storageKey, attachment.issue?.title, attachment.page?.title)(q);
      if (!matches) continue;
      if (attachment.issue) {
        const key = `${attachment.issue.project.key}-${attachment.issue.number}`;
        results.push({ type: "attachment", id: attachment.id, title: `${attachment.filename} on ${key}`, href: `/p/${attachment.issue.project.key}/issues/${key}`, excerpt: `${attachment.mimeType} · ${attachment.size} bytes`, meta: "Issue attachment" });
      } else if (attachment.page) {
        results.push({ type: "attachment", id: attachment.id, title: `${attachment.filename} on ${attachment.page.space.key}: ${attachment.page.title}`, href: `/s/${attachment.page.space.key}/pages/${attachment.page.id}`, excerpt: `${attachment.mimeType} · ${attachment.size} bytes`, meta: "Codex attachment" });
      }
    }
  }

  return results;
}

export type ElasticConfig = {
  url: string;
  index: string;
  apiKey?: string;
  username?: string;
  password?: string;
  timeoutMs: number;
};

export class ElasticsearchClient {
  constructor(private readonly config: ElasticConfig) {}

  async ensureIndex() {
    const body = {
      mappings: {
        properties: {
          workspaceId: { type: "keyword" },
          type: { type: "keyword" },
          id: { type: "keyword" },
          title: { type: "text", fields: { keyword: { type: "keyword" } } },
          body: { type: "text" },
          excerpt: { type: "text" },
          meta: { type: "text" },
          href: { type: "keyword" },
          updatedAt: { type: "date" },
        },
      },
    };
    const response = await this.request(`/${encodeURIComponent(this.config.index)}`, { method: "PUT", body: JSON.stringify(body) });
    if (!response.ok && response.status !== 400) throw new Error(`Search index create failed: ${response.status} ${await response.text()}`);
  }

  async bulkIndexDocuments(documents: SearchDocument[]) {
    if (documents.length === 0) return { indexed: 0 };
    const lines = documents.flatMap((doc) => [JSON.stringify({ index: { _index: this.config.index, _id: `${doc.type}:${doc.id}` } }), JSON.stringify(doc)]).join("\n") + "\n";
    const response = await this.request("/_bulk", { method: "POST", body: lines, headers: { "content-type": "application/x-ndjson" } });
    if (!response.ok) throw new Error(`Search bulk index failed: ${response.status} ${await response.text()}`);
    const json = await response.json() as { errors?: boolean };
    if (json.errors) throw new Error("Search bulk index reported item errors");
    return { indexed: documents.length };
  }

  async searchDocuments(workspaceId: string, query: string, type: SearchType = "all") {
    const body = {
      size: RESULT_LIMIT,
      query: {
        bool: {
          filter: [
            { term: { workspaceId } },
            { terms: { type: asSearchTypes(type) } },
          ],
          must: [
            { multi_match: { query, fields: ["title^4", "body^2", "excerpt", "meta"], fuzziness: "AUTO" } },
          ],
        },
      },
      sort: [{ _score: "desc" }, { updatedAt: "desc" }],
    };
    const response = await this.request(`/${encodeURIComponent(this.config.index)}/_search`, { method: "POST", body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Search query failed: ${response.status} ${await response.text()}`);
    const json = await response.json() as { hits?: { hits?: Array<{ _source?: SearchDocument }> } };
    return (json.hits?.hits ?? []).flatMap((hit) => hit._source ? [toSearchResult(hit._source)] : []);
  }

  private async request(path: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const headers = new Headers(init.headers);
    if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
    headers.set("accept", "application/json");
    if (this.config.apiKey) headers.set("authorization", `ApiKey ${this.config.apiKey}`);
    if (!this.config.apiKey && this.config.username && this.config.password) {
      headers.set("authorization", `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}`);
    }
    try {
      return await fetch(new URL(path, this.config.url), { ...init, headers, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function toSearchResult(doc: SearchDocument): SearchResult {
  return { type: doc.type, id: doc.id, title: doc.title, href: doc.href, excerpt: doc.excerpt, meta: doc.meta };
}

function getElasticConfig(): ElasticConfig | null {
  const url = process.env.WORKHUB_SEARCH_URL || process.env.ELASTICSEARCH_URL || process.env.OPENSEARCH_URL;
  if (!url) return null;
  return {
    url,
    index: process.env.WORKHUB_SEARCH_INDEX || DEFAULT_SEARCH_INDEX,
    apiKey: process.env.WORKHUB_SEARCH_API_KEY || process.env.ELASTICSEARCH_API_KEY || process.env.OPENSEARCH_API_KEY,
    username: process.env.WORKHUB_SEARCH_USERNAME || process.env.ELASTICSEARCH_USERNAME || process.env.OPENSEARCH_USERNAME,
    password: process.env.WORKHUB_SEARCH_PASSWORD || process.env.ELASTICSEARCH_PASSWORD || process.env.OPENSEARCH_PASSWORD,
    timeoutMs: Number(process.env.WORKHUB_SEARCH_TIMEOUT_MS ?? 5000),
  };
}

export class ElasticsearchSearchProvider implements SearchProvider {
  constructor(private readonly client: ElasticsearchClient, private readonly fallback: SearchProvider = new PostgresSearchProvider()) {}

  async search(userId: string, workspaceId: string, query: string, type: SearchType = "all") {
    await requireMembership(userId, workspaceId, "VIEWER");
    const q = query.trim();
    if (!q) return [];
    try {
      return await this.client.searchDocuments(workspaceId, q, type);
    } catch (error) {
      console.warn("Elasticsearch/OpenSearch search failed; falling back to bounded local provider", error);
      return this.fallback.search(userId, workspaceId, q, type);
    }
  }
}

export async function collectWorkspaceSearchDocuments(workspaceId: string): Promise<SearchDocument[]> {
  const documents: SearchDocument[] = [];

  const projects = await prisma.project.findMany({
    where: { workspaceId },
    include: { statuses: { orderBy: { position: "asc" } }, _count: { select: { issues: true, members: true, sprints: true } } },
  });
  for (const project of projects) {
    const workflow = project.statuses.map((status) => status.name).join(" ");
    documents.push({
      workspaceId,
      type: "project",
      id: project.id,
      title: `${project.key} ${project.name}`,
      href: `/p/${project.key}/issues`,
      excerpt: project.description || `${project._count.issues} work items · ${project.statuses.length} statuses · ${project._count.members} access members`,
      meta: "Project",
      body: textBody(project.description, workflow, metadataText(project.metadata)),
      updatedAt: project.updatedAt.toISOString(),
    });
  }

  const issues = await prisma.issue.findMany({
    where: { workspaceId, deletedAt: null },
    include: { project: true, labels: { include: { label: true } }, status: true, assignee: true, reporter: true, attachments: true },
  });
  for (const issue of issues) {
    const key = `${issue.project.key}-${issue.number}`;
    const body = textFromDoc(issue.description);
    const labels = issue.labels.map((l) => l.label.name).join(" ");
    const attachmentNames = issue.attachments.map((attachment) => attachment.filename).join(" ");
    documents.push({
      workspaceId,
      type: "issue",
      id: issue.id,
      title: `${key} ${issue.title}`,
      href: `/p/${issue.project.key}/issues/${key}`,
      excerpt: body.slice(0, 180) || `${issue.type} · ${issue.priority} · ${issue.status.name}`,
      meta: `${issue.project.name} · ${issue.status.name}`,
      body: textBody(body, issue.type, issue.priority, issue.status.name, labels, attachmentNames, metadataText(issue.customFields), issue.assignee?.name, issue.assignee?.email, issue.reporter.name, issue.reporter.email),
      updatedAt: issue.updatedAt.toISOString(),
    });
  }

  const pages = await prisma.page.findMany({
    where: { workspaceId, deletedAt: null },
    include: { space: true, labels: { include: { label: true } }, attachments: true },
  });
  for (const page of pages) {
    const body = textFromDoc(page.content);
    const labels = page.labels.map((l) => l.label.name).join(" ");
    const attachmentNames = page.attachments.map((attachment) => attachment.filename).join(" ");
    documents.push({
      workspaceId,
      type: "page",
      id: page.id,
      title: `${page.space.key}: ${page.title}`,
      href: `/s/${page.space.key}/pages/${page.id}`,
      excerpt: body.slice(0, 180) || page.space.name,
      meta: `Codex · ${page.space.name}`,
      body: textBody(body, page.space.key, page.space.name, labels, attachmentNames),
      updatedAt: page.updatedAt.toISOString(),
    });
  }

  const comments = await prisma.comment.findMany({
    where: { OR: [{ issue: { workspaceId, deletedAt: null } }, { page: { workspaceId, deletedAt: null } }] },
    include: { author: { select: { name: true, email: true } }, issue: { include: { project: true } }, page: { include: { space: true } } },
  });
  for (const comment of comments) {
    const body = textFromDoc(comment.body);
    if (comment.issue) {
      const key = `${comment.issue.project.key}-${comment.issue.number}`;
      documents.push({ workspaceId, type: "comment", id: comment.id, title: `Comment on ${key}: ${comment.issue.title}`, href: `/p/${comment.issue.project.key}/issues/${key}`, excerpt: body.slice(0, 180), meta: comment.author.name ?? comment.author.email, body, updatedAt: comment.updatedAt.toISOString() });
    } else if (comment.page) {
      documents.push({ workspaceId, type: "comment", id: comment.id, title: `Comment on ${comment.page.space.key}: ${comment.page.title}`, href: `/s/${comment.page.space.key}/pages/${comment.page.id}`, excerpt: body.slice(0, 180), meta: comment.author.name ?? comment.author.email, body, updatedAt: comment.updatedAt.toISOString() });
    }
  }

  const attachments = await prisma.attachment.findMany({
    where: { workspaceId, OR: [{ issue: { workspaceId, deletedAt: null } }, { page: { workspaceId, deletedAt: null } }] },
    include: { issue: { include: { project: true } }, page: { include: { space: true } } },
  });
  for (const attachment of attachments) {
    if (attachment.issue) {
      const key = `${attachment.issue.project.key}-${attachment.issue.number}`;
      documents.push({ workspaceId, type: "attachment", id: attachment.id, title: `${attachment.filename} on ${key}`, href: `/p/${attachment.issue.project.key}/issues/${key}`, excerpt: `${attachment.mimeType} · ${attachment.size} bytes`, meta: "Issue attachment", body: textBody(attachment.filename, attachment.mimeType, attachment.storageKey, attachment.issue.title), updatedAt: attachment.createdAt.toISOString() });
    } else if (attachment.page) {
      documents.push({ workspaceId, type: "attachment", id: attachment.id, title: `${attachment.filename} on ${attachment.page.space.key}: ${attachment.page.title}`, href: `/s/${attachment.page.space.key}/pages/${attachment.page.id}`, excerpt: `${attachment.mimeType} · ${attachment.size} bytes`, meta: "Codex attachment", body: textBody(attachment.filename, attachment.mimeType, attachment.storageKey, attachment.page.title), updatedAt: attachment.createdAt.toISOString() });
    }
  }

  return documents;
}

export async function rebuildWorkspaceSearchIndex(userId: string, workspaceId: string) {
  await requireMembership(userId, workspaceId, "ADMIN");
  const config = getElasticConfig();
  if (!config) throw new Error("WORKHUB_SEARCH_URL, ELASTICSEARCH_URL, or OPENSEARCH_URL is required to rebuild the external search index");
  const client = new ElasticsearchClient(config);
  await client.ensureIndex();
  const documents = await collectWorkspaceSearchDocuments(workspaceId);
  return client.bulkIndexDocuments(documents);
}

function createSearchProvider(): SearchProvider {
  const backend = (process.env.WORKHUB_SEARCH_BACKEND ?? "postgres").toLowerCase();
  const config = getElasticConfig();
  if ((backend === "elasticsearch" || backend === "opensearch") && config) {
    return new ElasticsearchSearchProvider(new ElasticsearchClient(config));
  }
  return new PostgresSearchProvider();
}

export const searchProvider: SearchProvider = createSearchProvider();
