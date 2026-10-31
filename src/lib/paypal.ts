// Every PayPal call Lineage makes, over the REST API with plain fetch.
// With sandbox keys set, these hit api-m.sandbox.paypal.com. Without keys, a small in-memory
// simulator answers with the same shapes so the app can be explored; the UI labels that mode.

import { nanoid } from "nanoid";
import { env, mode } from "@/lib/env";
import { toPayPalValue } from "@/lib/money";

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly debugId?: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type Link = { href: string; rel: string; method?: string };

export type PayPalOrder = {
  id: string;
  status: "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";
  links?: Link[];
  purchase_units?: {
    reference_id?: string;
    custom_id?: string;
    amount?: { currency_code: string; value: string };
    payments?: { captures?: { id: string; status: string; amount: { currency_code: string; value: string } }[] };
  }[];
};

export type PayoutBatch = {
  batch_header: { payout_batch_id: string; batch_status: string; sender_batch_header?: { sender_batch_id: string } };
  items?: {
    payout_item_id: string;
    transaction_status: string;
    payout_item: { sender_item_id: string; receiver: string; amount: { value: string } };
  }[];
};

// --- HTTP ---------------------------------------------------------------------------

const globalForPayPal = globalThis as unknown as {
  paypalToken?: { value: string; expiresAt: number };
  paypalSim?: Map<string, PayPalOrder>;
  paypalSimPayouts?: Map<string, PayoutBatch>;
};

async function accessToken() {
  const cached = globalForPayPal.paypalToken;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
  const basic = Buffer.from(`${env.paypal.clientId}:${env.paypal.clientSecret}`).toString("base64");
  const res = await fetch(`${env.paypal.base}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new PayPalError(`PayPal auth failed (${res.status}). Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.`, res.status);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  globalForPayPal.paypalToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function call<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
  opts: { requestId?: string; prefer?: string; raw?: boolean } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const token = await accessToken();
    const res = await fetch(`${env.paypal.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        // Same id on a retry means PayPal performs the action once.
        ...(opts.requestId && { "PayPal-Request-Id": opts.requestId }),
        ...(opts.prefer && { Prefer: opts.prefer }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (res.status === 401 && attempt === 0) {
      globalForPayPal.paypalToken = undefined;
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      continue;
    }
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))) as { message?: string; debug_id?: string; details?: unknown; name?: string };
      throw new PayPalError(
        `PayPal ${method} ${path} failed: ${detail.message ?? detail.name ?? res.statusText}`,
        res.status,
        detail.debug_id ?? res.headers.get("paypal-debug-id") ?? undefined,
        detail.details,
      );
    }
    if (opts.raw) return (await res.text()) as T;
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

// --- Orders (checkout) --------------------------------------------------------------

export type CreateOrderInput = {
  referenceId: string; // our license or sale id
  description: string;
  amountCents: number;
  returnUrl: string;
  cancelUrl: string;
  requestId: string;
};

