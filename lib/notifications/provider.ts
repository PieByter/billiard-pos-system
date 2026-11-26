export type NotificationChannel = 'email' | 'whatsapp' | 'log';

export type NotificationConfig = {
  preferred: NotificationChannel;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  label: string;
};

function maskRecipient(value: string): string {
  const text = value.trim();
  if (text.includes('@')) {
    const [name, domain] = text.split('@');
    return `${name.slice(0, 2)}***@${domain}`;
  }
  return `${text.slice(0, 4)}***${text.slice(-2)}`;
}

export function getNotificationConfig(): NotificationConfig {
  const emailEnabled = Boolean(process.env.RESEND_API_KEY);
  const whatsappEnabled = Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
  );
  const preferred: NotificationChannel = emailEnabled
    ? 'email'
    : whatsappEnabled
      ? 'whatsapp'
      : 'log';
  return {
    preferred,
    emailEnabled,
    whatsappEnabled,
    label: emailEnabled
      ? 'Email (Resend)'
      : whatsappEnabled
        ? 'WhatsApp Cloud API'
        : 'Log lokal (demo)',
  };
}

export async function deliverNotification(input: {
  channel: NotificationChannel;
  recipient: string;
  subject?: string | null;
  body: string;
}): Promise<{ ok: boolean; provider: string; error?: string }> {
  if (input.channel === 'log') {
    console.info('[notification:log]', {
      to: maskRecipient(input.recipient),
      subject: input.subject,
      bodyLength: input.body.length,
    });
    return { ok: true, provider: 'log' };
  }

  if (input.channel === 'email') {
    const key = process.env.RESEND_API_KEY;
    if (!key) return { ok: false, provider: 'resend', error: 'RESEND_API_KEY belum diisi.' };
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.NOTIFICATION_FROM_EMAIL ?? 'Cue & Tap <noreply@cuetap.id>',
        to: [input.recipient],
        subject: input.subject ?? 'Cue & Tap',
        text: input.body,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, provider: 'resend', error: text.slice(0, 500) || 'Gagal kirim email.' };
    }
    return { ok: true, provider: 'resend' };
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return {
      ok: false,
      provider: 'whatsapp',
      error: 'WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID belum diisi.',
    };
  }
  const response = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: input.recipient.replace(/[^\d]/g, ''),
        type: 'text',
        text: { body: input.body },
      }),
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { ok: false, provider: 'whatsapp', error: text.slice(0, 500) || 'Gagal kirim WhatsApp.' };
  }
  return { ok: true, provider: 'whatsapp' };
}
