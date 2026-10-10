import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { createApiServer } from '../src/app.js';
import { paymentSignature } from '../src/security.js';

const productId = '12345678-1234-4234-8234-123456789012';
const localOrderId = '12345678-1234-4234-8234-123456789013';

function setup() {
  const calls = [];
  const seenWebhookEvents = new Set();
  let productStorageKey = null;
  let checkoutOrderAmount = null;
  const order = { id: localOrderId, product_id: productId, amount_minor: 2500, currency: 'INR', status: 'pending', fulfillment_status: 'unfulfilled', kind: 'physical_book', razorpay_order_id: 'order_provider_1' };
  const repository = {
    async health() {},
    async listProducts() { return [{ id: productId, slug: 'book', title: 'Book', priceMinor: 2500, currency: 'INR' }]; },
    async findProduct() { return { id: productId, slug: 'book', kind: 'digital_download', price_minor: 2500, currency: 'INR', stock: null, payment_link_enabled: true, price_confirmed: true, fulfillment_ready: true, storage_key: '12345678-1234-4234-8234-123456789014' }; },
    async createOrder(input) { calls.push(['createOrder', input]); return { id: localOrderId, amount_minor: checkoutOrderAmount ?? 2500 * input.quantity, currency: 'INR' }; },
    async setRazorpayOrder(...args) { calls.push(['setRazorpayOrder', ...args]); },
    async setRazorpayPaymentLink(...args) { calls.push(['setRazorpayPaymentLink', ...args]); },
    async findOrder() { return order; },
    async setPaymentStatus(input) { calls.push(['setPaymentStatus', input]); },
    async applyWebhook(input) { const duplicate = seenWebhookEvents.has(input.eventId); calls.push(['applyWebhook', input, { duplicate }]); if (duplicate) return { matched: true, duplicate: true }; seenWebhookEvents.add(input.eventId); return { matched: true }; },
    async applyPaymentLinkWebhook(input) { calls.push(['applyPaymentLinkWebhook', input]); if (seenWebhookEvents.has(input.eventId)) return { matched: true, duplicate: true }; seenWebhookEvents.add(input.eventId); return { matched: true }; },
    async listAdminProducts() { return []; },
    async findProductById() { return { id: productId, kind: 'digital_download', storage_key: productStorageKey }; },
    async hasProductOrders() { return false; },
    async createProduct(input) { calls.push(['createProduct', input]); return { id: productId, ...input }; },
    async updateProduct(id, input) { calls.push(['updateProduct', id, input]); return { id, ...input }; },
    async deleteProduct() { return true; },
    async setProductFile(id, file) { calls.push(['setProductFile', id, file]); productStorageKey = file.key; return {}; },
    async listOrders() { return [order]; },
    async updateOrderFulfillment(input) { calls.push(['updateOrderFulfillment', input]); order.fulfillment_status = input.nextStatus; return { id: input.orderId, fulfillmentStatus: input.nextStatus }; },
    async createDownloadGrant(input) { calls.push(['createDownloadGrant', input]); return true; },
    async consumeDownloadGrant(hash) { calls.push(['consumeDownloadGrant', hash]); return { storageKey: '12345678-1234-4234-8234-123456789014', fileName: 'book.pdf', fileContentType: 'application/pdf' }; },
    async listAffiliates() { return []; },
    async listPublicAffiliates() { return []; },
    async createAffiliate(input) { return input; },
    async updateAffiliate(id, input) { return { id, ...input }; },
    async deleteAffiliate() { return true; },
  };
  const razorpay = {
    async createOrder(input) { calls.push(['providerCreateOrder', input]); return { id: 'order_provider_1' }; },
    async createPaymentLink(input) { calls.push(['providerCreatePaymentLink', input]); return { id: 'plink_1', short_url: 'https://rzp.io/i/test' }; },
    async fetchPayment(id) { calls.push(['fetchPayment', id]); return { id, order_id: 'order_provider_1', amount: 2500, currency: 'INR', status: 'captured' }; },
  };
  const server = createApiServer({ repository, razorpay, config: { allowedOrigins: ['https://thephysicsbeyond.com'], keyId: 'rzp_test_public', keySecret: 'api-secret', webhookSecret: 'hook-secret', publicApiUrl: 'https://api.thephysicsbeyond.com' },
    adminAuth: { session(request) { return request.headers.cookie === 'tpb_admin=valid' ? { subject: 'operator-1', expiresAt: 2000000000 } : null; }, logout() {} },
    fileStore: { async put(buffer, input) { calls.push(['putPrivateFile', input]); return { key: '12345678-1234-4234-8234-123456789014', ...input }; }, async open() { return { stream: Readable.from([Buffer.from('private')]), size: 7 }; } }, logger: { error() {} } });
  return { server, calls, order, setProductStorageKey(value) { productStorageKey = value; }, setCheckoutOrderAmount(value) { checkoutOrderAmount = value; } };
}

