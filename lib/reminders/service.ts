import "server-only";

import { sendEmail } from "../email/provider";
import {
  listReminderCandidatesForNotifications,
  type NotificationReminderCandidate,
} from "./mail-extractions";
import { prisma } from "../prisma";

type RunReminderEmailsInput = {
  userId?: string;
  daysAhead?: number;
};

function formatCurrency(
  amountValue: number | null,
  currency: string | null,
) {
  if (amountValue === null) {
    return null;
  }

  if (currency) {
    try {
      return new Intl.NumberFormat("es-UY", {
        style: "currency",
        currency,
      }).format(amountValue);
    } catch {
      return `${currency} ${amountValue.toFixed(2)}`;
    }
  }

  return new Intl.NumberFormat("es-UY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountValue);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-UY", {
    dateStyle: "medium",
  }).format(date);
}

function getReminderKind(candidate: NotificationReminderCandidate) {
  return candidate.isOverdue ? "overdue" : "due_soon";
}

function buildReminderEmail(
  candidate: NotificationReminderCandidate & {
    amountValue: number | null;
    currency: string | null;
  },
) {
  const issuer = candidate.issuerName ?? candidate.issuerEmail ?? "una factura";
  const dueDateLabel = formatDate(candidate.dueDate);
  const amountLabel = formatCurrency(candidate.amountValue, candidate.currency);
  const timingLabel = candidate.isOverdue
    ? "ya vencio"
    : `vence en ${candidate.daysUntilDue} dia${candidate.daysUntilDue === 1 ? "" : "s"}`;
  const subject = candidate.isOverdue
    ? `Recordatorio: factura vencida - ${issuer}`
    : `Recordatorio: factura por vencer - ${issuer}`;

  const textLines = [
    `Te recordamos que ${issuer} ${timingLabel}.`,
    `Asunto: ${candidate.emailSubject ?? "-"}`,
    `Vencimiento: ${dueDateLabel}`,
    `Monto: ${amountLabel ?? "-"}`,
    `Categoria: ${candidate.category ?? "-"}`,
  ];

  return {
    subject,
    text: textLines.join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #18181b; line-height: 1.5;">
        <h2 style="margin-bottom: 12px;">Recordatorio de factura</h2>
        <p style="margin: 0 0 12px;">${issuer} ${timingLabel}.</p>
        <ul style="padding-left: 18px; margin: 0;">
          <li><strong>Asunto:</strong> ${candidate.emailSubject ?? "-"}</li>
          <li><strong>Vencimiento:</strong> ${dueDateLabel}</li>
          <li><strong>Monto:</strong> ${amountLabel ?? "-"}</li>
          <li><strong>Categoria:</strong> ${candidate.category ?? "-"}</li>
        </ul>
      </div>
    `.trim(),
  };
}

async function listCandidatesWithAmounts(input: RunReminderEmailsInput) {
  const candidates = await listReminderCandidatesForNotifications({
    userId: input.userId,
    daysAhead: input.daysAhead,
  });

  const extractions = await prisma.mailExtraction.findMany({
    where: {
      id: {
        in: candidates.map((candidate) => candidate.id),
      },
    },
    select: {
      id: true,
      amountValue: true,
      currency: true,
    },
  });

  const amountsById = new Map(
    extractions.map((extraction) => [
      extraction.id,
      {
        amountValue: extraction.amountValue
          ? Number(extraction.amountValue)
          : null,
        currency: extraction.currency,
      },
    ]),
  );

  return candidates.map((candidate) => ({
    ...candidate,
    amountValue: amountsById.get(candidate.id)?.amountValue ?? null,
    currency: amountsById.get(candidate.id)?.currency ?? null,
  }));
}

export async function runReminderEmails(input: RunReminderEmailsInput) {
  const candidates = await listCandidatesWithAmounts(input);
  const reminders = [];

  for (const candidate of candidates) {
    const user = await prisma.user.findUnique({
      where: {
        id: candidate.userId,
      },
      select: {
        email: true,
      },
    });

    const to = process.env.REMINDER_EMAIL_TO?.trim() || user?.email?.trim();

    if (!to) {
      reminders.push({
        id: candidate.id,
        sent: false,
        reason: "Missing recipient email",
      });
      continue;
    }

    const reminderKind = getReminderKind(candidate);
    const alreadySent = await prisma.mailExtractionReminder.findUnique({
      where: {
        mailExtractionId_channel_kind_dueDateSnapshot: {
          mailExtractionId: candidate.id,
          channel: "email",
          kind: reminderKind,
          dueDateSnapshot: candidate.dueDate,
        },
      },
      select: {
        id: true,
      },
    });

    if (alreadySent) {
      reminders.push({
        id: candidate.id,
        sent: false,
        reason: "Reminder already sent",
      });
      continue;
    }

    const emailContent = buildReminderEmail(candidate);

    try {
      await sendEmail({
        to,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });

      await prisma.mailExtractionReminder.create({
        data: {
          userId: candidate.userId,
          mailExtractionId: candidate.id,
          channel: "email",
          kind: reminderKind,
          recipientEmail: to,
          dueDateSnapshot: candidate.dueDate,
          status: "sent",
          sentAt: new Date(),
        },
      });

      reminders.push({
        id: candidate.id,
        sent: true,
        to,
        kind: reminderKind,
      });
    } catch (error) {
      await prisma.mailExtractionReminder.create({
        data: {
          userId: candidate.userId,
          mailExtractionId: candidate.id,
          channel: "email",
          kind: reminderKind,
          recipientEmail: to,
          dueDateSnapshot: candidate.dueDate,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown email error",
        },
      });

      reminders.push({
        id: candidate.id,
        sent: false,
        to,
        kind: reminderKind,
        reason:
          error instanceof Error ? error.message : "Unknown email error",
      });
    }
  }

  return {
    sentCount: reminders.filter((reminder) => reminder.sent).length,
    reminders,
  };
}
