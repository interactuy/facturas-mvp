"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GmailSyncButton() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshResponse, setRefreshResponse] = useState<unknown>(null);
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  const [reminderResponse, setReminderResponse] = useState<unknown>(null);
  const [isSendingWhatsAppReminder, setIsSendingWhatsAppReminder] = useState(false);
  const [whatsAppReminderResponse, setWhatsAppReminderResponse] =
    useState<unknown>(null);

  async function handleRefresh() {
    setIsRefreshing(true);

    try {
      const res = await fetch("/api/mail-extractions/refresh", {
        method: "POST",
      });
      const data = await res.json();

      setRefreshResponse(data);
      if (res.ok) {
        router.refresh();
      }
    } catch (error) {
      setRefreshResponse({
        ok: false,
        error:
          error instanceof Error ? error.message : "Unknown refresh error",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSendReminders() {
    setIsSendingReminders(true);

    try {
      const res = await fetch("/api/reminders/run", {
        method: "POST",
      });
      const data = await res.json();

      setReminderResponse(data);
      if (res.ok) {
        router.refresh();
      }
    } catch (error) {
      setReminderResponse({
        ok: false,
        error:
          error instanceof Error ? error.message : "Unknown reminder error",
      });
    } finally {
      setIsSendingReminders(false);
    }
  }

  async function handleSendWhatsAppReminder() {
    setIsSendingWhatsAppReminder(true);

    try {
      const res = await fetch("/api/reminders/send-whatsapp", {
        method: "POST",
      });
      const data = await res.json();

      setWhatsAppReminderResponse(data);
      if (res.ok) {
        router.refresh();
      }
    } catch (error) {
      setWhatsAppReminderResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown WhatsApp error",
      });
    } finally {
      setIsSendingWhatsAppReminder(false);
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshing ? "Actualizando..." : "Actualizar facturas"}
        </button>

        <button
          type="button"
          onClick={handleSendReminders}
          disabled={isSendingReminders}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSendingReminders ? "Enviando..." : "Enviar recordatorios"}
        </button>

        <button
          type="button"
          onClick={handleSendWhatsAppReminder}
          disabled={isSendingWhatsAppReminder}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSendingWhatsAppReminder
            ? "Enviando..."
            : "Enviar recordatorio por WhatsApp"}
        </button>
      </div>

      {refreshResponse !== null ? (
        <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs text-zinc-100">
          {JSON.stringify(refreshResponse, null, 2)}
        </pre>
      ) : null}

      {reminderResponse !== null ? (
        <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs text-zinc-100">
          {JSON.stringify(reminderResponse, null, 2)}
        </pre>
      ) : null}

      {whatsAppReminderResponse !== null ? (
        <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs text-zinc-100">
          {JSON.stringify(whatsAppReminderResponse, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
