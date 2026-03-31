"use client";

import { useState } from "react";

export function GmailSyncButton() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResponse, setSyncResponse] = useState<unknown>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichResponse, setEnrichResponse] = useState<unknown>(null);

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
    </div>
  );
}
