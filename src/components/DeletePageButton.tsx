"use client";

export function DeletePageButton({
  action,
  title,
  hasChildren,
}: {
  action: () => Promise<void>;
  title: string;
  hasChildren: boolean;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const msg = hasChildren
          ? `Delete "${title}" and all its children? This cannot be undone.`
          : `Delete "${title}"? This cannot be undone.`;
        if (!confirm(msg)) e.preventDefault();
      }}
    >
      <button className="rounded-xl border border-red-200 px-3 py-1.5 text-[12px] font-bold text-red-600 hover:bg-red-50">
        🗑 Delete page
      </button>
    </form>
  );
}
