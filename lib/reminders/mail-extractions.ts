import "server-only";

import {
  isMailExtractionStatus,
} from "../mail-extractions/status";
import { prisma } from "../prisma";
import type { MailExtractionStatus } from "../mail-extractions/status";

export type ReminderChannel = "whatsapp" | "sms" | "email";

export type MailExtractionReminderCandidate = {
  id: string;
  userId: string;
  status: MailExtractionStatus;
  dueDate: Date;
  category: string | null;
  issuerName: string | null;
  issuerEmail: string | null;
  emailSubject: string | null;
  emailInternalDate: Date | null;
};

export type NotificationReminderCandidate = MailExtractionReminderCandidate & {
  suggestedChannel: "email";
  daysUntilDue: number;
  isOverdue: boolean;
};

export function shouldMailExtractionReceiveReminders(
  status: MailExtractionStatus,
): boolean {
  return status === "pendiente";
}

export async function listPendingMailExtractionReminderCandidates(input?: {
  userId?: string;
  dueBefore?: Date;
}) {
  return prisma.mailExtraction.findMany({
    where: {
      userId: input?.userId,
      status: "pendiente",
      dueDate: input?.dueBefore
        ? {
            lte: input.dueBefore,
          }
        : {
            not: null,
          },
    },
    select: {
      id: true,
      userId: true,
      status: true,
      dueDate: true,
      category: true,
      issuerName: true,
      issuerEmail: true,
      emailMessage: {
        select: {
          subject: true,
          internalDate: true,
        },
      },
    },
    orderBy: [
      {
        dueDate: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  }).then((rows) =>
    rows.flatMap((row) => {
      if (!row.dueDate) {
        return [];
      }

      return [
        {
          id: row.id,
          userId: row.userId,
          status: isMailExtractionStatus(row.status) ? row.status : "pendiente",
          dueDate: row.dueDate,
          category: row.category,
          issuerName: row.issuerName,
          issuerEmail: row.issuerEmail,
          emailSubject: row.emailMessage.subject,
          emailInternalDate: row.emailMessage.internalDate,
        } satisfies MailExtractionReminderCandidate,
      ];
    }),
  );
}

export function buildMailExtractionReminderPayload(
  candidate: MailExtractionReminderCandidate,
  channel: ReminderChannel,
) {
  return {
    channel,
    extractionId: candidate.id,
    userId: candidate.userId,
    dueDate: candidate.dueDate,
    issuerName: candidate.issuerName,
    issuerEmail: candidate.issuerEmail,
    category: candidate.category,
    subject: candidate.emailSubject,
    internalDate: candidate.emailInternalDate,
  };
}

export async function listReminderCandidatesForNotifications(input?: {
  userId?: string;
  daysAhead?: number;
  now?: Date;
}) {
  const now = input?.now ?? new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + (input?.daysAhead ?? 7));

  const rows = await listPendingMailExtractionReminderCandidates({
    userId: input?.userId,
    dueBefore: horizon,
  });

  return rows
    .filter((row) => shouldMailExtractionReceiveReminders(row.status))
    .map((row) => {
      const timeDiff = row.dueDate.getTime() - now.getTime();
      const daysUntilDue = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

      return {
        ...row,
        suggestedChannel: "email",
        daysUntilDue,
        isOverdue: row.dueDate.getTime() < now.getTime(),
      } satisfies NotificationReminderCandidate;
    })
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}
