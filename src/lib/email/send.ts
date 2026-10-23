import "server-only";
import { LEGAL_COMPANY } from "@/src/lib/legal/config.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FETCH_TIMEOUT_MS = 8000;
const MAX_SUBJECT_LENGTH = 200;
const DEFAULT_FROM = '"Xadrez Digital" <no-reply@xadrez.digital>';

export type SendEmailInput = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  tag: string;
  idempotencyKey?: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

export type SendEmailResult = { ok: true; id: string } | { ok: false; reason: string };

let missingKeyWarned = false;

/** Test-only reset for the once-per-process no-key warning. */
export function __resetEmailTestState(): void {
  missingKeyWarned = false;
}

function hasCRLF(value: string): boolean {
  return value.includes("\r") || value.includes("\n");
}

function resolveFrom(): string {
  return process.env.EMAIL_FROM ?? DEFAULT_FROM;
}

function resolveReplyTo(replyTo?: string): string {
  return replyTo ?? process.env.EMAIL_REPLY_TO ?? LEGAL_COMPANY.contact;
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" ||
      error.name === "AbortError" ||
      error.name === "AbortTimeoutError")
  );
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { to, subject, html, text, tag, idempotencyKey, replyTo, headers } = input;

  if (!to || to.includes(",") || to.includes(";") || hasCRLF(to)) {
    return { ok: false, reason: "invalid_to" };
  }
  if (!subject || hasCRLF(subject)) {
    return { ok: false, reason: "invalid_subject" };
  }
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return { ok: false, reason: "subject_too_long" };
  }
  if (headers) {
    for (const [name, value] of Object.entries(headers)) {
      if (!name || hasCRLF(name) || hasCRLF(value)) {
        return { ok: false, reason: "invalid_headers" };
      }
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!missingKeyWarned) {
      missingKeyWarned = true;
      console.warn(`[email] RESEND_API_KEY missing, skipped ${tag}`);
    }
    return { ok: false, reason: "not_configured" };
  }

  const body: Record<string, unknown> = {
    from: resolveFrom(),
    reply_to: resolveReplyTo(replyTo),
    to,
    subject,
  };
  if (html !== undefined) {
    body.html = html;
  }
  if (text !== undefined) {
    body.text = text;
  }
  if (headers !== undefined) {
    body.headers = headers;
  }

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey ?? crypto.randomUUID(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      console.error(`[email] send failed status=timeout tag=${tag}`);
      return { ok: false, reason: "timeout" };
    }
    console.error(`[email] send failed status=network tag=${tag}`);
    return { ok: false, reason: "network_error" };
  }

  if (!response.ok) {
    console.error(`[email] send failed status=${response.status} tag=${tag}`);
    return { ok: false, reason: "resend_error" };
  }

  let id = "";
  try {
    const data = (await response.json()) as { id?: unknown };
    if (typeof data.id === "string") {
      id = data.id;
    }
  } catch {
    // Resend always returns { id } on 2xx; a missing field must not turn a
    // success into an error.
  }
  return { ok: true, id };
}