async function invoke(server, method, url, { headers = {}, body = '' } = {}) {
  const request = Readable.from([Buffer.from(body)]);
  request.method = method;
  request.url = url;
  request.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  const response = {
    headers: {},
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    writeHead(status, headers = {}) { this.status = status; Object.entries(headers).forEach(([key, value]) => this.setHeader(key, value)); },
    end(value = '') { this.body = value; this.resolve(); },
  };
  const ended = new Promise((resolve) => { response.resolve = resolve; });
  server.emit('request', request, response);
  await ended;
  return { status: response.status, headers: response.headers, json: () => JSON.parse(response.body || '{}') };
}

async function withServer(fn) {
  const { server, calls, order, setProductStorageKey, setCheckoutOrderAmount } = setup();
  return fn(server, calls, order, setProductStorageKey, setCheckoutOrderAmount);
}

test('health, catalogue and CORS allowlist', async () => withServer(async (server) => {
  assert.equal((await invoke(server, 'GET', '/health')).status, 200);
  const catalog = await invoke(server, 'GET', '/api/products');
  assert.equal(catalog.json().products.length, 1);
  assert.equal((await invoke(server, 'GET', '/health', { headers: { origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await invoke(server, 'GET', '/health', { headers: { origin: 'https://thephysicsbeyond.com' } })).headers['access-control-allow-origin'], 'https://thephysicsbeyond.com');
}));

test('order creation uses server product price and returns only the public Razorpay key', async () => withServer(async (server, calls) => {
  const response = await invoke(server, 'POST', '/api/orders', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId, quantity: 2, email: 'Buyer@Example.com', clientPrice: 1 }) });
  assert.equal(response.status, 201);
  const body = response.json();
  assert.equal(body.amount, 5000);
  assert.equal(body.razorpayKeyId, 'rzp_test_public');
  assert.equal(JSON.stringify(body).includes('api-secret'), false);
  assert.equal(calls.find(([name]) => name === 'providerCreateOrder')[1].amount, 5000);
  assert.equal(calls.find(([name]) => name === 'createOrder')[1].email, 'buyer@example.com');
  assert.equal(calls.find(([name]) => name === 'createOrder')[1].checkoutMethod, 'standard');
}));

test('checkout uses the price committed in its locked database order', async () => withServer(async (server, calls, _order, _setProductStorageKey, setCheckoutOrderAmount) => {
  setCheckoutOrderAmount(4321);
  const response = await invoke(server, 'POST', '/api/orders', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId, quantity: 2, email: 'buyer@example.com' }) });
  assert.equal(response.status, 201);
  assert.equal(response.json().amount, 4321);
  assert.equal(calls.find(([name]) => name === 'providerCreateOrder')[1].amount, 4321);
  assert.equal(Object.hasOwn(calls.find(([name]) => name === 'createOrder')[1], 'amountMinor'), false);
}));

test('Payment Link checkout is explicitly selected and server priced', async () => withServer(async (server, calls) => {
  const response = await invoke(server, 'POST', '/api/orders', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId, quantity: 1, email: 'buyer@example.com', checkoutMethod: 'payment_link' }) });
  assert.equal(response.status, 201);
  assert.equal(response.json().paymentLinkUrl, 'https://rzp.io/i/test');
  assert.equal(response.json().checkoutMethod, 'payment_link');
  const input = calls.find(([name]) => name === 'providerCreatePaymentLink')[1];
  assert.equal(input.amount, 2500);
  assert.equal(input.referenceId, localOrderId);
  assert.equal(input.notes.local_order_id, localOrderId);
}));

