import Link from "next/link";

export default function OperationsPage() {
  const items = [
    { title: "Migration", text: "Discover, dry-run and import projects into Uinfo Nexus.", href: "/admin/migration" },
    { title: "Automation", text: "Worker-backed notifications and rule execution status.", href: "/admin/advanced" },
    { title: "Notifications", text: "Review unread operational alerts.", href: "/notifications" },
  ];
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><h1 className="text-2xl font-bold">Operations</h1><p className="text-sm text-gray-500">Operational command center for imports, automation and alerts.</p></div>
      <div className="grid gap-4 md:grid-cols-3">{items.map((item) => <Link key={item.href} href={item.href} className="rounded-xl border bg-white p-5 hover:border-blue-300 hover:shadow-sm"><h2 className="font-bold">{item.title}</h2><p className="mt-2 text-sm text-gray-500">{item.text}</p></Link>)}</div>
    </div>
  );
}
