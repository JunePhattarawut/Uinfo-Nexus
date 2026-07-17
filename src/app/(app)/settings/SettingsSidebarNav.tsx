"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/settings/profile",   label: "Profile",   icon: "👤" },
  { href: "/settings/workspace", label: "Workspace", icon: "🏢" },
  { href: "/settings/members",   label: "Members",   icon: "👥" },
];

const SUPER_ADMIN_NAV = [
  { href: "/admin/users", label: "All Users",   icon: "🔐" },
  { href: "/admin",       label: "Admin Panel", icon: "⚙️" },
];

export function SettingsSidebarNav({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname();

  const renderLink = (item: { href: string; label: string; icon: string }) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
          isActive
            ? "bg-accent-soft text-accent-soft-text font-semibold"
            : "text-ink-secondary hover:bg-card hover:text-ink"
        }`}
      >
        <span className="text-sm">{item.icon}</span>
        {item.label}
      </Link>
    );
  };

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(renderLink)}

      {isOwner && (
        <>
          <div className="mx-3 my-2 border-t border-card-border" />
          <p className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-ink-secondary/50">
            Super Admin
          </p>
          {SUPER_ADMIN_NAV.map(renderLink)}
        </>
      )}
    </nav>
  );
}
