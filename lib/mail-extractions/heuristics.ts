export type MailHeuristicInput = {
  subject: string | null;
  snippet: string | null;
  bodyText: string;
  fromName: string | null;
  fromEmail: string | null;
  internalDate: Date | null;
};

export type MailHeuristicResult = {
  looksPaymentRelated: boolean;
  issuerName: string | null;
  issuerEmail: string | null;
  amountValue: number | null;
  currency: string | null;
  dueDate: Date | null;
  dueDateEstimated: boolean;
  paidStatus: "pending" | "paid" | "unknown";
  documentType: "invoice" | "payment_receipt" | "statement" | "unknown";
  category: string | null;
  confidence: number;
  reasons: string[];
  matchedFragments: Record<string, string>;
};

const PAID_KEYWORDS = [
  "payment received",
  "pago recibido",
  "paid successfully",
  "payment successful",
  "pagado",
  "comprobante de pago",
  "receipt",
  "transaction complete",
  "thank you for your payment",
] as const;

const NEGATIVE_KEYWORDS = [
  "tu viaje",
  "trip",
  "uber trip",
  "thanks for riding",
  "viaje del lunes",
  "travel receipt",
  "activity receipt",
  "receipt",
  "payment confirmation",
  "confirmacion de pago",
  "pago realizado",
  "compra realizada",
  "gracias por tu compra",
  "thank you for your purchase",
  "purchase confirmation",
  "order confirmation",
  "successful payment",
  "paid successfully",
  "comprobante",
  "transaction complete",
] as const;

const NEGATIVE_SENDER_PATTERNS = [
  "noreply@uber.com",
  "uber.com",
] as const;

const PENDING_KEYWORDS = [
  "invoice",
  "factura",
  "bill",
  "amount due",
  "payment due",
  "due date",
  "vencimiento",
  "vence",
  "por pagar",
  "saldo",
  "importe",
  "monto",
] as const;

const STATEMENT_KEYWORDS = [
  "statement",
  "account statement",
  "estado de cuenta",
  "resumen",
  "card statement",
] as const;

const RECEIPT_KEYWORDS = [
  "receipt",
  "comprobante",
  "payment confirmation",
  "confirmacion de pago",
] as const;

const OBLIGATION_KEYWORDS = [
  "invoice",
  "factura",
  "bill",
  "amount due",
  "payment due",
  "due date",
  "vencimiento",
  "vence",
  "por pagar",
  "pending payment",
  "payment required",
  "renewal",
  "subscription renewal",
  "estado de cuenta",
  "statement",
  "account statement",
  "resumen",
] as const;

const RELATED_KEYWORDS = [
  ...PAID_KEYWORDS,
  ...PENDING_KEYWORDS,
  ...STATEMENT_KEYWORDS,
] as const;

const CATEGORY_RULES: Array<{ category: string; keywords: string[] }> = [
  {
    category: "telecom",
    keywords: ["movistar", "claro", "antel", "telecom", "mobile", "phone"],
  },
  {
    category: "internet",
    keywords: ["internet", "wifi", "broadband", "fiber", "hosting"],
  },
  {
    category: "hosting",
    keywords: ["hosting", "domain", "server", "vps", "cloudflare", "aws"],
  },
  {
    category: "subscription",
    keywords: ["subscription", "renewal", "monthly plan", "plan mensual"],
  },
  {
    category: "card",
    keywords: ["credit card", "tarjeta", "mastercard", "visa", "amex"],
  },
  {
    category: "utilities",
    keywords: ["electric", "water", "gas", "utility", "luz", "agua"],
  },
  {
    category: "shopping",
    keywords: ["order", "purchase", "shopping", "compra", "mercado libre"],
  },
];

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
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

function countMatches(text: string, keywords: readonly string[]): string[] {
  return keywords.filter((keyword) => text.includes(keyword));
}

function inferCategory(text: string): string | null {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      return rule.category;
    }
  }

  return null;
}

function inferIssuerName(subject: string, fromName: string | null): string | null {
  if (fromName?.trim()) {
    return fromName.trim();
  }

  const subjectMatch = subject.match(/^([^:|\-]{3,80})[:|\-]/);
  if (subjectMatch?.[1]) {
    return subjectMatch[1].trim();
  }

  return null;
}

function inferCurrency(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  const token = raw.toLowerCase();
  if (token.includes("uyu")) {
    return "UYU";
  }
  if (token.includes("usd") || token.includes("$")) {
    return "USD";
  }
  if (token.includes("eur")) {
    return "EUR";
  }
  if (token.includes("ars")) {
    return "ARS";
  }

  return null;
}

