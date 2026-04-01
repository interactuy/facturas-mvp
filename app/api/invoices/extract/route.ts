import { auth } from "../../../../auth";
import type { Invoice } from "../../../../app/generated/prisma/client";
import { prisma } from "../../../../lib/prisma";

type ExtractionResult = {
  looksInvoiceRelated: boolean;
  issuerName: string | null;
  issuerEmail: string | null;
  amountValue: number | null;
  dueDate: Date | null;
  category: string | null;
  reasons: string[];
  matchedKeywords: string[];
  confidenceScore: number;
};

const INVOICE_KEYWORDS = [
  "invoice",
  "factura",
  "bill",
  "payment due",
  "amount due",
  "total due",
  "due date",
  "vencimiento",
  "pagar",
  "payment reminder",
  "statement",
  "receipt",
  "cobro",
  "saldo",
] as const;

const CATEGORY_RULES: Array<{ category: string; keywords: string[] }> = [
  {
    category: "utilities",
    keywords: [
      "electric",
      "electricity",
      "water",
      "gas",
      "utility",
      "luz",
      "agua",
      "ute",
      "ose",
    ],
  },
  {
    category: "telecom",
    keywords: [
      "internet",
      "mobile",
      "phone",
      "wifi",
      "telecom",
      "movistar",
      "claro",
      "antel",
    ],
  },
  {
    category: "software",
    keywords: [
      "subscription",
      "license",
      "saas",
      "cloud",
      "hosting",
      "domain",
      "renewal",
    ],
  },
  {
    category: "rent",
    keywords: ["rent", "lease", "alquiler", "inmobiliaria"],
  },
  {
    category: "services",
    keywords: ["service", "consulting", "honorarios", "professional services"],
  },
];

const CURRENCY_MARKERS = ["usd", "eur", "uyu", "ars", "$"] as const;

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

function extractIssuerName(
  bodyText: string,
  fromName: string | null | undefined,
): string | null {
  if (fromName?.trim()) {
    return fromName.trim();
  }

  const patterns = [
    /(?:issuer|vendor|from|empresa|proveedor)\s*[:\-]\s*([^\n\r]{2,120})/i,
    /(?:regards|best regards|saludos|atte\.?)[\s\S]{0,80}\n\s*([^\n\r]{2,120})/i,
  ];

  for (const pattern of patterns) {
    const match = bodyText.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractIssuerEmail(
  bodyText: string,
  fromEmail: string | null | undefined,
): string | null {
  if (fromEmail?.trim()) {
    return fromEmail.trim().toLowerCase();
  }

  const emailMatch = bodyText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return emailMatch?.[0]?.toLowerCase() ?? null;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.-]/g, "").trim();

  if (!cleaned) {
    return null;
  }

  const commaCount = (cleaned.match(/,/g) ?? []).length;
  const dotCount = (cleaned.match(/\./g) ?? []).length;

  let normalized = cleaned;

  if (commaCount > 0 && dotCount > 0) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (commaCount > 0 && dotCount === 0) {
    normalized = cleaned.replace(",", ".");
  } else if (dotCount > 1 && commaCount === 0) {
    normalized = cleaned.replace(/\./g, "");
  }

  const amount = Number.parseFloat(normalized);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Number(amount.toFixed(2));
}

function extractAmountValue(text: string): number | null {
  const patterns = [
    /(?:amount due|total due|total|importe|monto|saldo|balance)\s*[:\-]?\s*(?:usd|eur|uyu|ars|\$)?\s*([\d.,]+)/i,
    /(?:usd|eur|uyu|ars|\$)\s*([\d.,]{2,})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const amount = parseAmount(match[1]);
      if (amount !== null) {
        return amount;
      }
    }
  }

  return null;
}

