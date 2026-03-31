import { redirect } from "next/navigation";
import { auth, signOut } from "../../auth";
import { GmailSyncButton } from "./gmail-sync-button";

export default async function DashboardPage() {
  const session = await auth();
  const userEmail = session?.user?.email?.trim();
  const hasValidSession = Boolean(userEmail);

  if (!hasValidSession) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 py-12">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-emerald-700">
              Sesión iniciada
            </p>
            <h1 className="text-3xl font-semibold text-zinc-900">
              Dashboard
            </h1>
            <p className="text-sm text-zinc-600">
              Revisa los datos basicos de tu cuenta autenticada.
            </p>
          </div>

          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Cerrar sesión
            </button>
          </form>
        </div>

        <div className="mt-8 space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Nombre
            </p>
            <p className="mt-1 text-base text-zinc-900">
              {session.user?.name ?? "Sin nombre"}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Email
            </p>
            <p className="mt-1 text-base text-zinc-900">
              {userEmail}
            </p>
          </div>
        </div>

        <GmailSyncButton />
      </div>
    </main>
  );
}
