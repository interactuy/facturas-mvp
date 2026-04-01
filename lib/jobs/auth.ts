import "server-only";

export function authorizeJobRequest(request: Request) {
  const expectedSecret = process.env.MAIL_EXTRACTIONS_JOB_SECRET?.trim();

  if (!expectedSecret) {
    throw new Error("Missing MAIL_EXTRACTIONS_JOB_SECRET");
  }

  const bearerToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  const headerToken = request.headers.get("x-job-secret")?.trim();
  const providedSecret = bearerToken || headerToken;

  return Boolean(providedSecret && providedSecret === expectedSecret);
}
