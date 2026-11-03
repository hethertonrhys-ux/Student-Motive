// The parts of send-push that don't talk to anything: turning claimed
// notifications into Expo messages and Web Push jobs, splitting them into
// requests of up to 100 (Expo's limit), when to send a request again while
// Expo is over its rate limit, reading Expo's answer, and deciding which
// notifications are done and which to try again on the next run.
// Kept free of Deno and npm imports so the unit tests (packages/shared/test)
// can load it too.

export type QueueRow = { id: number; user_id: string; kind: string; title: string; body: string; url: string | null };
export type TokenRow = { id: string; user_id: string; platform: "ios" | "android" | "web"; token: string; subscription: unknown };
export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: { url: string | null };
  sound: "default";
  channelId: string;
  priority: "high";
};
export type ExpoJob = { rowId: number; message: ExpoMessage };
export type WebJob = { row: QueueRow; token: TokenRow };

// How each delivery went. "retry": it never reached the phone and might next
// time (the request failed, or Expo was busy). "failed": it won't work on a
// retry either. "dead": the phone or browser is gone (its token is deleted).
export type Outcome = "ok" | "retry" | "failed" | "dead";
export type Delivery = { rowId: number; outcome: Outcome };

export const CLAIM_SIZE = 1000; // notifications claimed at a time (claim_push_batch's limit)
export const EXPO_BATCH = 100; // messages per request to Expo (Expo's limit)
export const EXPO_PARALLEL = 5; // requests to Expo at the same time (5 x 100 stays under Expo's 600 a second)
export const EXPO_TRIES = 3; // sends of one request while Expo answers 429 (too many at once)
export const WEB_PARALLEL = 10; // Web Push sends at the same time
export const RUN_BUDGET_MS = 50_000; // keep claiming until the queue is empty or this has passed
export const MAX_ATTEMPTS = 3; // after this many tries a failing notification is given up on
export const ID_CHUNK = 100; // ids per database filter (keeps request addresses short)

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Runs fn over every item, at most `limit` at a time, keeping the order of the results.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

// One Expo message per phone, one Web Push job per browser.
// priority "high": delivered straight away rather than when the phone next wakes up.
export function planDeliveries(rows: QueueRow[], tokens: TokenRow[]): { expo: ExpoJob[]; web: WebJob[] } {
  const byUser = new Map<string, TokenRow[]>();
  for (const t of tokens) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t]);
  const expo: ExpoJob[] = [];
  const web: WebJob[] = [];
  for (const row of rows) {
    for (const t of byUser.get(row.user_id) ?? []) {
      if (t.platform === "web") web.push({ row, token: t });
      else expo.push({ rowId: row.id, message: { to: t.token, title: row.title, body: row.body, data: { url: row.url }, sound: "default", channelId: "default", priority: "high" } });
    }
  }
  return { expo, web };
}

// Sends one request to Expo. When Expo answers 429 (over its limit of 600
// notifications a second), waits (1s, then 2s) and sends it again, up to
// `tries` sends in all, as Expo's own server SDK does; anything else is
// returned straight away. Returns the last answer, for readExpoAnswer.
export async function sendExpoRequest(
  post: () => Promise<{ status: number; answer: unknown }>,
  sleep: (ms: number) => Promise<void>,
  tries = EXPO_TRIES,
): Promise<{ status: number; answer: unknown }> {
  let result = await post();
  for (let n = 0; result.status === 429 && n < tries - 1; n++) {
    await sleep(1000 * 2 ** n);
    result = await post();
  }
  return result;
}

type ExpoTicket = { status?: string; message?: string; details?: { error?: string } };
type ExpoAnswer = { data?: ExpoTicket[]; errors?: { code?: string; message?: string }[] };

// Reads Expo's answer to one request. `status` is the HTTP status (0 when the
// request itself failed, e.g. no network). Expo answers each message with a
// ticket, in order.
export function readExpoAnswer(batch: ExpoJob[], status: number, answer: unknown): { deliveries: Delivery[]; dead: string[]; errors: string[] } {
  const out = answer as ExpoAnswer | null;
  const tickets = Array.isArray(out?.data) ? out.data : null;
  // No tickets: the whole request failed (network, 429, 5xx, or a bad request). Try it all again.
  if (status < 200 || status >= 300 || !tickets) {
    const why = (out?.errors ?? []).map((e) => e.message ?? e.code).filter(Boolean).join("; ") || "request failed";
    return { deliveries: batch.map((j) => ({ rowId: j.rowId, outcome: "retry" })), dead: [], errors: [`expo ${status}: ${why}`] };
  }
  const deliveries: Delivery[] = [];
  const dead: string[] = [];
  const errors: string[] = [];
  batch.forEach((job, i) => {
    const ticket = tickets[i];
    if (!ticket) {
      deliveries.push({ rowId: job.rowId, outcome: "retry" });
      return;
    }
    if (ticket.status === "error") {
      const code = ticket.details?.error ?? "";
      errors.push(code || ticket.message || "expo error");
      if (code === "DeviceNotRegistered") {
        dead.push(job.message.to);
        deliveries.push({ rowId: job.rowId, outcome: "dead" });
      } else {
        deliveries.push({ rowId: job.rowId, outcome: code === "MessageRateExceeded" ? "retry" : "failed" });
      }
      return;
    }
    deliveries.push({ rowId: job.rowId, outcome: "ok" });
  });
  return { deliveries, dead, errors };
}

// How a Web Push send went, from the error it threw (or none).
export function webOutcome(error: unknown): Outcome {
  if (error === null || error === undefined) return "ok";
  const status = (error as { statusCode?: number }).statusCode;
  if (status === 404 || status === 410) return "dead";
  if (status === undefined || status === 429 || status >= 500) return "retry";
  return "failed";
}

// Which notifications are done (marked sent) and which go back in the queue
// for the next run. A notification is only tried again when nothing of it
// reached anyone and at least one delivery might work next time, so nobody
// gets the same notification twice. One with no phones left is done.
export function settle(rowIds: number[], deliveries: Delivery[]): { sent: number[]; retry: number[] } {
  const byRow = new Map<number, Outcome[]>();
  for (const d of deliveries) byRow.set(d.rowId, [...(byRow.get(d.rowId) ?? []), d.outcome]);
  const sent: number[] = [];
  const retry: number[] = [];
  for (const id of rowIds) {
    const outcomes = byRow.get(id) ?? [];
    if (outcomes.includes("retry") && !outcomes.includes("ok")) retry.push(id);
    else sent.push(id);
  }
  return { sent, retry };
}
