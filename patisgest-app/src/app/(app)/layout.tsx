import type { ReactNode } from "react";
import { ROLE_LABELS, requireSession } from "@/lib/auth";
import { logout } from "@/lib/actions-auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireSession();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="text-xl font-extrabold text-violet-900">
            🧁 PâtisGest
          </span>
          <span className="text-sm text-slate-500">{ctx.clientNom}</span>
          <span className="flex-1" />
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">
            {ROLE_LABELS[ctx.role]}
          </span>
          <span className="text-xs text-slate-500">{ctx.email}</span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              Déconnexion
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
