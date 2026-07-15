import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { listNotifications } from "@/lib/notifications";

export default async function NotificationsPage() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) return <p>No active workspace</p>;
  const notifications = await listNotifications(user.id, active.id);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Notifications</h1>
      <ul className="space-y-2">
        {notifications.map((n) => (
          <li key={n.id} className="rounded-xl border bg-white p-4 text-sm">
            <div className="flex items-center justify-between">
              <b>{n.type}</b>
              <span className="text-xs text-gray-500">{new Date(n.createdAt).toLocaleString()}</span>
            </div>
            <pre className="mt-2 whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-600">{JSON.stringify(n.payload, null, 2)}</pre>
          </li>
        ))}
        {notifications.length === 0 && <li className="text-sm text-gray-500">No notifications.</li>}
      </ul>
    </div>
  );
}
