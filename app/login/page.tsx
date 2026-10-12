import { signInWithPassword } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next = "/admin", error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-4 py-24">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      {error && <p className="mt-4 rounded-ui bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      <form action={signInWithPassword} className="mt-6 space-y-3">
        <input type="hidden" name="next" value={next} />
        <div className="space-y-1">
          <label htmlFor="email" className="block text-xs text-muted">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="h-10 w-full rounded-ui border border-border bg-surface px-3 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="block text-xs text-muted">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-10 w-full rounded-ui border border-border bg-surface px-3 text-sm"
          />
        </div>
        <button className="h-10 w-full rounded-ui bg-primary text-sm font-medium text-primary-fg">Sign in</button>
      </form>
      <p className="mt-6 text-xs text-muted">Accounts are created by your administrator.</p>
    </main>
  );
}
