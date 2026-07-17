import { requireUser } from "@/lib/auth";
import { updateProfileAction, changePasswordAction } from "./actions";

export default async function ProfileSettingsPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      {/* Profile info */}
      <section className="rounded-2xl border border-card-border bg-card p-6">
        <h2 className="mb-4 text-[15px] font-semibold text-ink">Profile</h2>

        {/* Avatar preview */}
        <div className="mb-5 flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-xl font-bold text-white">
            {user.name?.[0]?.toUpperCase() ?? user.email[0].toUpperCase()}
          </span>
          <div>
            <p className="font-semibold text-ink">{user.name}</p>
            <p className="text-[13px] text-ink-secondary">{user.email}</p>
          </div>
        </div>

        <form action={updateProfileAction} className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-[13px] font-medium text-ink">
              Display name
            </label>
            <input
              id="name"
              name="name"
              defaultValue={user.name ?? ""}
              required
              className="w-full max-w-sm rounded-lg border border-card-border bg-page px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink">Email</label>
            <input
              value={user.email}
              disabled
              readOnly
              className="w-full max-w-sm rounded-lg border border-card-border bg-card-border/30 px-3 py-2 text-sm text-ink-secondary"
            />
            <p className="mt-1 text-[11.5px] text-ink-secondary">Email cannot be changed.</p>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
          >
            Save changes
          </button>
        </form>
      </section>

      {/* Change password */}
      <section className="rounded-2xl border border-card-border bg-card p-6">
        <h2 className="mb-1 text-[15px] font-semibold text-ink">Change password</h2>
        <p className="mb-4 text-[13px] text-ink-secondary">
          Use at least 8 characters with a mix of letters and numbers.
        </p>
        <form action={changePasswordAction} className="space-y-4">
          <div>
            <label htmlFor="current" className="mb-1 block text-[13px] font-medium text-ink">
              Current password
            </label>
            <input
              id="current"
              name="current"
              type="password"
              required
              autoComplete="current-password"
              className="w-full max-w-sm rounded-lg border border-card-border bg-page px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label htmlFor="next" className="mb-1 block text-[13px] font-medium text-ink">
              New password
            </label>
            <input
              id="next"
              name="next"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full max-w-sm rounded-lg border border-card-border bg-page px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="mb-1 block text-[13px] font-medium text-ink">
              Confirm new password
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full max-w-sm rounded-lg border border-card-border bg-page px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
          >
            Update password
          </button>
        </form>
      </section>
    </div>
  );
}
