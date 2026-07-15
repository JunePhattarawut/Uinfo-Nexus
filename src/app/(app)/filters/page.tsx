import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";

export default async function FiltersPage() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) return <p>No active workspace</p>;
  const projects = await prisma.project.findMany({ where: { workspaceId: active.id }, orderBy: { name: "asc" }, select: { key: true, name: true, statuses: { select: { id: true, name: true, _count: { select: { issues: true } } } } } });
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div><h1 className="text-2xl font-bold">Filters</h1><p className="text-sm text-gray-500">Saved entry points for common issue views.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p) => (
          <section key={p.key} className="rounded-xl border bg-white p-4">
            <h2 className="font-bold">{p.name}</h2><p className="text-xs text-gray-500">{p.key}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/p/${p.key}/issues`} className="rounded border px-3 py-1 text-sm hover:bg-gray-50">All issues</Link>
              {p.statuses.map((s) => <Link key={s.id} href={`/p/${p.key}/issues?statusId=${s.id}`} className="rounded border px-3 py-1 text-sm hover:bg-gray-50">{s.name} ({s._count.issues})</Link>)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
