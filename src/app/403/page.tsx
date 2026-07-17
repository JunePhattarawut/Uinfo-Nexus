import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page">
      <div className="mx-auto max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-3xl">🔒</div>
        <h1 className="font-heading text-2xl font-extrabold text-ink">Access Denied</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          You don&apos;t have permission to view this page.
          Contact your workspace Owner or Admin to request access.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white hover:opacity-90">
            Go to Home
          </Link>
          <Link href="/settings/profile" className="rounded-xl border border-card-border bg-card px-5 py-2.5 text-sm font-bold text-ink hover:border-accent">
            My Profile
          </Link>
        </div>
      </div>
    </div>
  );
}