export async function createOrder(input: CreateOrderInput): Promise<{ id: string; approveUrl: string }> {
  if (!mode.paypal) return simulator.createOrder(input);
  const order = await call<PayPalOrder>(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          custom_id: input.referenceId,
          description: input.description.slice(0, 127),
          amount: { currency_code: "USD", value: toPayPalValue(input.amountCents) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Lineage",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
    { requestId: input.requestId, prefer: "return=representation" },
  );
  const approve = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve");
  if (!approve) throw new PayPalError("PayPal did not return an approval link", 502);
  return { id: order.id, approveUrl: approve.href };
}

export async function getOrder(orderId: string): Promise<PayPalOrder> {
  if (!mode.paypal) return simulator.getOrder(orderId);
  return call<PayPalOrder>("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

export async function captureOrder(orderId: string): Promise<PayPalOrder> {
  if (!mode.paypal) return simulator.captureOrder(orderId);
  try {
    return await call<PayPalOrder>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, {
      requestId: `capture-${orderId}`,
      prefer: "return=representation",
    });
  } catch (error) {
    // Already captured (a refresh or a webhook got there first): read the final state instead.
    if (error instanceof PayPalError && error.status === 422) {
      const order = await getOrder(orderId);
      if (order.status === "COMPLETED") return order;
    }
    throw error;
  }
}

export function captureOf(order: PayPalOrder) {
  return order.purchase_units?.[0]?.payments?.captures?.[0];
}

// --- Payouts ------------------------------------------------------------------------

export type PayoutItemInput = { receiver: string; amountCents: number; note: string; senderItemId: string };

export async function createPayoutBatch(senderBatchId: string, items: PayoutItemInput[]): Promise<PayoutBatch> {
  if (!mode.paypal) return simulator.createPayoutBatch(senderBatchId, items);
  return call<PayoutBatch>(
    "POST",
    "/v1/payments/payouts",
    {
      sender_batch_header: {
        sender_batch_id: senderBatchId,
        email_subject: "You earned royalties on Lineage",
        email_message: "Makers licensed your pattern. Thank you for designing.",
      },
      items: items.map((item) => ({
        recipient_type: "EMAIL",
        receiver: item.receiver,
        amount: { value: toPayPalValue(item.amountCents), currency: "USD" },
        note: item.note.slice(0, 4000),
        sender_item_id: item.senderItemId,
      })),
    },
    { requestId: senderBatchId },
  );
}

export async function getPayoutBatch(batchId: string): Promise<PayoutBatch> {
  if (!mode.paypal) return simulator.getPayoutBatch(batchId);
  return call<PayoutBatch>("GET", `/v1/payments/payouts/${encodeURIComponent(batchId)}?fields=batch_header,items`);
}

// --- Invoicing (license offers) -----------------------------------------------------

export type InvoiceInput = {
  recipientEmail: string;
  recipientName: string;
  itemName: string;
  itemDescription: string;
  units: number;
  unitCents: number;
  note: string;
  reference: string;
};

export async function createAndSendInvoice(input: InvoiceInput): Promise<{ id: string; payerUrl: string; qrPng?: string }> {
  if (!mode.paypal) return simulator.createInvoice(input);
  const [given, ...rest] = input.recipientName.trim().split(/\s+/);
  const created = await call<{ id?: string; href?: string; links?: Link[] }>(
    "POST",
    "/v2/invoicing/invoices",
    {
      detail: {
        currency_code: "USD",
        reference: input.reference,
        note: input.note.slice(0, 4000),
        terms_and_conditions: "A voluntary finished-item license from the pattern's designer. Paying is optional; the designer will not request a takedown while this offer is open.",
        payment_term: { term_type: "NET_30" },
      },
      invoicer: {
        ...(env.paypal.merchantEmail && { email_address: env.paypal.merchantEmail }),
        business_name: "Lineage",
      },
      primary_recipients: [
        { billing_info: { email_address: input.recipientEmail, name: { given_name: given || "Maker", surname: rest.join(" ") || "-" } } },
      ],
      items: [
        {
          name: input.itemName.slice(0, 200),
          description: input.itemDescription.slice(0, 1000),
          quantity: String(input.units),
          unit_amount: { currency_code: "USD", value: toPayPalValue(input.unitCents) },
          unit_of_measure: "QUANTITY",
        },
      ],
    },
    { requestId: `invoice-${input.reference}`, prefer: "return=representation" },
  );
  const id = created.id ?? created.href?.split("/").pop();
  if (!id) throw new PayPalError("PayPal did not return an invoice id", 502);

  await call("POST", `/v2/invoicing/invoices/${id}/send`, { send_to_invoicer: false, send_to_recipient: true }, { requestId: `send-${id}` });
  const invoice = await call<{ detail?: { metadata?: { recipient_view_url?: string } } }>("GET", `/v2/invoicing/invoices/${id}`);
  const qrPng = await call<string>("POST", `/v2/invoicing/invoices/${id}/generate-qr-code`, { width: 320, height: 320 }, { raw: true }).catch(() => undefined);

  return {
    id,
    payerUrl: invoice.detail?.metadata?.recipient_view_url ?? `https://www.sandbox.paypal.com/invoice/p/#${id}`,
    qrPng: qrPng ? extractBase64Png(qrPng) : undefined,
  };
}

// generate-qr-code answers with a multipart body around a base64 PNG.
function extractBase64Png(body: string) {
  const match = body.match(/iVBORw0KGgo[A-Za-z0-9+/=\r\n]+/);
  return match ? match[0].replace(/\s+/g, "") : undefined;
}

// --- Webhooks -----------------------------------------------------------------------

export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  if (!mode.paypal || !env.paypal.webhookId) return false;
  const result = await call<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: env.paypal.webhookId,
    webhook_event: event,
  });
  return result.verification_status === "SUCCESS";
}

