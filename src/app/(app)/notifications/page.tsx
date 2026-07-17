import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { listNotifications } from "@/lib/notifications";
import { markAllReadAction, markOneReadAction } from "./actions";

type Payload = Record<string, unknown>;

function formatRelative(date: Date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function notificationMeta(type: string, payload: Payload): {
  icon: string;
  message: string;
  href?: string;
} {
  const key = String(payload.key ?? "");
  const title = String(payload.title ?? "");
  const projectKey = key.split("-")[0] ?? "";

  switch (type) {
    case "assigned":
      return {
        icon: "👤",
        message: `You were assigned to ${key}${title ? ` — ${title}` : ""}`,
        href: projectKey ? `/p/${projectKey}/issues/${key}` : undefined,
      };
    case "mentioned":
      return {
        icon: "💬",
        message: `You were mentioned in ${key}${title ? ` — ${title}` : ""}`,
        href: projectKey ? `/p/${projectKey}/issues/${key}` : undefined,
      };
    case "commented":
      return {
        icon: "🗨️",
        message: `New comment on ${key}${title ? ` — ${title}` : ""}`,
        href: projectKey ? `/p/${projectKey}/issues/${key}` : undefined,
      };
    case "status_changed":
      return {
        icon: "🔄",
        message: `${key} status changed${payload.to ? ` → ${payload.to}` : ""}`,
        href: projectKey ? `/p/${projectKey}/issues/${key}` : undefined,
      };
    default:
      return {
        icon: "🔔",
        message: title || key || type,
        href: projectKey && key ? `/p/${projectKey}/issues/${key}` : undefined,
      };
  }
}

export default async function NotificationsPage() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) return <p>No active workspace.</p>;

  const notifications = await listNotifications(user.id, active.id);
  const unread = notifications.filter((n) => !n.readAt);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Notifications</h1>
          {unread.length > 0 && (
            <p className="mt-0.5 text-[13px] text-ink-secondary">
              {unread.length} unread
            </p>
          )}
        </div>
        {unread.length > 0 && (
          <form action={markAllReadAction}>
            <button
              type="submit"
              className="rounded-lg border border-card-border bg-card px-3.5 py-2 text-[12.5px] font-semibold text-ink-secondary hover:bg-page"
            >
              Mark all as read
            </button>
          </form>
        )}
      </div>

      {/* List */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-card-border bg-card py-16 text-center">
          <span className="text-4xl">🔔</span>
          <p className="text-[14px] font-semibold text-ink">All caught up</p>
          <p className="text-[13px] text-ink-secondary">No notifications yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {notifications.map((n) => {
            const payload = (n.payload ?? {}) as Payload;
            const { icon, message, href } = notificationMeta(n.type, payload);
            const isUnread = !n.readAt;
            const content = (
              <div className={`group flex items-start gap-3.5 rounded-xl border px-4 py-3.5 transition-colors ${
                isUnread
                  ? "border-accent/20 bg-accent-soft hover:bg-accent-soft/70"
                  : "border-card-border bg-card hover:bg-page"
              }`}>
                {/* Unread dot */}
                <span className="mt-1 flex h-2 w-2 shrink-0 items-center justify-center">
                  {isUnread && (
                    <span className="h-2 w-2 rounded-full bg-accent" />
                  )}
                </span>

                <span className="mt-0.5 text-xl leading-none">{icon}</span>

                <div className="min-w-0 flex-1">
                  <p className={`text-[13.5px] leading-snug ${isUnread ? "font-semibold text-ink" : "font-medium text-ink-secondary"}`}>
                    {message}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ink-secondary/60">
                    {formatRelative(new Date(n.createdAt))}
                  </p>
                </div>

                {isUnread && (
                  <form action={markOneReadAction.bind(null, n.id)} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="submit"
                      title="Mark as read"
                      className="rounded-md p-1.5 text-[11px] text-ink-secondary hover:bg-card-border"
                    >
                      ✓
                    </button>
                  </form>
                )}
              </div>
            );

            return (
              <li key={n.id}>
                {href ? (
                  <Link href={href} className="block">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
