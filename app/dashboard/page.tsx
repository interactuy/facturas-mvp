import { redirect } from "next/navigation";
import { auth, signOut } from "../../auth";
import { isMailExtractionStatus } from "../../lib/mail-extractions/status";
import { prisma } from "../../lib/prisma";
import { GmailSyncButton } from "./gmail-sync-button";
import { MailExtractionsTable } from "./mail-extractions-table";

export default async function DashboardPage() {
  const session = await auth();
  const userEmail = session?.user?.email?.trim();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  if (!userEmail) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: {
      email: userEmail.toLowerCase(),
    },
    select: {
      id: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  const extractionRows = await prisma.mailExtraction.findMany({
    where: {
      userId: user.id,
      emailMessage: {
        internalDate: {
          gte: thirtyDaysAgo,
        },
      },
    },
    include: {
      emailMessage: {
        select: {
          subject: true,
          fromEmail: true,
          internalDate: true,
        },
      },
    },
  });

  const tableRows = extractionRows.map((row) => ({
    id: row.id,
    remitente: row.issuerEmail ?? row.emailMessage.fromEmail ?? "-",
    asunto: row.emailMessage.subject ?? "-",
    fecha: row.emailMessage.internalDate?.toISOString() ?? null,
    vencimiento: row.dueDate?.toISOString() ?? null,
    monto: row.amountValue ? Number(row.amountValue) : null,
    moneda: row.currency,
    vencimientoEstimado: row.dueDateEstimated,
    categoria: row.category,
    status: isMailExtractionStatus(row.status) ? row.status : "pendiente",
  }));

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 py-12">
      <div className="w-full max-w-6xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
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
              {session?.user?.name ?? "Sin nombre"}
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

        <section className="mt-8 rounded-xl border border-zinc-200">
          <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-4">
            <h2 className="text-base font-semibold text-zinc-900">
              Extracciones de mails
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Datos de pago extraidos directamente del cuerpo del email.
            </p>
          </div>

          {extractionRows.length === 0 ? (
            <div className="px-5 py-10 text-sm text-zinc-600">
              Todavia no hay extracciones. Usa &quot;Extraer datos de mails&quot;
              para generar resultados.
            </div>
          ) : (
            <MailExtractionsTable rows={tableRows} />
          )}
        </section>
      </div>
    </main>
  );
}
