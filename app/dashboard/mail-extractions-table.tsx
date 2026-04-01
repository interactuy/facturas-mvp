"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MailExtractionStatus } from "../../lib/mail-extractions/status";

type MailExtractionRow = {
  id: string;
  remitente: string;
  asunto: string;
  fecha: string | null;
  vencimiento: string | null;
  monto: number | null;
  moneda: string | null;
  vencimientoEstimado: boolean;
  categoria: string | null;
  status: MailExtractionStatus;
};

type MailExtractionsTableProps = {
  rows: MailExtractionRow[];
};

type ViewMode = "pendientes" | "finalizadas";
type DueDateSortDirection = "asc" | "desc";

function getNextStatus(status: MailExtractionStatus): MailExtractionStatus {
  switch (status) {
    case "pendiente":
      return "pagada";
    case "pagada":
      return "ignorada";
    case "ignorada":
      return "pendiente";
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("es-UY", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatCategory(value: string | null) {
  if (!value) {
    return "-";
  }

  return value.replaceAll("_", " ");
}

function formatAmount(value: number | null, currency: string | null) {
  if (value === null) {
    return "-";
  }

  if (currency) {
    try {
      return new Intl.NumberFormat("es-UY", {
        style: "currency",
        currency,
      }).format(value);
    } catch {
      return `${currency} ${value.toFixed(2)}`;
    }
  }

  return new Intl.NumberFormat("es-UY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getStatusBadgeClass(status: MailExtractionStatus) {
  switch (status) {
    case "pendiente":
      return "bg-red-50 text-red-700 ring-red-200";
    case "pagada":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "ignorada":
      return "bg-amber-50 text-amber-700 ring-amber-200";
  }
}

export function MailExtractionsTable({
  rows: initialRows,
}: MailExtractionsTableProps) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [rows, setRows] = useState(initialRows);
  const [loadingRowId, setLoadingRowId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("pendientes");
  const [dueDateSortDirection, setDueDateSortDirection] =
    useState<DueDateSortDirection>("asc");

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  async function handleStatusChange(
    rowId: string,
    nextStatus?: MailExtractionStatus,
  ) {
    const previousRows = rows;
    const currentRow = rows.find((row) => row.id === rowId);

    if (!currentRow) {
      return;
    }

    const resolvedStatus = nextStatus ?? getNextStatus(currentRow.status);

    setErrorMessage(null);
    setLoadingRowId(rowId);
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId ? { ...row, status: resolvedStatus } : row,
      ),
    );

    try {
      const response = await fetch(`/api/mail-extractions/${rowId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: resolvedStatus }),
      });

      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo actualizar el status.");
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setRows(previousRows);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el status.",
      );
    } finally {
      setLoadingRowId(null);
    }
  }

  const filteredRows = rows.filter((row) => {
    if (viewMode === "pendientes") {
      return row.status === "pendiente";
    }

    return row.status === "pagada" || row.status === "ignorada";
  });

  const sortedRows = [...filteredRows].sort((a, b) => {
    const aDueTime = a.vencimiento
      ? new Date(a.vencimiento).getTime()
      : Number.POSITIVE_INFINITY;
    const bDueTime = b.vencimiento
      ? new Date(b.vencimiento).getTime()
      : Number.POSITIVE_INFINITY;

    if (aDueTime !== bDueTime) {
      return dueDateSortDirection === "asc"
        ? aDueTime - bDueTime
        : bDueTime - aDueTime;
    }

    const aRecentTime = a.fecha ? new Date(a.fecha).getTime() : 0;
    const bRecentTime = b.fecha ? new Date(b.fecha).getTime() : 0;

    return bRecentTime - aRecentTime;
  });

  return (
    <div className="overflow-x-auto">
      {errorMessage ? (
        <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-5 py-4">
        <button
          type="button"
          onClick={() => setViewMode("pendientes")}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
            viewMode === "pendientes"
              ? "bg-zinc-900 text-white"
              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
          }`}
        >
          Pendientes
        </button>

        <button
          type="button"
          onClick={() => setViewMode("finalizadas")}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
            viewMode === "finalizadas"
              ? "bg-zinc-900 text-white"
              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
          }`}
        >
          Facturas pagas e ignoradas
        </button>
      </div>

      <table className="min-w-full divide-y divide-zinc-200 text-sm">
        <thead className="bg-zinc-50">
          <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-4 py-3 font-medium">Remitente</th>
            <th className="px-4 py-3 font-medium">Asunto</th>
            <th className="px-4 py-3 font-medium">Fecha</th>
            <th className="px-4 py-3 font-medium">
              <button
                type="button"
                onClick={() =>
                  setDueDateSortDirection((current) =>
                    current === "asc" ? "desc" : "asc",
                  )
                }
                className="inline-flex items-center gap-1 text-left"
              >
                Vencimiento
                <span className="text-[10px] uppercase text-zinc-400">
                  {dueDateSortDirection === "asc" ? "near" : "far"}
                </span>
              </button>
            </th>
            <th className="px-4 py-3 font-medium">Monto</th>
            <th className="px-4 py-3 font-medium">Categoria</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {sortedRows.map((row) => {
            const isLoading = loadingRowId === row.id;

            return (
              <tr key={row.id} className="align-top">
                <td className="px-4 py-3 text-zinc-700">{row.remitente}</td>
                <td className="px-4 py-3 text-zinc-900">{row.asunto}</td>
                <td className="px-4 py-3 text-zinc-700">
                  {formatDate(row.fecha)}
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{formatDate(row.vencimiento)}</span>
                    {row.vencimientoEstimado ? (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                        estimado
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  {formatAmount(row.monto, row.moneda)}
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  {formatCategory(row.categoria)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleStatusChange(row.id)}
                      disabled={isLoading}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition disabled:cursor-not-allowed disabled:opacity-60 ${getStatusBadgeClass(row.status)}`}
                    >
                      {row.status}
                    </button>

                    {isLoading || isRefreshing ? (
                      <span className="text-xs text-zinc-500">Guardando...</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {sortedRows.length === 0 ? (
        <div className="border-t border-zinc-200 px-5 py-8 text-sm text-zinc-600">
          {viewMode === "pendientes"
            ? "No hay facturas pendientes."
            : "No hay facturas pagadas o ignoradas."}
        </div>
      ) : null}
    </div>
  );
}
