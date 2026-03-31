import { redirect } from "next/navigation";
import { auth, signIn } from "../../auth";

export default async function LoginPage() {
  const session = await auth();
  const userEmail = session?.user?.email?.trim();
  const hasValidSession = Boolean(userEmail);

  if (hasValidSession) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-zinc-900">Ingresar</h1>
          <p className="text-sm text-zinc-600">
            Conecta tu cuenta para continuar con el panel.
          </p>
        </div>

        <form
          className="mt-8"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Continuar con Google
          </button>
        </form>
      </div>
    </main>
  );
}
