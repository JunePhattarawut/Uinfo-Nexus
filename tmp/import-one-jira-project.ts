import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { importJiraFixture, type JiraIssue, type JiraProject } from "../src/modules/migration/jira";

const site = (process.env.JIRA_SITE_URL ?? "").replace(/\/$/, "");
const email = process.env.JIRA_EMAIL;
const token = process.env.JIRA_API_TOKEN;
const databaseUrl = process.env.DATABASE_URL;
const projectKey = process.env.JIRA_TEST_PROJECT ?? "RLGA";
const maxResults = Number(process.env.JIRA_TEST_LIMIT ?? "1");

if (!site || !email || !token || !databaseUrl) {
  throw new Error("Missing JIRA_SITE_URL, JIRA_EMAIL, JIRA_API_TOKEN, or DATABASE_URL");
}

const auth = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function jira<T>(path: string): Promise<T> {
  const response = await fetch(`${site}${path}`, { headers: { Authorization: auth, Accept: "application/json" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Jira API ${response.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text) as T;
}

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  const workspace = await prisma.workspace.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user || !workspace) throw new Error("No local Workhub user/workspace found. Seed or register first.");

  const project = await jira<JiraProject>(`/rest/api/3/project/${encodeURIComponent(projectKey)}`);
  const params = new URLSearchParams({
    jql: `project="${projectKey}" ORDER BY created ASC`,
    maxResults: String(maxResults),
    fields: [
      "summary",
      "description",
      "issuetype",
      "priority",
      "status",
      "assignee",
      "reporter",
      "labels",
      "duedate",
      "parent",
      "attachment",
      "comment",
      "customfield_10016",
      "customfield_10026",
    ].join(","),
  });
  const search = await jira<{ issues: JiraIssue[]; isLast?: boolean; nextPageToken?: string }>(`/rest/api/3/search/jql?${params.toString()}`);
  if (!search.issues.length) throw new Error(`No Jira issues found for ${projectKey}`);

  const job = await importJiraFixture(user.id, workspace.id, {
    sourceUrl: site,
    project,
    issues: search.issues,
    dryRun: false,
  });

  const localProject = await prisma.project.findFirst({
    where: { workspaceId: workspace.id, key: projectKey },
    include: {
      statuses: { orderBy: { position: "asc" } },
      issues: { orderBy: { number: "asc" }, include: { status: true } },
    },
  });
  const mappings = await prisma.externalMapping.findMany({ where: { workspaceId: workspace.id, source: "JIRA", entityType: "issue", sourceKey: { in: search.issues.map((i) => i.key) } } });

  console.log(JSON.stringify({
    importedProject: { key: project.key, name: project.name },
    job: { id: job.id, status: job.status, errors: job.errors.length },
    fetchedIssueKeys: search.issues.map((i) => i.key),
    localProject: localProject ? {
      key: localProject.key,
      name: localProject.name,
      statuses: localProject.statuses.map((s) => `${s.name}:${s.category}`),
      issues: localProject.issues.map((i) => ({ key: `${localProject.key}-${i.number}`, title: i.title, status: i.status.name, priority: i.priority })),
    } : null,
    mappings: mappings.map((m) => ({ sourceKey: m.sourceKey, localType: m.localType, localId: m.localId })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
