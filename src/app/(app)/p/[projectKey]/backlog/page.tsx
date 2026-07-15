import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import * as agile from "@/modules/agile/service";
import { completeSprintAction, createSprintAction, moveToSprintAction, startSprintAction } from "./actions";

function IssueRow({ issue, projectKey, sprintOptions }: { issue: any; projectKey: string; sprintOptions: { id: string; name: string; state: string }[] }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border bg-white p-3 text-sm">
      <div>
        <Link href={`/p/${projectKey}/issues/${agile.issueDisplayKey(issue)}`} className="font-semibold text-[var(--wh-accent)]">{agile.issueDisplayKey(issue)}</Link>
        <span className="ml-2">{issue.title}</span>
        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs">{issue.storyPoints ?? 0} pts</span>
        {issue.parentId && <span className="ml-1 rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-700">child</span>}
      </div>
      <div className="flex gap-1">
        <form action={moveToSprintAction.bind(null, projectKey, issue.id, null)}>
          <button className="rounded border px-2 py-1 text-xs">Backlog</button>
        </form>
        {sprintOptions.filter((s) => s.state !== "CLOSED").map((s) => (
          <form key={s.id} action={moveToSprintAction.bind(null, projectKey, issue.id, s.id)}>
            <button className="rounded border px-2 py-1 text-xs">→ {s.name}</button>
          </form>
        ))}
      </div>
    </li>
  );
}

export default async function BacklogPage({ params }: { params: Promise<{ projectKey: string }> }) {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  const { projectKey } = await params;
  if (!active) return <p>No active workspace</p>;
  const board = await agile.getAgileBoard(user.id, active.id, projectKey);
  const createSprint = createSprintAction.bind(null, board.project.key, board.project.id);
  const sprintOptions = board.project.sprints.map((s) => ({ id: s.id, name: s.name, state: s.state }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{board.project.key} backlog</h1>
          <p className="text-sm text-gray-500">Uinfo Nexus Agile layer: backlog, sprints, points, epic rollups.</p>
        </div>
        <Link href={`/p/${board.project.key}/issues`} className="rounded border px-3 py-2 text-sm">Board</Link>
      </div>

      <details className="rounded-xl border bg-white p-4">
        <summary className="cursor-pointer font-semibold">Create sprint</summary>
        <form action={createSprint} className="mt-4 grid gap-3 md:grid-cols-2">
          <input name="name" required placeholder="Sprint name" className="rounded border px-3 py-2" />
          <input name="goal" placeholder="Goal" className="rounded border px-3 py-2" />
          <input name="startDate" type="date" className="rounded border px-3 py-2" />
          <input name="endDate" type="date" className="rounded border px-3 py-2" />
          <button className="rounded bg-[var(--wh-accent)] px-3 py-2 font-medium text-white">Create sprint</button>
        </form>
      </details>

      <section className="rounded-xl border bg-gray-50 p-4">
        <h2 className="mb-3 font-semibold">Backlog <span className="text-xs text-gray-500">{board.backlog.length}</span></h2>
        <ul className="space-y-2">
          {board.backlog.map((issue) => <IssueRow key={issue.id} issue={issue} projectKey={board.project.key} sprintOptions={sprintOptions} />)}
          {board.backlog.length === 0 && <li className="text-sm text-gray-500">Backlog empty.</li>}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">Sprints</h2>
        {board.project.sprints.map((sprint) => {
          const issues = board.sprintIssues.filter((i) => i.sprintId === sprint.id);
          return (
            <div key={sprint.id} className="rounded-xl border bg-white p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{sprint.name} <span className="text-xs text-gray-500">{sprint.state}</span></h3>
                  <p className="text-sm text-gray-500">{sprint.goal}</p>
                  <p className="text-xs text-gray-500">Total: {board.sprintTotals.get(sprint.id) ?? 0} pts · {issues.length} issues</p>
                </div>
                <div className="flex gap-2">
                  {sprint.state === "FUTURE" && <form action={startSprintAction.bind(null, board.project.key, sprint.id)}><button className="rounded border px-2 py-1 text-xs">Start</button></form>}
                  {sprint.state === "ACTIVE" && <form action={completeSprintAction.bind(null, board.project.key, sprint.id)}><button className="rounded border px-2 py-1 text-xs">Complete</button></form>}
                </div>
              </div>
              <ul className="space-y-2">{issues.map((issue) => <IssueRow key={issue.id} issue={issue} projectKey={board.project.key} sprintOptions={sprintOptions} />)}</ul>
            </div>
          );
        })}
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-semibold">Epic rollups</h2>
        <ul className="space-y-2 text-sm">
          {board.epicRollups.map(({ epic, totalChildren, doneChildren }) => <li key={epic.id} className="rounded border p-2"><b>{agile.issueDisplayKey(epic)}</b> {epic.title}: {doneChildren}/{totalChildren} children done</li>)}
          {board.epicRollups.length === 0 && <li className="text-gray-500">No epics.</li>}
        </ul>
      </section>
    </div>
  );
}
