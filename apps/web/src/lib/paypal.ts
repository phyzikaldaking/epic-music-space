import { getSiteUrl } from "@/lib/site";

const PAYPAL_API_BASE =
  (process.env.PAYPAL_ENV ?? "sandbox").toLowerCase() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

type PayPalLink = {
  href: string;
  rel: string;
  method: string;
};

type PayPalOrderCreateResponse = {
  id: string;
  status: string;
  links?: PayPalLink[];
};

type PayPalCaptureResponse = {
  id: string;
  status: string;
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
      }>;
    };
  }>;
};

function getPayPalCredentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) {
    throw new Error("PayPal is not configured. Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET.");
  }
  return { clientId, clientSecret };
}

async function getPayPalAccessToken(): Promise<string> {
  const { clientId, clientSecret } = getPayPalCredentials();
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PayPal auth failed (${res.status}). ${body.slice(0, 180)}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("PayPal auth succeeded without an access token.");
  return json.access_token;
}

async function paypalRequest<T>(
  path: string,
  init: RequestInit & { requestId?: string } = {},
): Promise<T> {
  const token = await getPayPalAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  if (init.requestId) headers.set("PayPal-Request-Id", init.requestId);

  const res = await fetch(`${PAYPAL_API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const raw = await res.text().catch(() => "");
  let json: unknown = null;
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = raw;
    }
  }

  if (!res.ok) {
    const msg =
      json && typeof json === "object" && "message" in json
        ? String((json as { message?: unknown }).message ?? "")
        : raw.slice(0, 180);
    throw new Error(`PayPal API ${path} failed (${res.status}). ${msg}`);
  }

  return (json ?? {}) as T;
}

export function isPayPalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim());
}

export async function createPayPalServiceOrderCheckout(params: {
  internalOrderId: string;
  listingId: string;
  listingTitle: string;
  amountUsd: number;
}) {
  const siteUrl = getSiteUrl();
  const returnUrl =
    `${siteUrl}/dashboard/orders/${encodeURIComponent(params.internalOrderId)}` +
    `?status=paypal-return&token={order_id}`;
  const cancelUrl =
    `${siteUrl}/services/${encodeURIComponent(params.listingId)}?cancelled=1&provider=paypal`;

  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: params.internalOrderId,
        custom_id: params.internalOrderId,
        invoice_id: params.internalOrderId,
        description: params.listingTitle.slice(0, 127),
        amount: {
          currency_code: "USD",
          value: params.amountUsd.toFixed(2),
        },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "Epic Music Space",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      },
    },
  };

  const order = await paypalRequest<PayPalOrderCreateResponse>("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify(payload),
    requestId: `svc-create-${params.internalOrderId}`,
  });
  const approve =
    order.links?.find((l) => l.rel === "payer-action") ??
    order.links?.find((l) => l.rel === "approve");
  if (!approve?.href) throw new Error("PayPal create order succeeded but no approval URL was returned.");
  return { paypalOrderId: order.id, approvalUrl: approve.href, status: order.status };
}

export async function capturePayPalOrder(paypalOrderId: string, idempotencyKey: string) {
  const capture = await paypalRequest<PayPalCaptureResponse>(
    `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
    {
      method: "POST",
      body: JSON.stringify({}),
      requestId: `svc-capture-${idempotencyKey}`,
    },
  );
  const captureId =
    capture.purchase_units?.[0]?.payments?.captures?.[0]?.id ??
    null;
  const captureStatus =
    capture.purchase_units?.[0]?.payments?.captures?.[0]?.status ??
    null;
  return {
    paypalOrderId: capture.id,
    status: capture.status,
    captureId,
    captureStatus,
  };
}
