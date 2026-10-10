import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { verifyPaymentSignature, verifyWebhookSignature } from './security.js';
import { isValidUuid, validateOrderInput } from './validation.js';

const MAX_BODY_BYTES = 32 * 1024;

function createRateLimiter({ limit, windowMs }) {
  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    if (buckets.size > 10_000) {
      for (const [bucketKey, bucket] of buckets) if (bucket.expiresAt <= now) buckets.delete(bucketKey);
    }
    const bucket = buckets.get(key);
    if (!bucket || bucket.expiresAt <= now) {
      buckets.set(key, { count: 1, expiresAt: now + windowMs });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= limit;
  };
}

function send(response, status, data) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(data));
}

async function readBody(request, maxBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function validateProduct(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid product.' };
  const { slug, title, description, kind, priceMinor, currency, stock, active = false, paymentLinkEnabled = false, priceConfirmed = false, fulfillmentReady = false } = body;
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) return { error: 'Product slug is invalid.' };
  if (typeof title !== 'string' || !title.trim() || title.length > 200 || typeof description !== 'string' || description.length > 5000) return { error: 'Product title or description is invalid.' };
  if (!['physical_book', 'digital_download'].includes(kind)) return { error: 'Product kind is invalid.' };
  if (!Number.isSafeInteger(priceMinor) || priceMinor < 1 || priceMinor > 100_000_000 || typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return { error: 'Price or currency is invalid.' };
  if (stock !== null && (!Number.isSafeInteger(stock) || stock < 0)) return { error: 'Stock must be a non-negative integer or null.' };
  if (![active, paymentLinkEnabled, priceConfirmed, fulfillmentReady].every((value) => typeof value === 'boolean')) return { error: 'Product readiness fields must be boolean.' };
  if (active && (!priceConfirmed || !fulfillmentReady)) return { error: 'Confirm the final price and fulfilment readiness before activation.' };
  if (paymentLinkEnabled && !active) return { error: 'Payment Links can only be enabled on an active product.' };
  return { value: { slug, title: title.trim(), description: description.trim(), kind, priceMinor, currency, stock, active, paymentLinkEnabled, priceConfirmed, fulfillmentReady } };
}

function validateAffiliate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid affiliate offer.' };
  const { title, publisher, url, disclosure, active = false } = body;
  let parsed;
  try { parsed = new URL(url); } catch { return { error: 'Affiliate URL must be a valid HTTPS URL.' }; }
  if (typeof title !== 'string' || !title.trim() || title.length > 200 || typeof publisher !== 'string' || !publisher.trim() || publisher.length > 200 ||
      parsed.protocol !== 'https:' || typeof disclosure !== 'string' || !disclosure.trim() || disclosure.length > 1000 || typeof active !== 'boolean') {
    return { error: 'Affiliate title, publisher, HTTPS URL, disclosure, and active state are required.' };
  }
  return { value: { title: title.trim(), publisher: publisher.trim(), url: parsed.href, disclosure: disclosure.trim(), active } };
}

const fulfillmentTransitions = {
  unfulfilled: new Set(['processing', 'cancelled']),
  processing: new Set(['shipped', 'cancelled']),
  shipped: new Set(['delivered']),
  delivered: new Set(),
  cancelled: new Set(),
};

