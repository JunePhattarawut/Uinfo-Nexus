import Link from "next/link";
import { loginAction, googleSignInAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; registered?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="mb-5 text-lg font-semibold">Sign in to Uinfo Nexus</h1>

      {params.registered && (
        <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Account created. Sign in to continue.
        </p>
      )}
      {params.error === "1" && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Email or password doesn&apos;t match. Try again.
        </p>
      )}
      {params.error === "access_denied" && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Your Google account is not authorised to access this workspace.
          Contact your administrator.
        </p>
      )}

      {/* Google OAuth */}
      <form action={googleSignInAction}>
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-3 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          {/* Google "G" SVG */}
          <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
      </form>

      <div className="my-4 flex items-center gap-3">
        <hr className="flex-1 border-gray-200" />
        <span className="text-xs text-gray-400">or sign in with email</span>
        <hr className="flex-1 border-gray-200" />
      </div>

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