test('checkout verification validates signature and confirms provider capture', async () => withServer(async (server, calls) => {
  const signature = paymentSignature('api-secret', 'order_provider_1', 'pay_1');
  const response = await invoke(server, 'POST', '/api/payments/verify', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: localOrderId, razorpay_order_id: 'order_provider_1', razorpay_payment_id: 'pay_1', razorpay_signature: signature }) });
  assert.equal(response.status, 200);
  assert.equal(response.json().status, 'paid');
  assert.deepEqual(calls.find(([name]) => name === 'setPaymentStatus')[1], { orderId: localOrderId, status: 'paid', paymentId: 'pay_1' });
}));

test('webhook verifies the exact body and passes an idempotency key to storage', async () => withServer(async (server, calls) => {
  const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_provider_1', amount: 2500, currency: 'INR', status: 'captured' } } } });
  const signature = createHmac('sha256', 'hook-secret').update(raw).digest('hex');
  const response = await invoke(server, 'POST', '/api/webhooks/razorpay', { headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature, 'x-razorpay-event-id': 'evt_1' }, body: raw });
  assert.equal(response.status, 200);
  assert.deepEqual(calls.find(([name]) => name === 'applyWebhook')[1], { eventId: 'evt_1', eventType: 'payment.captured', razorpayOrderId: 'order_provider_1', paymentId: 'pay_1', status: 'paid', amountMinor: 2500, currency: 'INR' });
  const bad = await invoke(server, 'POST', '/api/webhooks/razorpay', { headers: { 'x-razorpay-signature': signature, 'x-razorpay-event-id': 'evt_2' }, body: raw + ' ' });
  assert.equal(bad.status, 400);
  const orderPaid = JSON.stringify({ event: 'order.paid', payload: { order: { entity: { id: 'order_provider_1', payment_id: 'pay_1' } } } });
  const orderPaidSignature = createHmac('sha256', 'hook-secret').update(orderPaid).digest('hex');
  const orderPaidResponse = await invoke(server, 'POST', '/api/webhooks/razorpay', { headers: { 'x-razorpay-signature': orderPaidSignature, 'x-razorpay-event-id': 'evt_order_paid' }, body: orderPaid });
  assert.equal(orderPaidResponse.status, 200);
  assert.deepEqual(calls.filter(([name]) => name === 'applyWebhook')[1][1], { eventId: 'evt_order_paid', eventType: 'order.paid', razorpayOrderId: 'order_provider_1', paymentId: 'pay_1', status: 'paid', amountMinor: 2500, currency: 'INR' });
}));

test('Payment Link webhook requires exact amount and associates its local reference', async () => withServer(async (server, calls) => {
  const raw = JSON.stringify({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: 'plink_1', reference_id: localOrderId, status: 'paid', amount: 2500, amount_paid: 2500, currency: 'INR', payments: [{ payment_id: 'pay_link_1' }] } } } });
  const signature = createHmac('sha256', 'hook-secret').update(raw).digest('hex');
  const response = await invoke(server, 'POST', '/api/webhooks/razorpay', { headers: { 'x-razorpay-signature': signature, 'x-razorpay-event-id': 'evt_link_1' }, body: raw });
  assert.equal(response.status, 200);
  assert.deepEqual(calls.find(([name]) => name === 'applyPaymentLinkWebhook')[1], { eventId: 'evt_link_1', eventType: 'payment_link.paid', orderId: localOrderId, paymentLinkId: 'plink_1', amountMinor: 2500, currency: 'INR', paymentId: 'pay_link_1' });
  const underpaid = raw.replace('"amount_paid":2500', '"amount_paid":1000');
  const underpaidSignature = createHmac('sha256', 'hook-secret').update(underpaid).digest('hex');
  assert.equal((await invoke(server, 'POST', '/api/webhooks/razorpay', { headers: { 'x-razorpay-signature': underpaidSignature, 'x-razorpay-event-id': 'evt_link_underpaid' }, body: underpaid })).status, 400);
}));

test('order creation is rate limited', async () => withServer(async (server) => {
  const request = { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId, quantity: 1, email: 'buyer@example.com' }) };
  for (let attempt = 0; attempt < 10; attempt += 1) assert.equal((await invoke(server, 'POST', '/api/orders', request)).status, 201);
  assert.equal((await invoke(server, 'POST', '/api/orders', request)).status, 429);
}));

