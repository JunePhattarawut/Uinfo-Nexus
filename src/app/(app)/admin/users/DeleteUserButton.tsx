"use client";

import { deleteUserAction } from "./actions";

export function DeleteUserButton({ userId, name }: { userId: string; name: string }) {
  return (
    <form
      action={deleteUserAction}
      onSubmit={(e) => {
        if (!confirm(`Delete "${name}" permanently? This cannot be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
      >
        Delete
      </button>
    </form>
  );
}
