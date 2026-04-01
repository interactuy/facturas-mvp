import "server-only";

import { prisma } from "../prisma";
import { sendWhatsAppMessage } from "./provider";

function normalizePhone(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/[^\d+]/g, "");
  return normalized || null;
}

function formatCurrency(
  amountValue: number | null,
  currency: string | null,
) {
  if (amountValue === null) {
    return "-";
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

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function buildReminderText(input: {
  issuer: string;
  amountValue: number | null;
  currency: string | null;
  dueDate: Date;
}) {
  const amount = formatCurrency(input.amountValue, input.currency);
  const dueDate = formatShortDate(input.dueDate);

  return `Tenes una factura pendiente: ${input.issuer} - ${amount} - vence ${dueDate}. Ya la pagaste? Responde SI o NO.`;
}

export async function sendWhatsAppReminderForExtraction(input: {
  userId: string;
  mailExtractionId: string;
  toPhone?: string | null;
}) {
  const extraction = await prisma.mailExtraction.findFirst({
    where: {
      id: input.mailExtractionId,
      userId: input.userId,
      status: "pendiente",
      dueDate: {
        not: null,
      },
    },
    select: {
      id: true,
      userId: true,
      issuerName: true,
      issuerEmail: true,
      amountValue: true,
      currency: true,
      dueDate: true,
    },
  });

  if (!extraction || !extraction.dueDate) {
    throw new Error("Pending extraction with due date not found");
  }

  const user = await prisma.user.findUnique({
    where: {
      id: input.userId,
    },
    select: {
      phoneNumber: true,
    },
  });

  const recipientPhone =
    normalizePhone(input.toPhone) ??
    normalizePhone(process.env.WHATSAPP_TO_DEFAULT) ??
    normalizePhone(user?.phoneNumber);

  if (!recipientPhone) {
    throw new Error("Missing recipient WhatsApp phone number");
  }

  const issuer =
    extraction.issuerName ?? extraction.issuerEmail ?? "Factura pendiente";
  const body = buildReminderText({
    issuer,
    amountValue: extraction.amountValue ? Number(extraction.amountValue) : null,
    currency: extraction.currency,
    dueDate: extraction.dueDate,
  });

  const result = await sendWhatsAppMessage({
    to: recipientPhone,
    body,
  });

  const reminderKind = extraction.dueDate.getTime() < Date.now()
    ? "overdue"
    : "due_soon";
  const existingReminder = await prisma.mailExtractionReminder.findUnique({
    where: {
      mailExtractionId_channel_kind_dueDateSnapshot: {
        mailExtractionId: extraction.id,
        channel: "whatsapp",
        kind: reminderKind,
        dueDateSnapshot: extraction.dueDate,
      },
    },
    select: {
      id: true,
    },
  });

  const reminder = await prisma.mailExtractionReminder.upsert({
    where: {
      mailExtractionId_channel_kind_dueDateSnapshot: {
        mailExtractionId: extraction.id,
        channel: "whatsapp",
        kind: reminderKind,
        dueDateSnapshot: extraction.dueDate,
      },
    },
    create: {
      userId: extraction.userId,
      mailExtractionId: extraction.id,
      channel: "whatsapp",
      kind: reminderKind,
      recipientPhone,
      provider: result.provider,
      providerMessageId: result.messageId,
      dueDateSnapshot: extraction.dueDate,
      status: "sent",
      sentAt: new Date(),
    },
    update: {
      recipientPhone,
      provider: result.provider,
      providerMessageId: result.messageId,
      status: "sent",
      sentAt: new Date(),
      repliedAt: null,
      inboundBody: null,
      error: null,
    },
    select: {
      id: true,
      mailExtractionId: true,
      recipientPhone: true,
      provider: true,
      providerMessageId: true,
      status: true,
    },
  });

  return {
    reminder,
    reminderRecordAction: existingReminder ? "reused" : "created",
    body,
    extraction: {
      id: extraction.id,
      issuer,
      dueDate: extraction.dueDate,
      amountValue: extraction.amountValue ? Number(extraction.amountValue) : null,
      currency: extraction.currency,
      status: "pendiente" as const,
    },
    providerResult: result,
  };
}

export async function sendNextWhatsAppReminderForUser(input: {
  userId: string;
  toPhone?: string | null;
}) {
  const nextExtraction = await prisma.mailExtraction.findFirst({
    where: {
      userId: input.userId,
      status: "pendiente",
      dueDate: {
        not: null,
      },
    },
    orderBy: [
      {
        dueDate: "asc",
      },
      {
        createdAt: "desc",
      },
    ],
    select: {
      id: true,
    },
  });

  if (!nextExtraction) {
    throw new Error("No pending extraction found");
  }

  return sendWhatsAppReminderForExtraction({
    userId: input.userId,
    mailExtractionId: nextExtraction.id,
    toPhone: input.toPhone,
  });
}

function normalizeCommand(body: string) {
  return body.trim().toUpperCase();
}

async function findUserByPhone(fromPhone: string) {
  const normalized = normalizePhone(fromPhone);

  if (!normalized) {
    return null;
  }

  const users = await prisma.user.findMany({
    where: {
      phoneNumber: {
        not: null,
      },
    },
    select: {
      id: true,
      phoneNumber: true,
    },
  });

  return (
    users.find((user) => normalizePhone(user.phoneNumber) === normalized) ?? null
  );
}

async function findRelatedWhatsAppReminder(input: {
  userId: string;
  providerMessageId?: string | null;
}) {
  if (input.providerMessageId) {
    const matchedByProviderMessageId =
      await prisma.mailExtractionReminder.findFirst({
        where: {
          userId: input.userId,
          channel: "whatsapp",
          providerMessageId: input.providerMessageId,
          status: {
            in: ["sent", "answered_pending"],
          },
        },
        orderBy: [
          {
            sentAt: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        select: {
          id: true,
          mailExtractionId: true,
        },
      });

    if (matchedByProviderMessageId) {
      return matchedByProviderMessageId;
    }
  }

  return prisma.mailExtractionReminder.findFirst({
    where: {
      userId: input.userId,
      channel: "whatsapp",
      status: {
        in: ["sent", "answered_pending"],
      },
      mailExtraction: {
        status: "pendiente",
      },
    },
    orderBy: [
      {
        sentAt: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
      select: {
        id: true,
        mailExtractionId: true,
      },
  });
}

export async function handleInboundWhatsAppReply(input: {
  fromPhone: string;
  body: string;
  providerMessageId?: string | null;
}) {
  const normalizedCommand = normalizeCommand(input.body);
  const user = await findUserByPhone(input.fromPhone);

  if (!user) {
    return {
      ok: false,
      action: "ignored",
      reason: "User not found for inbound phone",
    };
  }

  const lastWhatsAppReminder = await findRelatedWhatsAppReminder({
    userId: user.id,
    providerMessageId: input.providerMessageId,
  });

  if (normalizedCommand === "SI") {
    if (!lastWhatsAppReminder) {
      return {
        ok: false,
        action: "ignored",
        reason: "No recent WhatsApp reminder found",
      };
    }

    await prisma.mailExtraction.update({
      where: {
        id: lastWhatsAppReminder.mailExtractionId,
      },
      data: {
        status: "pagada",
      },
    });

    await prisma.mailExtractionReminder.update({
      where: {
        id: lastWhatsAppReminder.id,
      },
      data: {
        status: "resolved",
        repliedAt: new Date(),
        inboundBody: input.body,
      },
    });

    return {
      ok: true,
      action: "marked_paid",
      mailExtractionId: lastWhatsAppReminder.mailExtractionId,
      status: "pagada",
    };
  }

  if (normalizedCommand === "NO") {
    if (lastWhatsAppReminder) {
      await prisma.mailExtractionReminder.update({
        where: {
          id: lastWhatsAppReminder.id,
        },
        data: {
          status: "answered_pending",
          repliedAt: new Date(),
          inboundBody: input.body,
        },
      });
    }

    return {
      ok: true,
      action: "kept_pending",
      status: "pendiente",
    };
  }

  if (normalizedCommand.startsWith("PAGUE ")) {
    const searchText = input.body.slice(6).trim();

    const extraction = await prisma.mailExtraction.findFirst({
      where: {
        userId: user.id,
        status: "pendiente",
        OR: [
          {
            issuerName: {
              contains: searchText,
              mode: "insensitive",
            },
          },
          {
            issuerEmail: {
              contains: searchText,
              mode: "insensitive",
            },
          },
          {
            emailMessage: {
              subject: {
                contains: searchText,
                mode: "insensitive",
              },
            },
          },
          {
            emailMessage: {
              fromEmail: {
                contains: searchText,
                mode: "insensitive",
              },
            },
          },
        ],
      },
      orderBy: [
        {
          dueDate: "asc",
        },
        {
          createdAt: "desc",
        },
      ],
      select: {
        id: true,
      },
    });

    if (!extraction) {
      return {
        ok: false,
        action: "ignored",
        reason: "No matching pending extraction found",
      };
    }

    await prisma.mailExtraction.update({
      where: {
        id: extraction.id,
      },
      data: {
        status: "pagada",
      },
    });

    if (lastWhatsAppReminder) {
      await prisma.mailExtractionReminder.update({
        where: {
          id: lastWhatsAppReminder.id,
        },
        data: {
          status: "resolved",
          repliedAt: new Date(),
          inboundBody: input.body,
        },
      });
    }

    return {
      ok: true,
      action: "marked_paid",
      mailExtractionId: extraction.id,
      status: "pagada",
    };
  }

  return {
    ok: false,
    action: "ignored",
    reason: "Unsupported command",
  };
}
