import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";

export default async function DashboardsPage() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) return <p>No active workspace</p>;
  const [projectCount, issueCount, doneCount, openCount] = await Promise.all([
    prisma.project.count({ where: { workspaceId: active.id } }),
    prisma.issue.count({ where: { project: { workspaceId: active.id } } }),
    prisma.issue.count({ where: { project: { workspaceId: active.id }, status: { category: "DONE" } } }),
    prisma.issue.count({ where: { project: { workspaceId: active.id }, status: { category: { not: "DONE" } } } }),
  ]);
  const cards = [{ label: "Projects", value: projectCount }, { label: "Issues", value: issueCount }, { label: "Done", value: doneCount }, { label: "Open", value: openCount }];
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div><h1 className="text-2xl font-bold">Dashboards</h1><p className="text-sm text-gray-500">Overview of delivery, compliance and workload.</p></div>
      <div className="grid gap-4 md:grid-cols-4">{cards.map((c) => <div key={c.label} className="rounded-xl border bg-white p-5"><p className="text-3xl font-bold text-blue-600">{c.value}</p><p className="text-sm text-gray-500">{c.label}</p></div>)}</div>
      <Link href="/" className="inline-flex rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white">Open workspace overview</Link>
    </div>
  );
}
