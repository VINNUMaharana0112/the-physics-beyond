import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { paymentSignature, verifyPaymentSignature, verifyWebhookSignature } from '../src/security.js';
import { validateOrderInput } from '../src/validation.js';

test('payment signature accepts the exact Razorpay order and payment pair', () => {
  const signature = paymentSignature('test-secret', 'order_1', 'pay_1');
  assert.equal(verifyPaymentSignature('test-secret', 'order_1', 'pay_1', signature), true);
  assert.equal(verifyPaymentSignature('test-secret', 'order_2', 'pay_1', signature), false);
  assert.equal(verifyPaymentSignature('wrong-secret', 'order_1', 'pay_1', signature), false);
});

test('webhook signature is calculated over the unchanged raw request body', () => {
  const raw = Buffer.from('{"event":"payment.captured"}');
  const signature = createHmac('sha256', 'hook-secret').update(raw).digest('hex');
  assert.equal(verifyWebhookSignature('hook-secret', raw, signature), true);
  assert.equal(verifyWebhookSignature('hook-secret', Buffer.from('{ "event":"payment.captured"}'), signature), false);
});

test('order validation bounds quantity, checks email, and rejects extra address fields', () => {
  const valid = validateOrderInput({ productId: '12345678-1234-4234-8234-123456789012', quantity: 2, email: 'buyer@example.com' });
  assert.equal(valid.error, undefined);
  assert.equal(valid.value.email, 'buyer@example.com');
  assert.match(validateOrderInput({ ...valid.value, quantity: 11 }).error, /Quantity/);
  assert.match(validateOrderInput({ ...valid.value, email: 'bad' }).error, /email/);
  const address = { name: 'A', line1: '1 Road', city: 'City', state: 'State', postalCode: '12345', country: 'IN', rogue: 'x' };
  assert.match(validateOrderInput({ ...valid.value, shippingAddress: address }).error, /unsupported/);
});
