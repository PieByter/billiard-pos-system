export type GatewayProvider = 'mock' | 'midtrans' | 'xendit';

export type GatewayConfig = {
  provider: GatewayProvider | null;
  enabled: boolean;
  label: string;
  production: boolean;
};

export type CreateQrisChargeInput = {
  orderId: string;
  amount: number;
  description?: string;
};

export type QrisCharge = {
  provider: GatewayProvider;
  providerOrderId: string;
  providerRef: string | null;
  qrString: string;
  qrUrl: string | null;
  expiresAt: Date;
  raw: Record<string, unknown>;
};

export function getGatewayConfig(): GatewayConfig {
  const requested = process.env.PAYMENT_GATEWAY?.trim().toLowerCase();
  const midtransKey = process.env.MIDTRANS_SERVER_KEY?.trim();
  const xenditKey = process.env.XENDIT_SECRET_KEY?.trim();
  const production = process.env.MIDTRANS_IS_PRODUCTION === 'true';

  if (requested === 'mock') {
    return { provider: 'mock', enabled: true, label: 'Mock QRIS (demo)', production: false };
  }
  if (requested === 'midtrans' && midtransKey) {
    return {
      provider: 'midtrans',
      enabled: true,
      label: production ? 'Midtrans QRIS' : 'Midtrans Sandbox',
      production,
    };
  }
  if (requested === 'xendit' && xenditKey) {
    return { provider: 'xendit', enabled: true, label: 'Xendit QRIS', production };
  }
  if (!requested && midtransKey) {
    return {
      provider: 'midtrans',
      enabled: true,
      label: production ? 'Midtrans QRIS' : 'Midtrans Sandbox',
      production,
    };
  }
  if (!requested && xenditKey) {
    return { provider: 'xendit', enabled: true, label: 'Xendit QRIS', production };
  }
  // Demo lokal: QR mock agar alur create-charge + settlement bisa dicoba tanpa kredensial.
  if (!requested && !midtransKey && !xenditKey && process.env.NODE_ENV !== 'production') {
    return { provider: 'mock', enabled: true, label: 'Mock QRIS (demo)', production: false };
  }
  return { provider: null, enabled: false, label: 'Manual QRIS', production: false };
}

export async function createQrisCharge(input: CreateQrisChargeInput): Promise<QrisCharge> {
  const config = getGatewayConfig();
  if (!config.enabled || !config.provider) {
    throw new Error('Payment gateway belum dikonfigurasi.');
  }

  if (config.provider === 'mock') {
    return {
      provider: 'mock',
      providerOrderId: input.orderId,
      providerRef: `mock-${input.orderId}`,
      qrString: `CUETAP-MOCK|${input.orderId}|${input.amount}`,
      qrUrl: null,
      expiresAt: new Date(Date.now() + 15 * 60_000),
      raw: { mock: true, orderId: input.orderId },
    };
  }

  if (config.provider === 'midtrans') {
    const base = config.production
      ? 'https://api.midtrans.com'
      : 'https://api.sandbox.midtrans.com';
    const key = process.env.MIDTRANS_SERVER_KEY!;
    const response = await fetch(`${base}/v2/charge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
      },
      body: JSON.stringify({
        payment_type: 'qris',
        transaction_details: {
          order_id: input.orderId,
          gross_amount: input.amount,
        },
      }),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok || typeof payload.qr_string !== 'string') {
      throw new Error(
        typeof payload.status_message === 'string'
          ? payload.status_message
          : 'Gagal membuat QRIS Midtrans.',
      );
    }
    return {
      provider: 'midtrans',
      providerOrderId: input.orderId,
      providerRef: typeof payload.transaction_id === 'string' ? payload.transaction_id : null,
      qrString: payload.qr_string,
      qrUrl: null,
      expiresAt: new Date(Date.now() + 15 * 60_000),
      raw: payload,
    };
  }

  const key = process.env.XENDIT_SECRET_KEY!;
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const response = await fetch('https://api.xendit.co/qr_codes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
    },
    body: JSON.stringify({
      reference_id: input.orderId,
      type: 'DYNAMIC',
      currency: 'IDR',
      amount: input.amount,
      expires_at: expiresAt.toISOString(),
    }),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  const qrString = typeof payload.qr_string === 'string' ? payload.qr_string : null;
  if (!response.ok || !qrString) {
    throw new Error(
      typeof payload.message === 'string' ? payload.message : 'Gagal membuat QRIS Xendit.',
    );
  }
  return {
    provider: 'xendit',
    providerOrderId: input.orderId,
    providerRef: typeof payload.id === 'string' ? payload.id : null,
    qrString,
    qrUrl: typeof payload.qr_code_url === 'string' ? payload.qr_code_url : null,
    expiresAt,
    raw: payload,
  };
}

export async function refundQrisCharge(
  providerOrderId: string,
  amount: number,
  reason: string,
): Promise<boolean> {
  const config = getGatewayConfig();
  if (!config.enabled || !config.provider) return false;
  if (config.provider === 'mock') return true;

  if (config.provider === 'midtrans') {
    const base = config.production
      ? 'https://api.midtrans.com'
      : 'https://api.sandbox.midtrans.com';
    const key = process.env.MIDTRANS_SERVER_KEY!;
    const response = await fetch(`${base}/v2/${encodeURIComponent(providerOrderId)}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
      },
      body: JSON.stringify({ amount, reason }),
    });
    return response.ok;
  }

  // Xendit refund API bergantung pada jenis payment; untuk QRIS gunakan endpoint refund.
  const key = process.env.XENDIT_SECRET_KEY!;
  const response = await fetch('https://api.xendit.co/refunds', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
    },
    body: JSON.stringify({ payment_id: providerOrderId, amount, reason }),
  });
  return response.ok;
}
