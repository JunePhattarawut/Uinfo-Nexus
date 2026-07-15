import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import { createSpaceAction } from "./actions";

export default async function SpacesPage() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);

  if (!active) return <p>No active workspace</p>;

  const spaces = await prisma.space.findMany({
    where: { workspaceId: active.id },
    orderBy: { name: "asc" },
    include: {
      pages: {
        where: { parentId: null, deletedAt: null },
        orderBy: { rank: "asc" },
        select: { id: true, title: true, updatedAt: true },
        take: 6,
      },
      _count: { select: { pages: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-blue-700">Codex</p>
          <h1 className="mt-1 text-3xl font-bold">Spaces</h1>
          <p className="mt-1 text-sm text-gray-500">Knowledge spaces and page trees are still backed by the live database.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b bg-gray-50 px-5 py-4">
            <h2 className="text-[15px] font-bold text-gray-900">Existing spaces</h2>
          </div>
          <div className="divide-y">
            {spaces.map((space) => (
              <article key={space.id} className="p-5 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link href={`/s/${space.key}`} className="text-lg font-bold text-gray-900 hover:text-blue-700">
                      {space.name}
                    </Link>
                    <p className="mt-1 text-sm text-gray-500">
                      {space.key} · {space._count.pages} pages{space.description ? ` · ${space.description}` : ""}
                    </p>
                  </div>
                  <Link href={`/s/${space.key}`} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold text-gray-900 hover:bg-blue-50 hover:text-blue-700">
                    Open →
                  </Link>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {space.pages.map((page) => (
                    <Link key={page.id} href={`/s/${space.key}/pages/${page.id}`} className="rounded-lg border bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900 hover:border-blue-300 hover:bg-blue-50">
                      📄 {page.title}
                    </Link>
                  ))}
                  {!space.pages.length ? <p className="rounded-lg border border-dashed bg-gray-50 px-3 py-2 text-sm text-gray-500">No top-level pages yet.</p> : null}
                </div>
              </article>
            ))}
            {!spaces.length ? <p className="p-8 text-center text-sm text-gray-500">No spaces yet.</p> : null}
          </div>
        </section>

        <aside className="h-fit rounded-xl border bg-white p-5">
          <h2 className="text-[15px] font-bold text-gray-900">Create space</h2>
          <form action={createSpaceAction} className="mt-4 space-y-3">
            <input name="key" required placeholder="KEY (e.g. TEAM)" className="w-full rounded-lg border bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-600" />
            <input name="name" required placeholder="Space name" className="w-full rounded-lg border bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-600" />
            <textarea name="description" placeholder="Description" className="min-h-24 w-full rounded-lg border bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-600" />
            <button className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-blue-700">Create space</button>
          </form>
        </aside>
      </div>
    </div>
  );
}
