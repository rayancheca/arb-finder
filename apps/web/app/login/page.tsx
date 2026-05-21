import { loginAction } from "./actions";

interface LoginPageProps {
  readonly searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const showError = params?.error === "1";

  return (
    <main className="min-h-screen bg-bg text-text flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-md border border-border bg-surface p-6 shadow-sm">
        <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-text-faint">
          arb-finder
        </div>
        <h1 className="mb-4 text-lg font-semibold tracking-tight">
          Admin sign-in
        </h1>
        <p className="mb-4 text-[12px] text-text-dim">
          Single-user terminal. Paste your admin token to continue.
        </p>

        <form action={loginAction} className="flex flex-col gap-3">
          <label
            htmlFor="token"
            className="text-[11px] uppercase tracking-[0.08em] text-text-dim"
          >
            Admin token
          </label>
          <input
            id="token"
            name="token"
            type="password"
            autoComplete="off"
            required
            className="mono-num rounded-md border border-border bg-surface-raised px-3 py-2 text-[13px] outline-none focus:border-accent"
          />

          {showError && (
            <div className="text-[12px] text-loss" role="alert">
              Invalid token. Try again.
            </div>
          )}

          <button
            type="submit"
            className="mt-1 rounded-md bg-accent px-3 py-2 text-[12px] font-semibold text-bg hover:opacity-90"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
