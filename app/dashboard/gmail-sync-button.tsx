"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GmailSyncButton() {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResponse, setSyncResponse] = useState<unknown>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichResponse, setEnrichResponse] = useState<unknown>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractResponse, setExtractResponse] = useState<unknown>(null);
  const [isExtractingMailData, setIsExtractingMailData] = useState(false);
  const [mailExtractionResponse, setMailExtractionResponse] =
    useState<unknown>(null);

  async function handleSync() {
    setIsSyncing(true);

    try {
      const res = await fetch("/api/gmail/sync", {
        method: "POST",
      });
      const data = await res.json();

      setSyncResponse(data);
    } catch (error) {
      setSyncResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown sync error",
      });
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleEnrich() {
    setIsEnriching(true);

    try {
      const res = await fetch("/api/gmail/enrich", {
        method: "POST",
      });
      const data = await res.json();

      setEnrichResponse(data);
    } catch (error) {
      setEnrichResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown enrich error",
      });
    } finally {
      setIsEnriching(false);
    }
  }

  async function handleExtract() {
    setIsExtracting(true);

    try {
      const res = await fetch("/api/invoices/extract", {
        method: "POST",
      });
      const data = await res.json();

      setExtractResponse(data);
    } catch (error) {
      setExtractResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown extract error",
      });
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleMailExtractionRun() {
    setIsExtractingMailData(true);

    try {
      const res = await fetch("/api/mail-extractions/run", {
        method: "POST",
      });
      const data = await res.json();

      setMailExtractionResponse(data);
      if (res.ok) {
        router.refresh();
      }
    } catch (error) {
      setMailExtractionResponse({
        ok: false,
        error:
          error instanceof Error ? error.message : "Unknown mail extraction error",
      });
    } finally {
      setIsExtractingMailData(false);
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSync}
          disabled={isSyncing}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSyncing ? "Sincronizando..." : "Sincronizar Gmail"}
        </button>

        <button
          type="button"
          onClick={handleEnrich}
          disabled={isEnriching}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isEnriching ? "Enriqueciendo..." : "Enriquecer mails"}
        </button>

        <button
          type="button"
          onClick={handleExtract}
          disabled={isExtracting}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isExtracting ? "Extrayendo..." : "Extraer facturas"}
        </button>

        <button
          type="button"
          onClick={handleMailExtractionRun}
          disabled={isExtractingMailData}
          className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-800 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isExtractingMailData
            ? "Extrayendo datos..."
            : "Extraer datos de mails"}
        </button>
      </div>

      {syncResponse !== null ? (
        <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs text-zinc-100">
          {JSON.stringify(syncResponse, null, 2)}
        </pre>
      ) : null}

      {enrichResponse !== null ? (
        <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs text-zinc-100">
          {JSON.stringify(enrichResponse, null, 2)}
        </pre>
      ) : null}

      {extractResponse !== null ? (
        <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs text-zinc-100">
          {JSON.stringify(extractResponse, null, 2)}
        </pre>
      ) : null}

      {mailExtractionResponse !== null ? (
        <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs text-zinc-100">
          {JSON.stringify(mailExtractionResponse, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