export function createApiServer({ repository, razorpay, config, adminAuth = null, fileStore = null, logger = console }) {
  const allowOrderRequest = createRateLimiter({ limit: 10, windowMs: 60_000 });
  const allowVerifyRequest = createRateLimiter({ limit: 20, windowMs: 60_000 });
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && config.allowedOrigins.includes(origin)) {
      response.setHeader('access-control-allow-origin', origin);
      response.setHeader('vary', 'Origin');
      response.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      response.setHeader('access-control-allow-headers', 'content-type, x-file-name, x-razorpay-signature, x-razorpay-event-id');
      response.setHeader('access-control-allow-credentials', 'true');
    } else if (origin) {
      send(response, 403, { error: 'Origin not allowed.' });
      return;
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url, 'http://localhost');
    try {
      if (url.pathname === '/api/admin/auth/login' && request.method === 'GET') {
        if (!adminAuth) return send(response, 503, { error: 'Admin authentication is not configured.' });
        return await adminAuth.login(response);
      }
      if (url.pathname === '/api/admin/auth/callback' && request.method === 'GET') {
        if (!adminAuth) return send(response, 503, { error: 'Admin authentication is not configured.' });
        return await adminAuth.callback(request, response, url);
      }
      if (url.pathname === '/api/admin/auth/logout' && request.method === 'POST') {
        if (!adminAuth?.session(request)) return send(response, 401, { error: 'Admin sign-in required.' });
        if (!origin || !config.allowedOrigins.includes(origin)) return send(response, 403, { error: 'Admin request origin is not allowed.' });
        adminAuth.logout(response);
        return send(response, 200, { signedOut: true });
      }
      if (url.pathname.startsWith('/api/admin/')) {
        const identity = adminAuth?.session(request);
        if (!identity) return send(response, 401, { error: 'Admin sign-in required.' });
        if (!['GET', 'HEAD'].includes(request.method) && (!origin || !config.allowedOrigins.includes(origin))) return send(response, 403, { error: 'Admin request origin is not allowed.' });
        if (url.pathname === '/api/admin/session' && request.method === 'GET') return send(response, 200, { subject: identity.subject, expiresAt: identity.expiresAt });
        if (url.pathname === '/api/admin/products' && request.method === 'GET') return send(response, 200, { products: await repository.listAdminProducts() });
        if (url.pathname === '/api/admin/products' && request.method === 'POST') {
          const validated = validateProduct(JSON.parse((await readBody(request)).toString('utf8')));
          if (validated.error) return send(response, 400, { error: validated.error });
          const product = await repository.createProduct({ ...validated.value, active: false, paymentLinkEnabled: false });
          return send(response, 201, { product });
        }
        const productMatch = url.pathname.match(/^\/api\/admin\/products\/([0-9a-f-]{36})$/i);
        if (productMatch && request.method === 'PUT') {
          const validated = validateProduct(JSON.parse((await readBody(request)).toString('utf8')));
          if (validated.error) return send(response, 400, { error: validated.error });
          const current = await repository.findProductById(productMatch[1]);
          if (!current) return send(response, 404, { error: 'Product not found.' });
          if (current.kind !== validated.value.kind && await repository.hasProductOrders(productMatch[1])) return send(response, 409, { error: 'Product type cannot change after an order exists.' });
          if (validated.value.active && validated.value.kind === 'digital_download' && !current.storage_key) return send(response, 409, { error: 'Add the private digital file before activating this product.' });
          const product = await repository.updateProduct(productMatch[1], validated.value);
          return send(response, 200, { product });
        }
        if (productMatch && request.method === 'DELETE') {
          try {
            const removed = await repository.deleteProduct(productMatch[1]);
            return removed ? send(response, 200, { deleted: true }) : send(response, 404, { error: 'Product not found.' });
          } catch (error) {
            if (error.code === '23503') return send(response, 409, { error: 'Products with order history cannot be deleted. Deactivate the product instead.' });
            throw error;
          }
        }
        const uploadMatch = url.pathname.match(/^\/api\/admin\/products\/([0-9a-f-]{36})\/file$/i);
        if (uploadMatch && request.method === 'POST') {
          if (!fileStore) return send(response, 503, { error: 'Private file storage is not configured.' });
          const product = await repository.findProductById(uploadMatch[1]);
          if (!product || product.kind !== 'digital_download') return send(response, 404, { error: 'Digital product not found.' });
          const contentType = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
          let fileName;
          try { fileName = decodeURIComponent(request.headers['x-file-name'] ?? 'download'); }
          catch { return send(response, 400, { error: 'Digital file name is invalid.' }); }
          const previousKey = product.storage_key;
          const stored = await fileStore.put(await readBody(request, 50 * 1024 * 1024), { contentType, fileName });
          let result;
          try { result = await repository.setProductFile(uploadMatch[1], stored); }
          catch (error) { await fileStore.remove?.(stored.key).catch(() => {}); throw error; }
          if (!result) { await fileStore.remove?.(stored.key); return send(response, 404, { error: 'Digital product not found.' }); }
          if (previousKey && previousKey !== stored.key) await fileStore.remove?.(previousKey).catch((error) => logger.error('Could not remove replaced private file', error));
          return send(response, 200, { product: result });
        }
        if (url.pathname === '/api/admin/orders' && request.method === 'GET') return send(response, 200, { orders: await repository.listOrders() });
        const fulfillmentMatch = url.pathname.match(/^\/api\/admin\/orders\/([0-9a-f-]{36})\/fulfillment$/i);
        if (fulfillmentMatch && request.method === 'PATCH') {
          const body = JSON.parse((await readBody(request)).toString('utf8'));
          if (!body || typeof body !== 'object' || Array.isArray(body)) return send(response, 400, { error: 'Invalid fulfilment update.' });
          const current = await repository.findOrder(fulfillmentMatch[1]);
          if (!current || current.status !== 'paid') return send(response, 404, { error: 'Paid order not found.' });
          if (!fulfillmentTransitions[current.fulfillment_status]?.has(body.status)) return send(response, 409, { error: 'This fulfilment status transition is not allowed.' });
          const tracking = typeof body.trackingReference === 'string' ? body.trackingReference.trim() : '';
          if (body.status === 'shipped' && (!tracking || tracking.length > 200)) return send(response, 400, { error: 'A shipping reference is required when marking an order shipped.' });
          const result = await repository.updateOrderFulfillment({ orderId: current.id, currentStatus: current.fulfillment_status, nextStatus: body.status, trackingReference: tracking || null });
          return result ? send(response, 200, { order: result }) : send(response, 409, { error: 'Order status changed; refresh and try again.' });
        }
        const grantMatch = url.pathname.match(/^\/api\/admin\/orders\/([0-9a-f-]{36})\/download-grant$/i);
        if (grantMatch && request.method === 'POST') {
          if (!fileStore) return send(response, 503, { error: 'Private file storage is not configured.' });
          const body = JSON.parse((await readBody(request)).toString('utf8'));
          if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.expiresAt !== 'string') return send(response, 400, { error: 'Choose a future expiry time and a download limit from 1 to 100.' });
          const expiresAt = new Date(body.expiresAt);
          if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date() || !Number.isInteger(body.maxDownloads) || body.maxDownloads < 1 || body.maxDownloads > 100) return send(response, 400, { error: 'Choose a future expiry time and a download limit from 1 to 100.' });
          const order = await repository.findOrder(grantMatch[1]);
          if (!order || order.status !== 'paid') return send(response, 409, { error: 'A paid digital order with a private file is required.' });
          const product = await repository.findProductById(order.product_id);
          if (!product || product.kind !== 'digital_download' || !product.storage_key) return send(response, 409, { error: 'A paid digital order with a private file is required.' });
          const token = randomBytes(32).toString('base64url');
          const created = await repository.createDownloadGrant({ orderId: grantMatch[1], tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt, maxDownloads: body.maxDownloads });
          if (!created) return send(response, 409, { error: 'A paid digital order with a private file is required.' });
          return send(response, 201, { downloadUrl: `${config.publicApiUrl.replace(/\/$/, '')}/api/downloads/${token}`, expiresAt: expiresAt.toISOString(), maxDownloads: body.maxDownloads });
        }
        if (url.pathname === '/api/admin/affiliates' && request.method === 'GET') return send(response, 200, { affiliates: await repository.listAffiliates() });
        if (url.pathname === '/api/admin/affiliates' && request.method === 'POST') {
          const validated = validateAffiliate(JSON.parse((await readBody(request)).toString('utf8')));
          if (validated.error) return send(response, 400, { error: validated.error });
          return send(response, 201, { affiliate: await repository.createAffiliate(validated.value) });
        }
        const affiliateMatch = url.pathname.match(/^\/api\/admin\/affiliates\/([0-9a-f-]{36})$/i);
        if (affiliateMatch && request.method === 'PUT') {
          const validated = validateAffiliate(JSON.parse((await readBody(request)).toString('utf8')));
          if (validated.error) return send(response, 400, { error: validated.error });
          const affiliate = await repository.updateAffiliate(affiliateMatch[1], validated.value);
          return affiliate ? send(response, 200, { affiliate }) : send(response, 404, { error: 'Affiliate offer not found.' });
        }
        if (affiliateMatch && request.method === 'DELETE') return await repository.deleteAffiliate(affiliateMatch[1]) ? send(response, 200, { deleted: true }) : send(response, 404, { error: 'Affiliate offer not found.' });
        return send(response, 404, { error: 'Not found.' });
      }
      if (url.pathname === '/api/affiliates' && request.method === 'GET') return send(response, 200, { affiliates: await repository.listPublicAffiliates() });
      const downloadMatch = url.pathname.match(/^\/api\/downloads\/([A-Za-z0-9_-]{40,64})$/);
      if (downloadMatch && request.method === 'GET') {
        if (!fileStore) return send(response, 503, { error: 'Private file storage is not configured.' });
        const tokenHash = createHash('sha256').update(downloadMatch[1]).digest('hex');
        const grant = await repository.consumeDownloadGrant(tokenHash);
        if (!grant) return send(response, 404, { error: 'Download link is expired or unavailable.' });
        const file = await fileStore.open(grant.storageKey);
        const fileName = String(grant.fileName || 'download').replace(/[\r\n"\\]/g, '_');
        const asciiFileName = fileName.replace(/[^\x20-\x7e]/g, '_');
        const encodedFileName = encodeURIComponent(fileName).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
        response.writeHead(200, { 'content-type': grant.fileContentType || 'application/octet-stream', 'content-length': file.size,
          'content-disposition': `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' });
        file.stream.pipe(response);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/health') {
        await repository.health();
        return send(response, 200, { status: 'ok' });
      }
      if (request.method === 'GET' && url.pathname === '/api/products') {
        const products = await repository.listProducts();
        return send(response, 200, { products });
      }
      if (request.method === 'POST' && url.pathname === '/api/orders') {
        if (!allowOrderRequest(`${request.socket?.remoteAddress ?? 'unknown'}:orders`)) return send(response, 429, { error: 'Too many checkout attempts. Please wait and try again.' });
        const body = JSON.parse((await readBody(request)).toString('utf8'));
        const validated = validateOrderInput(body);
        if (validated.error) return send(response, 400, { error: validated.error });
        const product = await repository.findProduct(validated.value.productId);
        if (!product) return send(response, 404, { error: 'Product is not available.' });
        const checkoutMethod = body.checkoutMethod ?? 'standard';
        if (!['standard', 'payment_link'].includes(checkoutMethod)) return send(response, 400, { error: 'Unsupported checkout method.' });
        if (checkoutMethod === 'payment_link' && !product.payment_link_enabled) return send(response, 400, { error: 'Payment Link checkout is not enabled for this product.' });
        if (product.kind === 'physical_book' && !validated.value.shippingAddress) return send(response, 400, { error: 'Shipping address is required for this product.' });
        if (product.stock !== null && product.stock !== undefined && Number(product.stock) < validated.value.quantity) return send(response, 409, { error: 'Insufficient stock.' });
        if (!product.price_confirmed || !product.fulfillment_ready || product.kind === 'digital_download' && !product.storage_key) return send(response, 409, { error: 'This product is not ready for online checkout.' });
        const order = await repository.createOrder({ ...validated.value, productId: product.id, checkoutMethod });
        if (!order) return send(response, 409, { error: 'The product is no longer available or has insufficient stock.' });
        const amount = Number(order.amount_minor);
        if (!Number.isSafeInteger(amount) || amount < 1 || typeof order.currency !== 'string') {
          await repository.setPaymentStatus({ orderId: order.id, status: 'failed', paymentId: null }).catch(() => {});
          return send(response, 409, { error: 'Product price is invalid.' });
        }
        try {
          if (checkoutMethod === 'payment_link') {
            const link = await razorpay.createPaymentLink({ amount, currency: order.currency, referenceId: order.id, description: product.title, customer: { email: validated.value.email }, notes: { local_order_id: order.id, product_slug: product.slug } });
            await repository.setRazorpayPaymentLink(order.id, link.id);
            return send(response, 201, { orderId: order.id, amount, currency: order.currency, checkoutMethod, paymentLinkUrl: link.short_url });
          }
          const rpOrder = await razorpay.createOrder({ amount, currency: order.currency, receipt: order.id, notes: { local_order_id: order.id, product_slug: product.slug } });
          await repository.setRazorpayOrder(order.id, rpOrder.id);
          return send(response, 201, { orderId: order.id, amount, currency: order.currency, razorpayOrderId: rpOrder.id, razorpayKeyId: config.keyId });
        } catch (error) {
          await repository.setPaymentStatus({ orderId: order.id, status: 'failed', paymentId: null }).catch(() => {});
          logger.error('Could not create payment order', error);
          return send(response, 502, { error: 'Could not start checkout. Please retry later.' });
        }
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/orders/')) {
        const id = url.pathname.slice('/api/orders/'.length);
        if (!isValidUuid(id)) return send(response, 400, { error: 'Invalid order id.' });
        const order = await repository.findOrder(id);
        if (!order) return send(response, 404, { error: 'Order not found.' });
        return send(response, 200, { orderId: order.id, status: order.status, amount: Number(order.amount_minor), currency: order.currency });
      }
      if (request.method === 'POST' && url.pathname === '/api/payments/verify') {
        if (!allowVerifyRequest(`${request.socket?.remoteAddress ?? 'unknown'}:verify`)) return send(response, 429, { error: 'Too many verification attempts. Please wait and try again.' });
        const body = JSON.parse((await readBody(request)).toString('utf8'));
        const { orderId, razorpay_order_id: rpOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = body ?? {};
        if (!isValidUuid(orderId) || typeof rpOrderId !== 'string' || typeof paymentId !== 'string' || typeof signature !== 'string') return send(response, 400, { error: 'Payment verification fields are invalid.' });
        const order = await repository.findOrder(orderId);
        if (!order || order.razorpay_order_id !== rpOrderId) return send(response, 404, { error: 'Order not found.' });
        if (!verifyPaymentSignature(config.keySecret, rpOrderId, paymentId, signature)) return send(response, 400, { error: 'Payment signature is invalid.' });
        const payment = await razorpay.fetchPayment(paymentId);
        if (payment.order_id !== rpOrderId) return send(response, 400, { error: 'Payment does not match this order.' });
        if (Number(payment.amount) !== Number(order.amount_minor) || payment.currency !== order.currency) return send(response, 400, { error: 'Payment amount does not match this order.' });
        const status = payment.status === 'captured' ? 'paid' : payment.status === 'failed' ? 'failed' : 'pending';
        await repository.setPaymentStatus({ orderId, status, paymentId });
        return send(response, 200, { orderId, status });
      }
      if (request.method === 'POST' && url.pathname === '/api/webhooks/razorpay') {
        const raw = await readBody(request);
        const signature = request.headers['x-razorpay-signature'];
        if (!verifyWebhookSignature(config.webhookSecret, raw, signature)) return send(response, 400, { error: 'Webhook signature is invalid.' });
        const eventId = request.headers['x-razorpay-event-id'];
        if (typeof eventId !== 'string' || eventId.length > 255) return send(response, 400, { error: 'Webhook event id is required.' });
        const event = JSON.parse(raw.toString('utf8'));
        const eventType = event.event;
        let entity;
        let status;
        if (eventType === 'payment.captured') {
          entity = event.payload?.payment?.entity;
          status = 'paid';
        } else if (eventType === 'payment.failed') {
          entity = event.payload?.payment?.entity;
          status = 'failed';
        } else if (eventType === 'order.paid') {
          entity = event.payload?.order?.entity;
          status = 'paid';
        } else if (eventType === 'payment_link.paid') {
          entity = event.payload?.payment_link?.entity;
          status = 'paid';
        } else {
          return send(response, 200, { received: true, ignored: true });
        }
        if (!entity || entity.status && eventType !== 'order.paid' && eventType !== 'payment_link.paid' && entity.status !== (status === 'paid' ? 'captured' : 'failed')) return send(response, 400, { error: 'Webhook payment state is invalid.' });
        let payment;
        if (eventType === 'payment.captured' || eventType === 'order.paid') {
          const paymentId = eventType === 'order.paid' ? entity?.payment_id : entity?.id;
          if (typeof paymentId !== 'string') return send(response, 400, { error: 'Webhook payment is invalid.' });
          payment = await razorpay.fetchPayment(paymentId);
          if (payment.status !== 'captured') return send(response, 400, { error: 'Provider has not confirmed payment capture.' });
        }
        const razorpayOrderId = eventType === 'order.paid' ? entity?.id : entity?.order_id;
        if (eventType === 'payment_link.paid') {
          const link = event.payload?.payment_link?.entity;
          if (!link || link.status !== 'paid' || Number(link.amount_paid) !== Number(link.amount) || typeof link.reference_id !== 'string') return send(response, 400, { error: 'Payment Link payload is invalid.' });
          const result = await repository.applyPaymentLinkWebhook({ eventId, eventType, orderId: link.reference_id, paymentLinkId: link.id, amountMinor: Number(link.amount_paid), currency: link.currency, paymentId: link.payments?.[0]?.payment_id ?? null });
          if (!result?.matched && !result?.duplicate) return send(response, 400, { error: 'Payment Link does not match a local order.' });
          return send(response, 200, { received: true });
        }
        if (!razorpayOrderId) return send(response, 400, { error: 'Webhook payload is invalid.' });
        const result = await repository.applyWebhook({ eventId, eventType, razorpayOrderId, paymentId: eventType === 'order.paid' ? entity.payment_id : entity.id, status, amountMinor: payment?.amount ?? entity.amount, currency: payment?.currency ?? entity.currency });
        if (!result?.matched && !result?.duplicate) return send(response, 400, { error: 'Webhook does not match a local order.' });
        return send(response, 200, { received: true });
      }
      return send(response, 404, { error: 'Not found.' });
    } catch (error) {
      if (error instanceof SyntaxError) return send(response, 400, { error: 'Request body must be valid JSON.' });
      if (error.statusCode === 400) return send(response, 400, { error: error.message });
      if (error.statusCode === 413) return send(response, 413, { error: error.message });
      if (url.pathname === '/api/admin/auth/callback') return send(response, 403, { error: 'Admin sign-in could not be completed. Start again.' });
      logger.error('API request failed', error);
      return send(response, 500, { error: 'Internal server error.' });
    }
  });
}
