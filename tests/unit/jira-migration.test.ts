import { describe, expect, it } from "vitest";
import {
  adfToTiptapDoc,
  buildJiraIssueImportPlan,
  jiraIssueTypeToWorkhub,
  jiraPriorityToWorkhub,
  normalizeJiraProjectKey,
} from "@/modules/migration/jira";

describe("jira migration mapping", () => {
  it("normalizes Jira project keys into Workhub-safe uppercase keys", () => {
    expect(normalizeJiraProjectKey("cti")).toBe("CTI");
    expect(normalizeJiraProjectKey("risk-assessment")).toBe("RISKASSESSME");
  });

  it("maps common Jira issue types and priorities to Workhub enums", () => {
    expect(jiraIssueTypeToWorkhub("Epic")).toBe("EPIC");
    expect(jiraIssueTypeToWorkhub("Sub-task")).toBe("SUBTASK");
    expect(jiraIssueTypeToWorkhub("Improvement")).toBe("TASK");
    expect(jiraPriorityToWorkhub("Highest")).toBe("HIGHEST");
    expect(jiraPriorityToWorkhub("Minor")).toBe("LOW");
  });

  it("converts Atlassian Document Format paragraphs, headings, bullets and code blocks to Tiptap-like JSON", () => {
    const doc = adfToTiptapDoc({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Scope" }] },
        { type: "paragraph", content: [{ type: "text", text: "Review Jira data" }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Issues" }] }] }] },
        { type: "codeBlock", content: [{ type: "text", text: "GET /rest/api/3/search" }] },
        { type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Status" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "ผ่าน" }] }] }] }] },
      ],
    });

    expect(doc).toMatchObject({ type: "doc" });
    const jsonDoc = doc as { content: Array<{ type: string }> };
    expect(jsonDoc.content.map((node) => node.type)).toEqual(["heading", "paragraph", "bulletList", "codeBlock", "table"]);
    expect(JSON.stringify(doc)).toContain("Review Jira data");
  });

  it("builds an import plan that preserves source metadata and detects unmapped users/statuses", () => {
    const issue = {
      id: "10001",
      key: "CTI-7",
      self: "https://uin-gc.atlassian.net/rest/api/3/issue/10001",
      fields: {
        summary: "Investigate phishing alert",
        description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Need triage" }] }] },
        issuetype: { name: "Task" },
        priority: { name: "High" },
        status: { id: "3", name: "In Review", statusCategory: { key: "indeterminate" } },
        assignee: { accountId: "acc-1", displayName: "Analyst", emailAddress: "analyst@example.com" },
        reporter: { accountId: "acc-2", displayName: "Reporter", emailAddress: "reporter@example.com" },
        labels: ["security", "phishing"],
        duedate: "2026-08-01",
        customfield_10016: 3,
      },
    };

    const plan = buildJiraIssueImportPlan(issue, {
      projectKey: "CTI",
      projectId: "project-1",
      statusMap: { "To Do": "status-1" },
      userMap: { "acc-2": "user-reporter" },
      fallbackReporterId: "fallback-user",
    });

    expect(plan.issue.title).toBe("Investigate phishing alert");
    expect(plan.issue.type).toBe("TASK");
    expect(plan.issue.priority).toBe("HIGH");
    expect(plan.issue.reporterId).toBe("user-reporter");
    expect(plan.issue.assigneeId).toBeNull();
    expect(plan.issue.customFields).toMatchObject({ originalJiraKey: "CTI-7", originalJiraId: "10001", jiraStatusName: "In Review", jiraStoryPoints: 3 });
    expect(plan.labels).toEqual(["security", "phishing"]);
    expect(plan.warnings).toContain("Unmapped Jira status: In Review");
    expect(plan.warnings).toContain("Unmapped Jira assignee: acc-1");
  });
});
