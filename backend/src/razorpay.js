export function createRazorpayClient({ keyId, keySecret, apiBaseUrl = 'https://api.razorpay.com/v1', fetchImpl = fetch }) {
  async function request(path, options = {}) {
    const response = await fetchImpl(`${apiBaseUrl}${path}`, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'content-type': 'application/json',
        ...options.headers,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error('Payment provider request failed.');
      error.statusCode = 502;
      throw error;
    }
    return data;
  }

  return {
    createOrder({ amount, currency, receipt, notes }) {
      return request('/orders', { method: 'POST', body: JSON.stringify({ amount, currency, receipt, notes }) });
    },
    createPaymentLink({ amount, currency, referenceId, description, customer, notes }) {
      return request('/payment_links', { method: 'POST', body: JSON.stringify({ amount, currency, reference_id: referenceId, description, customer, notes, accept_partial: false, reminder_enable: false, notify: { sms: false, email: false } }) });
    },
    fetchPayment(paymentId) {
      return request(`/payments/${encodeURIComponent(paymentId)}`);
    },
  };
}
