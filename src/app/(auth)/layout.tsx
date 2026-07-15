export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="inline-block rounded-lg bg-accent px-3 py-1 font-heading text-lg font-bold tracking-tight text-white">
            Uinfo Nexus
          </span>
          <p className="mt-2 text-sm text-ink-secondary">Track work. Keep knowledge.</p>
        </div>
        {children}
      </div>
    </main>
  );
}