// --- Transaction Search (reconciliation) --------------------------------------------

export type PayPalTransaction = {
  transaction_info: {
    transaction_id: string;
    transaction_event_code: string;
    transaction_initiation_date: string;
    transaction_amount: { value: string; currency_code: string };
    transaction_status: string;
    custom_field?: string;
  };
};

export async function searchTransactions(days = 30): Promise<PayPalTransaction[]> {
  if (!mode.paypal) return [];
  const end = new Date();
  const start = new Date(end.getTime() - Math.min(days, 31) * 86_400_000);
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  const json = await call<{ transaction_details?: PayPalTransaction[] }>(
    "GET",
    `/v1/reporting/transactions?start_date=${iso(start)}&end_date=${iso(end)}&fields=all&page_size=500`,
  );
  return json.transaction_details ?? [];
}

// --- Simulator (no keys) ------------------------------------------------------------

const simulator = {
  orders: () => (globalForPayPal.paypalSim ??= new Map()),
  payouts: () => (globalForPayPal.paypalSimPayouts ??= new Map()),

  createOrder(input: CreateOrderInput) {
    const id = `SIM${nanoid(14).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`;
    simulator.orders().set(id, {
      id,
      status: "PAYER_ACTION_REQUIRED",
      purchase_units: [{ reference_id: input.referenceId, custom_id: input.referenceId, amount: { currency_code: "USD", value: toPayPalValue(input.amountCents) } }],
    });
    const params = new URLSearchParams({ token: id, amount: toPayPalValue(input.amountCents), description: input.description, return: input.returnUrl, cancel: input.cancelUrl });
    return { id, approveUrl: `${env.appUrl}/sim/paypal?${params}` };
  },

  getOrder(orderId: string): PayPalOrder {
    const order = simulator.orders().get(orderId);
    if (!order) throw new PayPalError("Simulated order not found (the dev server may have restarted)", 404);
    return order;
  },

  approve(orderId: string) {
    const order = simulator.getOrder(orderId);
    if (order.status === "PAYER_ACTION_REQUIRED") order.status = "APPROVED";
  },

  captureOrder(orderId: string): PayPalOrder {
    const order = simulator.getOrder(orderId);
    if (order.status === "COMPLETED") return order;
    if (order.status !== "APPROVED") throw new PayPalError("Order not approved by the payer", 422);
    order.status = "COMPLETED";
    const unit = order.purchase_units![0];
    unit.payments = { captures: [{ id: `SIMCAP${nanoid(10).toUpperCase()}`, status: "COMPLETED", amount: unit.amount! }] };
    return order;
  },

  createPayoutBatch(senderBatchId: string, items: PayoutItemInput[]): PayoutBatch {
    const batch: PayoutBatch = {
      batch_header: { payout_batch_id: `SIMBATCH${nanoid(8).toUpperCase()}`, batch_status: "SUCCESS", sender_batch_header: { sender_batch_id: senderBatchId } },
      items: items.map((item) => ({
        payout_item_id: `SIMITEM${nanoid(8).toUpperCase()}`,
        transaction_status: "SUCCESS",
        payout_item: { sender_item_id: item.senderItemId, receiver: item.receiver, amount: { value: toPayPalValue(item.amountCents) } },
      })),
    };
    simulator.payouts().set(batch.batch_header.payout_batch_id, batch);
    return batch;
  },

  getPayoutBatch(batchId: string): PayoutBatch {
    const batch = simulator.payouts().get(batchId);
    if (!batch) throw new PayPalError("Simulated payout batch not found", 404);
    return batch;
  },

  createInvoice(_input: InvoiceInput) {
    const id = `SIMINV-${nanoid(10).toUpperCase()}`;
    return { id, payerUrl: `${env.appUrl}/sim/invoice/${id}`, qrPng: undefined };
  },
};

export const simulatePayerApproval = (orderId: string) => simulator.approve(orderId);
export const isSimulatedOrder = (orderId: string) => orderId.startsWith("SIM");