function parseDateParts(day: number, month: number, year: number): Date | null {
  if (year < 100) {
    year += 2000;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function monthNameToNumber(monthName: string): number | null {
  const months: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12,
  };

  return months[monthName.toLowerCase()] ?? null;
}

function extractDueDate(text: string): Date | null {
  const labeledPatterns = [
    /(?:due date|payment due|vencimiento|vence el)\s*[:\-]?\s*(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/i,
    /(?:due date|payment due|vencimiento|vence el)\s*[:\-]?\s*(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/i,
  ];

  for (const pattern of labeledPatterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    if (match[1].length === 4) {
      const year = Number.parseInt(match[1], 10);
      const month = Number.parseInt(match[2], 10);
      const day = Number.parseInt(match[3], 10);
      const parsed = parseDateParts(day, month, year);
      if (parsed) {
        return parsed;
      }
    } else {
      const day = Number.parseInt(match[1], 10);
      const month = Number.parseInt(match[2], 10);
      const year = Number.parseInt(match[3], 10);
      const parsed = parseDateParts(day, month, year);
      if (parsed) {
        return parsed;
      }
    }
  }

  const textMonthPattern =
    /(?:due date|payment due|vencimiento|vence el)\s*[:\-]?\s*(\d{1,2})\s+([a-zA-Z]+)\s+(\d{2,4})/i;
  const monthMatch = text.match(textMonthPattern);

  if (monthMatch) {
    const day = Number.parseInt(monthMatch[1], 10);
    const month = monthNameToNumber(monthMatch[2]);
    const year = Number.parseInt(monthMatch[3], 10);

    if (month) {
      const parsed = parseDateParts(day, month, year);
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

function detectCategory(text: string): string | null {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      return rule.category;
    }
  }

  return null;
}

function runInvoiceHeuristics(message: {
  subject: string | null;
  snippet: string | null;
  bodyText: string;
  fromName: string | null;
  fromEmail: string | null;
}): ExtractionResult {
  const subjectText = normalizeText(message.subject);
  const snippetText = normalizeText(message.snippet);
  const bodyTextNormalized = normalizeText(message.bodyText);
  const combinedText = [subjectText, snippetText, bodyTextNormalized].join("\n");

  const matchedKeywords = INVOICE_KEYWORDS.filter((keyword) =>
    combinedText.includes(keyword),
  );

  const reasons: string[] = [];
  let confidenceScore = 0;

  if (matchedKeywords.length > 0) {
    confidenceScore += Math.min(0.6, matchedKeywords.length * 0.15);
    reasons.push(`Matched keywords: ${matchedKeywords.join(", ")}`);
  }

  const hasCurrencyMarker = CURRENCY_MARKERS.some((marker) =>
    combinedText.includes(marker),
  );
  if (hasCurrencyMarker) {
    confidenceScore += 0.1;
    reasons.push("Found currency marker");
  }

  const amountValue = extractAmountValue(combinedText);
  if (amountValue !== null) {
    confidenceScore += 0.15;
    reasons.push(`Extracted amount candidate: ${amountValue}`);
  }

  const dueDate = extractDueDate(combinedText);
  if (dueDate !== null) {
    confidenceScore += 0.15;
    reasons.push(
      `Extracted due date candidate: ${dueDate.toISOString().slice(0, 10)}`,
    );
  }

  const issuerName = extractIssuerName(message.bodyText, message.fromName);
  const issuerEmail = extractIssuerEmail(message.bodyText, message.fromEmail);

  if (issuerName || issuerEmail) {
    confidenceScore += 0.05;
    reasons.push("Found issuer identity signals");
  }

  const category = detectCategory(combinedText);
  if (category) {
    reasons.push(`Detected category: ${category}`);
  }

  const looksInvoiceRelated =
    confidenceScore >= 0.35 && matchedKeywords.length > 0;

  if (!looksInvoiceRelated) {
    reasons.push("Rejected as non-invoice: low heuristic confidence");
  }

  return {
    looksInvoiceRelated,
    issuerName,
    issuerEmail,
    amountValue,
    dueDate,
    category,
    reasons,
    matchedKeywords,
    confidenceScore: Number(confidenceScore.toFixed(3)),
  };
}

export async function POST() {
  try {
    const session = await auth();
    const email = session?.user?.email?.trim().toLowerCase();

    if (!email) {
      return Response.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return Response.json(
        { ok: false, error: "User not found" },
        { status: 404 },
      );
    }

    const messages = await prisma.emailMessage.findMany({
      where: {
        userId: user.id,
        extractionStatus: "processed",
        bodyText: {
          not: null,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 10,
      select: {
        id: true,
        externalMessageId: true,
        subject: true,
        snippet: true,
        bodyText: true,
        fromName: true,
        fromEmail: true,
      },
    });

    const existingInvoices = await prisma.invoice.findMany({
      where: {
        userId: user.id,
        emailMessageId: {
          in: messages.map((message) => message.id),
        },
      },
      select: {
        emailMessageId: true,
      },
    });

    const existingEmailMessageIds = new Set(
      existingInvoices
        .map((invoice) => invoice.emailMessageId)
        .filter((id): id is string => Boolean(id)),
    );

    const invoices: Invoice[] = [];

    for (const message of messages) {
      if (existingEmailMessageIds.has(message.id)) {
        continue;
      }

      if (!message.bodyText) {
        continue;
      }

      const extraction = runInvoiceHeuristics({
        subject: message.subject,
        snippet: message.snippet,
        bodyText: message.bodyText,
        fromName: message.fromName,
        fromEmail: message.fromEmail,
      });

      if (!extraction.looksInvoiceRelated) {
        continue;
      }

      const duplicateInvoice = await prisma.invoice.findFirst({
        where: {
          userId: user.id,
          emailMessageId: message.id,
        },
        select: { id: true },
      });

      if (duplicateInvoice) {
        continue;
      }

      const invoice = await prisma.invoice.create({
        data: {
          userId: user.id,
          emailMessageId: message.id,
          issuerName: extraction.issuerName,
          issuerEmail: extraction.issuerEmail,
          amountValue: extraction.amountValue ?? undefined,
          dueDate: extraction.dueDate ?? undefined,
          category: extraction.category,
          sourceType: "email_body",
          status: "pending",
          rawExtractionJson: {
            method: "heuristics_v1",
            message: {
              id: message.id,
              externalMessageId: message.externalMessageId,
            },
            extracted: {
              issuerName: extraction.issuerName,
              issuerEmail: extraction.issuerEmail,
              amountValue: extraction.amountValue,
              dueDate: extraction.dueDate?.toISOString() ?? null,
              category: extraction.category,
            },
            reasons: extraction.reasons,
            matchedKeywords: extraction.matchedKeywords,
            confidenceScore: extraction.confidenceScore,
            looksInvoiceRelated: extraction.looksInvoiceRelated,
            sourceSignals: {
              subject: message.subject,
              snippet: message.snippet,
            },
          },
        },
      });

      invoices.push(invoice);
    }

    return Response.json({
      ok: true,
      extractedCount: invoices.length,
      invoices,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown invoice extraction error";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
