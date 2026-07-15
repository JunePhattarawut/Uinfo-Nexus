import Link from "next/link";
import { registerAction } from "./actions";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-lg font-semibold">Create your account</h1>

      {params.error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>
      )}

      <form action={registerAction} className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--wh-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--wh-accent)]"
          />
        </div>
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
            Password <span className="font-normal text-gray-400">(8+ characters)</span>
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--wh-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--wh-accent)]"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-[var(--wh-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--wh-accent-strong)]"
        >
          Create account
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[var(--wh-accent)] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
