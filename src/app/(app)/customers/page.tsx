import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import * as workspaceService from "@/modules/workspace/service";

export default async function CustomersPage() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) return <p>No active workspace</p>;
  const members = await workspaceService.listMembers(user.id, active.id);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><h1 className="text-2xl font-bold">Customers</h1><p className="text-sm text-gray-500">For this internal Uinfo Nexus workspace, customers map to workspace users/stakeholders.</p></div>
      <div className="rounded-xl border bg-white"><ul className="divide-y">{members.map((m) => <li key={m.id} className="flex items-center justify-between p-4"><div><p className="font-semibold">{m.user.name}</p><p className="text-sm text-gray-500">{m.user.email}</p></div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">{m.role}</span></li>)}</ul></div>
    </div>
  );
}