test('admin endpoints require an authenticated session and an allowlisted mutation origin', async () => withServer(async (server) => {
  assert.equal((await invoke(server, 'GET', '/api/admin/products')).status, 401);
  assert.equal((await invoke(server, 'GET', '/api/admin/products', { headers: { cookie: 'tpb_admin=valid' } })).status, 200);
  const payload = { slug: 'new-book', title: 'New book', description: '', kind: 'physical_book', priceMinor: 5000, currency: 'INR', stock: 3, active: true, paymentLinkEnabled: false, priceConfirmed: false, fulfillmentReady: false };
  assert.equal((await invoke(server, 'POST', '/api/admin/products', { headers: { cookie: 'tpb_admin=valid', 'content-type': 'application/json', origin: 'https://attacker.example' }, body: JSON.stringify(payload) })).status, 403);
  assert.equal((await invoke(server, 'POST', '/api/admin/products', { headers: { cookie: 'tpb_admin=valid', 'content-type': 'application/json', origin: 'https://thephysicsbeyond.com' }, body: JSON.stringify(payload) })).status, 400);
}));

test('product activation requires explicit price and fulfilment readiness and a private file for digital offers', async () => withServer(async (server, calls) => {
  const body = { slug: 'digital-notes', title: 'Digital notes', description: 'Notes', kind: 'digital_download', priceMinor: 100, currency: 'INR', stock: null, active: true, paymentLinkEnabled: false, priceConfirmed: true, fulfillmentReady: true };
  const noPrivateFile = await invoke(server, 'PUT', `/api/admin/products/${productId}`, { headers: { cookie: 'tpb_admin=valid', origin: 'https://thephysicsbeyond.com', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(noPrivateFile.status, 409);
  const upload = await invoke(server, 'POST', `/api/admin/products/${productId}/file`, { headers: { cookie: 'tpb_admin=valid', origin: 'https://thephysicsbeyond.com', 'content-type': 'application/pdf', 'x-file-name': 'notes.pdf' }, body: 'private file' });
  assert.equal(upload.status, 200);
  assert.equal(calls.find(([name]) => name === 'setProductFile')[2].fileName, 'notes.pdf');
  const activated = await invoke(server, 'PUT', `/api/admin/products/${productId}`, { headers: { cookie: 'tpb_admin=valid', origin: 'https://thephysicsbeyond.com', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(activated.status, 200);
  assert.equal(calls.find(([name]) => name === 'updateProduct')[2].active, true);
  const notReady = await invoke(server, 'PUT', `/api/admin/products/${productId}`, { headers: { cookie: 'tpb_admin=valid', origin: 'https://thephysicsbeyond.com', 'content-type': 'application/json' }, body: JSON.stringify({ ...body, priceConfirmed: false }) });
  assert.equal(notReady.status, 400);
}));

test('affiliate records stay separate from paid checkout and require disclosure', async () => withServer(async (server) => {
  const offers = await invoke(server, 'GET', '/api/affiliates');
  assert.equal(offers.status, 200);
  assert.ok(Array.isArray(offers.json().affiliates));
  const invalid = await invoke(server, 'POST', '/api/admin/affiliates', { headers: { cookie: 'tpb_admin=valid', origin: 'https://thephysicsbeyond.com', 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Book', publisher: 'Author', url: 'https://retailer.example/item', active: true }) });
  assert.equal(invalid.status, 400);
}));

test('physical fulfilment requires paid order, valid transitions, and a tracking reference to ship', async () => withServer(async (server, calls, order) => {
  const body = JSON.stringify({ status: 'shipped', trackingReference: '' });
  const unauth = await invoke(server, 'PATCH', `/api/admin/orders/${localOrderId}/fulfillment`, { headers: { origin: 'https://thephysicsbeyond.com', 'content-type': 'application/json' }, body });
  assert.equal(unauth.status, 401);
  const unpaid = await invoke(server, 'PATCH', `/api/admin/orders/${localOrderId}/fulfillment`, { headers: { cookie: 'tpb_admin=valid', origin: 'https://thephysicsbeyond.com', 'content-type': 'application/json' }, body });
  assert.equal(unpaid.status, 404);
  order.status = 'paid';
  const invalidTransition = await invoke(server, 'PATCH', `/api/admin/orders/${localOrderId}/fulfillment`, { headers: { cookie: 'tpb_admin=valid', origin: 'https://thephysicsbeyond.com', 'content-type': 'application/json' }, body });
  assert.equal(invalidTransition.status, 409);
  const processing = await invoke(server, 'PATCH', `/api/admin/orders/${localOrderId}/fulfillment`, { headers: { cookie: 'tpb_admin=valid', origin: 'https://thephysicsbeyond.com', 'content-type': 'application/json' }, body: JSON.stringify({ status: 'processing' }) });
  assert.equal(processing.status, 200);
  const noTracking = await invoke(server, 'PATCH', `/api/admin/orders/${localOrderId}/fulfillment`, { headers: { cookie: 'tpb_admin=valid', origin: 'https://thephysicsbeyond.com', 'content-type': 'application/json' }, body });
  assert.equal(noTracking.status, 400);
  const shipped = await invoke(server, 'PATCH', `/api/admin/orders/${localOrderId}/fulfillment`, { headers: { cookie: 'tpb_admin=valid', origin: 'https://thephysicsbeyond.com', 'content-type': 'application/json' }, body: JSON.stringify({ status: 'shipped', trackingReference: 'TRACK-123' }) });
  assert.equal(shipped.status, 200);
  const replay = await invoke(server, 'PATCH', `/api/admin/orders/${localOrderId}/fulfillment`, { headers: { cookie: 'tpb_admin=valid', origin: 'https://thephysicsbeyond.com', 'content-type': 'application/json' }, body: JSON.stringify({ status: 'shipped', trackingReference: 'TRACK-123' }) });
  assert.equal(replay.status, 409);
  assert.equal(calls.filter(([name]) => name === 'updateOrderFulfillment').length, 2);
}));

test('download grant is available only to an authenticated admin for paid digital orders', async () => withServer(async (server, calls, order, setProductStorageKey) => {
  const route = `/api/admin/orders/${localOrderId}/download-grant`;
  const payload = { expiresAt: new Date(Date.now() + 60_000).toISOString(), maxDownloads: 2 };
  assert.equal((await invoke(server, 'POST', route, { headers: { 'content-type': 'application/json', origin: 'https://thephysicsbeyond.com' }, body: JSON.stringify(payload) })).status, 401);
  const unpaid = await invoke(server, 'POST', route, { headers: { cookie: 'tpb_admin=valid', 'content-type': 'application/json', origin: 'https://thephysicsbeyond.com' }, body: JSON.stringify(payload) });
  assert.equal(unpaid.status, 409);
  order.status = 'paid'; order.kind = 'digital_download'; setProductStorageKey('12345678-1234-4234-8234-123456789014');
  const response = await invoke(server, 'POST', route, { headers: { cookie: 'tpb_admin=valid', 'content-type': 'application/json', origin: 'https://thephysicsbeyond.com' }, body: JSON.stringify(payload) });
  assert.equal(response.status, 201);
  assert.match(response.json().downloadUrl, /^https:\/\/api\.thephysicsbeyond\.com\/api\/downloads\//);
  assert.equal(calls.find(([name]) => name === 'createDownloadGrant')[1].tokenHash.length, 64);
}));

test('webhook replay reaches idempotent repository handling', async () => withServer(async (server, calls) => {
  const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_replay', order_id: 'order_provider_1', amount: 2500, currency: 'INR', status: 'captured' } } } });
  const signature = createHmac('sha256', 'hook-secret').update(raw).digest('hex');
  const headers = { 'x-razorpay-signature': signature, 'x-razorpay-event-id': 'evt_replay' };
  assert.equal((await invoke(server, 'POST', '/api/webhooks/razorpay', { headers, body: raw })).status, 200);
  assert.equal((await invoke(server, 'POST', '/api/webhooks/razorpay', { headers, body: raw })).status, 200);
  assert.equal(calls.filter(([name]) => name === 'applyWebhook').length, 2);
  assert.equal(calls.filter(([name]) => name === 'applyWebhook')[1][2].duplicate, true);
}));
