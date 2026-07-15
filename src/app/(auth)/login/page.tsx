import Link from "next/link";
import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; registered?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-lg font-semibold">Sign in</h1>

      {params.registered && (
        <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Account created. Sign in to continue.
        </p>
      )}
      {params.error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Email or password doesn&apos;t match. Try again.
        </p>
      )}

      <form action={loginAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--wh-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--wh-accent)]"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--wh-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--wh-accent)]"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-[var(--wh-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--wh-accent-strong)]"
        >
          Sign in
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-500">
        New here?{" "}
        <Link href="/register" className="font-medium text-[var(--wh-accent)] hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
