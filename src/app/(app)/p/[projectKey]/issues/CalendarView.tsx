import { CalendarViewClient, type CalendarIssue } from "./CalendarViewClient";

type IssueItem = {
  id: string;
  number: number;
  title: string;
  priority: string;
  status?: { name?: string; category?: string } | null;
  dueDate?: Date | string | null;
};

export function CalendarView({
  projectKey,
  issues,
  monthParam,
}: {
  projectKey: string;
  issues: IssueItem[];
  monthParam?: string;
}) {
  // Normalize server data to plain-serializable shape for the client component
  const clientIssues: CalendarIssue[] = issues.map((i) => ({
    id: i.id,
    number: i.number,
    title: i.title,
    priority: i.priority,
    status: i.status ? { name: i.status.name, category: i.status.category } : null,
    dueDate: i.dueDate ? new Date(i.dueDate).toISOString() : null,
  }));

  return (
    <CalendarViewClient
      projectKey={projectKey}
      initialIssues={clientIssues}
      monthParam={monthParam}
    />
  );
}