function extractAmountAndCurrency(text: string): {
  amountValue: number | null;
  currency: string | null;
  fragment: string | null;
} {
  const patterns = [
    /(?:total|amount due|payment of|importe|monto|saldo)\s*[:\-]?\s*(usd|uyu|ars|eur|\$)?\s*([\d.,]+)/i,
    /(usd|uyu|ars|eur)\s*([\d.,]{2,})/i,
    /(\$)\s*([\d.,]{2,})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    const amount = parseAmount(match[2]);
    if (amount === null) {
      continue;
    }

    const currency = inferCurrency(match[1] ?? match[0]);
    return {
      amountValue: amount,
      currency,
      fragment: match[0],
    };
  }

  return {
    amountValue: null,
    currency: null,
    fragment: null,
  };
}

function extractDueDate(text: string): { dueDate: Date | null; fragment: string | null } {
  const numericPatterns = [
    /(?:vence(?:\s+el)?|vencimiento|fecha de pago|payment due|due date)\s*[:\-]?\s*(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/i,
    /(?:vence(?:\s+el)?|vencimiento|fecha de pago|payment due|due date)\s*[:\-]?\s*(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/i,
  ];

  for (const pattern of numericPatterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    if (match[1].length === 4) {
      const year = Number.parseInt(match[1], 10);
      const month = Number.parseInt(match[2], 10);
      const day = Number.parseInt(match[3], 10);
      const date = parseDateParts(day, month, year);
      if (date) {
        return { dueDate: date, fragment: match[0] };
      }
    } else {
      const day = Number.parseInt(match[1], 10);
      const month = Number.parseInt(match[2], 10);
      const year = Number.parseInt(match[3], 10);
      const date = parseDateParts(day, month, year);
      if (date) {
        return { dueDate: date, fragment: match[0] };
      }
    }
  }

  const textMonthPattern =
    /(?:vence(?:\s+el)?|vencimiento|fecha de pago|payment due|due date)\s*[:\-]?\s*(\d{1,2})\s+([a-zA-Z]+)\s+(\d{2,4})/i;
  const monthMatch = text.match(textMonthPattern);

  if (monthMatch) {
    const day = Number.parseInt(monthMatch[1], 10);
    const month = monthNameToNumber(monthMatch[2]);
    const year = Number.parseInt(monthMatch[3], 10);

    if (month) {
      const date = parseDateParts(day, month, year);
      if (date) {
        return { dueDate: date, fragment: monthMatch[0] };
      }
    }
  }

  return { dueDate: null, fragment: null };
}

function estimateDueDate(baseDate: Date | null, paidStatus: string): Date {
  const date = new Date(baseDate ?? new Date());

  if (paidStatus === "paid") {
    return date;
  }

  date.setUTCDate(date.getUTCDate() + 30);
  return date;
}

function hasStrongNegativeSignal(text: string) {
  return NEGATIVE_KEYWORDS.some((keyword) => text.includes(keyword));
}

function hasBlockedSender(fromEmail: string | null | undefined) {
  const normalizedEmail = normalizeText(fromEmail);

  return NEGATIVE_SENDER_PATTERNS.some((pattern) =>
    normalizedEmail.includes(pattern),
  );
}

export function runMailPaymentHeuristics(
  input: MailHeuristicInput,
): MailHeuristicResult {
  const subjectText = normalizeText(input.subject);
  const snippetText = normalizeText(input.snippet);
  const bodyText = normalizeText(input.bodyText);
  const fromEmail = normalizeText(input.fromEmail);
  const combinedText = [subjectText, snippetText, bodyText, fromEmail].join("\n");

  const reasons: string[] = [];
  const matchedFragments: Record<string, string> = {};

  const paidMatches = countMatches(combinedText, PAID_KEYWORDS);
  const pendingMatches = countMatches(combinedText, PENDING_KEYWORDS);
  const statementMatches = countMatches(combinedText, STATEMENT_KEYWORDS);
  const relatedMatches = countMatches(combinedText, RELATED_KEYWORDS);
  const obligationMatches = countMatches(combinedText, OBLIGATION_KEYWORDS);
  const negativeMatches = countMatches(combinedText, NEGATIVE_KEYWORDS);
  const blockedSender = hasBlockedSender(input.fromEmail);

  let paidStatus: MailHeuristicResult["paidStatus"] = "unknown";
  if (paidMatches.length > pendingMatches.length && paidMatches.length > 0) {
    paidStatus = "paid";
    reasons.push(`Paid markers: ${paidMatches.join(", ")}`);
  } else if (pendingMatches.length > 0) {
    paidStatus = "pending";
    reasons.push(`Pending markers: ${pendingMatches.join(", ")}`);
  } else {
    reasons.push("No clear paid/pending markers");
  }

  let documentType: MailHeuristicResult["documentType"] = "unknown";
  if (countMatches(combinedText, RECEIPT_KEYWORDS).length > 0 || paidStatus === "paid") {
    documentType = "payment_receipt";
  } else if (statementMatches.length > 0) {
    documentType = "statement";
  } else if (pendingMatches.length > 0) {
    documentType = "invoice";
  }
  reasons.push(`Document type inferred: ${documentType}`);

  const issuerName = inferIssuerName(input.subject ?? "", input.fromName);
  const issuerEmail = input.fromEmail?.trim().toLowerCase() ?? null;

  if (issuerName) {
    matchedFragments.issuerName = issuerName;
  }
  if (issuerEmail) {
    matchedFragments.issuerEmail = issuerEmail;
  }

  const amountExtraction = extractAmountAndCurrency(combinedText);
  if (amountExtraction.fragment) {
    matchedFragments.amount = amountExtraction.fragment;
    reasons.push(`Amount fragment: ${amountExtraction.fragment}`);
  } else {
    reasons.push("No amount detected");
  }

  const dueDateExtraction = extractDueDate(combinedText);
  if (dueDateExtraction.fragment) {
    matchedFragments.dueDate = dueDateExtraction.fragment;
    reasons.push(`Due date fragment: ${dueDateExtraction.fragment}`);
  } else {
    reasons.push("No explicit due date detected");
  }

  const category = inferCategory(combinedText);
  if (category) {
    reasons.push(`Category inferred: ${category}`);
  }

  const hasNegativeSignal = hasStrongNegativeSignal(combinedText);
  if (negativeMatches.length > 0) {
    reasons.push(`Negative markers: ${negativeMatches.join(", ")}`);
  }
  if (blockedSender) {
    reasons.push(`Blocked sender/domain: ${input.fromEmail ?? "unknown sender"}`);
  }

  const looksLikeObligation =
    obligationMatches.length > 0 ||
    pendingMatches.length > 0 ||
    statementMatches.length > 0;

  const looksPaymentRelated =
    looksLikeObligation &&
    !hasNegativeSignal &&
    !blockedSender &&
    documentType !== "payment_receipt" &&
    paidStatus !== "paid" &&
    (
      relatedMatches.length > 0 ||
      amountExtraction.amountValue !== null ||
      dueDateExtraction.dueDate !== null
    );

  if (!looksLikeObligation) {
    reasons.push("Rejected because it does not look like an unpaid bill or payment obligation");
  }
  if (documentType === "payment_receipt" || paidStatus === "paid") {
    reasons.push("Rejected because it looks like a receipt or completed payment");
  }
  if (hasNegativeSignal) {
    reasons.push("Rejected because it matches transactional or travel receipt patterns");
  }
  if (blockedSender) {
    reasons.push("Rejected because sender/domain matches blocked travel receipt patterns");
  }

  let dueDate = dueDateExtraction.dueDate;
  let dueDateEstimated = false;
  if (!dueDate && looksPaymentRelated) {
    dueDate = estimateDueDate(input.internalDate, paidStatus);
    dueDateEstimated = true;
    matchedFragments.dueDateEstimatedFrom = input.internalDate
      ? input.internalDate.toISOString()
      : "current_date";
    reasons.push("Estimated due date because no explicit due date was found");
  }

  let confidence = 0;
  if (relatedMatches.length > 0) {
    confidence += 0.35;
  }
  if (paidStatus !== "unknown") {
    confidence += 0.2;
  }
  if (amountExtraction.amountValue !== null) {
    confidence += 0.2;
  }
  if (dueDateExtraction.dueDate !== null || dueDateEstimated) {
    confidence += 0.1;
  }
  if (issuerName || issuerEmail) {
    confidence += 0.1;
  }
  if (category) {
    confidence += 0.05;
  }
  if (
    hasNegativeSignal ||
    blockedSender ||
    documentType === "payment_receipt" ||
    paidStatus === "paid"
  ) {
    confidence = Math.min(confidence, 0.2);
  }
  confidence = Math.min(0.995, confidence);

  return {
    looksPaymentRelated,
    issuerName,
    issuerEmail,
    amountValue: amountExtraction.amountValue,
    currency: amountExtraction.currency,
    dueDate,
    dueDateEstimated,
    paidStatus,
    documentType,
    category,
    confidence: Number(confidence.toFixed(3)),
    reasons,
    matchedFragments,
  };
}
