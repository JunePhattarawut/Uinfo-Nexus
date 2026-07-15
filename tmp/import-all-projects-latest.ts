import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { importJiraFixture, type JiraIssue, type JiraProject } from "../src/modules/migration/jira";

const site = (process.env.JIRA_SITE_URL ?? "").replace(/\/$/, "");
const email = process.env.JIRA_EMAIL;
const token = process.env.JIRA_API_TOKEN;
const databaseUrl = process.env.DATABASE_URL;
const perProjectLimit = Number(process.env.JIRA_IMPORT_LIMIT ?? "10");
const orderBy = process.env.JIRA_IMPORT_ORDER_BY ?? "updated DESC";

if (!site || !email || !token || !databaseUrl) {
  throw new Error("Missing JIRA_SITE_URL, JIRA_EMAIL, JIRA_API_TOKEN, or DATABASE_URL");
}

const auth = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

type ProjectSearchResponse = { values: JiraProject[]; startAt: number; maxResults: number; total: number; isLast?: boolean };

async function jira<T>(path: string): Promise<T> {
  const response = await fetch(`${site}${path}`, { headers: { Authorization: auth, Accept: "application/json" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Jira API ${response.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text) as T;
}

async function getProjects() {
  const params = new URLSearchParams({ maxResults: "50", startAt: "0", orderBy: "name", expand: "lead" });
  const result = await jira<ProjectSearchResponse>(`/rest/api/3/project/search?${params.toString()}`);
  return result.values;
}

async function getIssues(projectKey: string) {
  const params = new URLSearchParams({
    jql: `project="${projectKey}" ORDER BY ${orderBy}`,
    maxResults: String(perProjectLimit),
    fields: [
      "summary",
      "description",
      "issuetype",
      "priority",
      "status",
      "assignee",
      "reporter",
      "creator",
      "labels",
      "created",
      "updated",
      "duedate",
      "parent",
      "attachment",
      "comment",
      "issuelinks",
      "subtasks",
      "customfield_10016",
      "customfield_10026",
      "customfield_11432",
      "customfield_11808",
      "customfield_10019",
    ].join(","),
  });
  const search = await jira<{ issues: JiraIssue[]; total?: number }>(`/rest/api/3/search/jql?${params.toString()}`);
  return search.issues;
}

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  const workspace = await prisma.workspace.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user || !workspace) throw new Error("No local Workhub user/workspace found. Seed or register first.");

  const projects = await getProjects();
  const results: Array<{ key: string; name: string; fetched: number; imported: number; jobId?: string; status?: string; errors?: number; issueKeys?: string[]; error?: string }> = [];

  for (const project of projects) {
    try {
      const issues = await getIssues(project.key);
      if (issues.length === 0) {
        results.push({ key: project.key, name: project.name, fetched: 0, imported: 0, status: "SKIPPED_EMPTY", issueKeys: [] });
        continue;
      }
      const job = await importJiraFixture(user.id, workspace.id, {
        sourceUrl: site,
        project,
        issues,
        dryRun: false,
      });
      results.push({
        key: project.key,
        name: project.name,
        fetched: issues.length,
        imported: issues.length,
        jobId: job.id,
        status: job.status,
        errors: job.errors.length,
        issueKeys: issues.map((issue) => issue.key),
      });
    } catch (error) {
      results.push({ key: project.key, name: project.name, fetched: 0, imported: 0, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const counts = await prisma.project.findMany({
    where: { workspaceId: workspace.id, key: { not: "DEMO" } },
    orderBy: { name: "asc" },
    select: { key: true, name: true, _count: { select: { issues: true } } },
  });

  const summary = {
    site,
    perProjectLimit,
    orderBy,
    projectCount: projects.length,
    importedProjects: results.filter((result) => result.imported > 0).length,
    skippedEmptyProjects: results.filter((result) => result.status === "SKIPPED_EMPTY").length,
    failedProjects: results.filter((result) => result.error).length,
    totalFetched: results.reduce((sum, result) => sum + result.fetched, 0),
    totalImported: results.reduce((sum, result) => sum + result.imported, 0),
    results,
    localCounts: counts.map((project) => ({ key: project.key, name: project.name, issues: project._count.issues })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
