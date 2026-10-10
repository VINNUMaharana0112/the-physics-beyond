import { createHmac, timingSafeEqual } from 'node:crypto';

export function safeHexEqual(expected, provided) {
  if (typeof provided !== 'string' || !/^[a-f0-9]{64}$/i.test(provided)) return false;
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function paymentSignature(secret, razorpayOrderId, razorpayPaymentId) {
  return createHmac('sha256', secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
}

export function verifyPaymentSignature(secret, razorpayOrderId, razorpayPaymentId, signature) {
  return safeHexEqual(paymentSignature(secret, razorpayOrderId, razorpayPaymentId), signature);
}

export function verifyWebhookSignature(secret, rawBody, signature) {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeHexEqual(expected, signature);
}
