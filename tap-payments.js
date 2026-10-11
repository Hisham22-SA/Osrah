async function tapRequest(path, options = {}) {
  const secret = process.env.TAP_SECRET_KEY;
  if (!secret) throw new Error('Online payments are not configured');
  const apiBase = (process.env.TAP_API_URL || 'https://api.tap.company/v2').replace(/\/$/, '');
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`,
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.errors?.[0]?.description || payload.message || 'Payment provider request failed');
    error.providerStatus = response.status;
    throw error;
  }
  return payload;
}

export function tapConfigured() {
  return Boolean(process.env.TAP_SECRET_KEY);
}

export function paymentReturnUrl() {
  const base = process.env.OSRAH_PUBLIC_URL?.replace(/\/$/, '');
  if (!base || !base.startsWith('https://')) throw new Error('Set OSRAH_PUBLIC_URL to the public HTTPS server address before enabling real payments');
  return `${base}/payment-return`;
}

export async function createTapCheckout({ sessionId, amount, customer, description }) {
  const publicUrl = process.env.OSRAH_PUBLIC_URL?.replace(/\/$/, '');
  const redirectUrl = paymentReturnUrl();
  const nameParts = String(customer.name || 'Osrah customer').trim().split(/\s+/);
  const firstName = nameParts.shift() || 'Customer';
  const lastName = nameParts.join(' ') || 'Osrah';
  const locale = customer.language === 'ar' ? 'ar' : 'en';
  const payload = await tapRequest('/charges/', {
    method: 'POST',
    headers: { lang_code: locale },
    body: JSON.stringify({
      amount: Number((amount / 100).toFixed(2)),
      currency: 'SAR',
      customer_initiated: true,
      threeDSecure: true,
      save_card: false,
      description: description.slice(0, 120),
      metadata: { osrah_payment_session: sessionId },
      reference: { transaction: sessionId, order: sessionId },
      customer: { first_name: firstName, last_name: lastName, email: customer.email },
      source: { id: 'src_all' },
      ...(publicUrl ? { post: { url: `${publicUrl}/api/payments/tap/callback` } } : {}),
      redirect: { url: redirectUrl }
    })
  });
  const checkoutUrl = payload.transaction?.url;
  if (!payload.id || !checkoutUrl || !/^https:\/\//i.test(checkoutUrl)) throw new Error('Payment provider did not return a secure checkout link');
  return { id: payload.id, checkoutUrl, status: String(payload.status || '').toUpperCase() };
}

export async function retrieveTapCharge(id) {
  if (!/^chg_[A-Za-z0-9_-]+$/.test(id)) throw new Error('Invalid payment reference');
  return tapRequest(`/charges/${encodeURIComponent(id)}`);
}
