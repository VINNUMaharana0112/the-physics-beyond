export function createRepository(pool) {
  async function applyPayment({ orderId, status, paymentId, client = pool }) {
    const { rows } = await client.query('SELECT o.*, p.kind FROM orders o JOIN products p ON p.id = o.product_id WHERE o.id = $1 FOR UPDATE OF o', [orderId]);
    const order = rows[0];
    if (!order || order.status === 'paid' && status !== 'paid' || order.razorpay_payment_id && paymentId && order.razorpay_payment_id !== paymentId) return null;
    if (status === 'failed' && order.status !== 'paid' && order.inventory_reserved) {
      await client.query('UPDATE products SET stock = stock + $2, updated_at = now() WHERE id = $1 AND stock IS NOT NULL', [order.product_id, order.quantity]);
    }
    const updated = await client.query(
      `UPDATE orders SET status = $2, paid_at = CASE WHEN $2 = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END,
       inventory_reserved = CASE WHEN $2 = 'failed' THEN false ELSE inventory_reserved END,
       razorpay_payment_id = COALESCE($3, razorpay_payment_id), updated_at = now() WHERE id = $1 RETURNING id, status`,
      [orderId, status, paymentId ?? null]
    );
    return updated.rows[0] ?? null;
  }

  async function applyProviderPayment({ eventId, eventType, order, paymentId, status, amountMinor, currency, paymentLinkId }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        'INSERT INTO razorpay_webhook_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id',
        [eventId, eventType]
      );
      if (!inserted.rowCount) {
        await client.query('COMMIT');
        return { matched: true, duplicate: true };
      }
      const { rows } = await client.query(
        `SELECT id FROM orders WHERE amount_minor = $2 AND currency = $3
         AND (($4::text IS NULL AND razorpay_order_id = $5) OR ($4::text IS NOT NULL AND id = $1 AND razorpay_payment_link_id = $4 AND checkout_method = 'payment_link')) FOR UPDATE`,
        [order.localId, amountMinor, currency, paymentLinkId ?? null, order.providerId]
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return { matched: false, duplicate: false };
      }
      const applied = await applyPayment({ orderId: rows[0].id, status, paymentId, client });
      if (!applied) {
        await client.query('ROLLBACK');
        return { matched: false, duplicate: false };
      }
      await client.query('COMMIT');
      return { matched: true, duplicate: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    async health() { await pool.query('SELECT 1'); },
    async listProducts() {
      const { rows } = await pool.query(
        `SELECT id, slug, title, description, kind, price_minor AS "priceMinor", currency, stock,
                payment_link_enabled AS "paymentLinkEnabled"
         FROM products WHERE active = true AND (stock IS NULL OR stock > 0) ORDER BY title`
      );
      return rows;
    },
    async listAdminProducts() {
      const { rows } = await pool.query(`SELECT id, slug, title, description, kind, price_minor AS "priceMinor", currency, active, stock,
        payment_link_enabled AS "paymentLinkEnabled", price_confirmed AS "priceConfirmed", fulfillment_ready AS "fulfillmentReady",
        storage_key AS "storageKey", file_name AS "fileName", file_content_type AS "fileContentType", created_at AS "createdAt", updated_at AS "updatedAt"
        FROM products ORDER BY title`);
      return rows;
    },
    async findProduct(id) {
      const { rows } = await pool.query('SELECT * FROM products WHERE id = $1 AND active = true', [id]);
      return rows[0] ?? null;
    },
    async findProductById(id) {
      const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
      return rows[0] ?? null;
    },
    async hasProductOrders(id) {
      const { rowCount } = await pool.query('SELECT 1 FROM orders WHERE product_id=$1 LIMIT 1', [id]);
      return rowCount > 0;
    },
    async createProduct(product) {
      const { rows } = await pool.query(
        `INSERT INTO products (slug, title, description, kind, price_minor, currency, active, stock, payment_link_enabled, price_confirmed, fulfillment_ready)
         VALUES ($1,$2,$3,$4,$5,$6,false,$7,false,$8,$9) RETURNING id`,
        [product.slug, product.title, product.description, product.kind, product.priceMinor, product.currency, product.stock, product.priceConfirmed, product.fulfillmentReady]
      );
      return this.findProductById(rows[0].id);
    },
    async updateProduct(id, product) {
      const { rows } = await pool.query(
        `UPDATE products SET slug=$2, title=$3, description=$4, kind=$5, price_minor=$6, currency=$7,
         stock=$8, active=$9, payment_link_enabled=$10, price_confirmed=$11, fulfillment_ready=$12, updated_at=now()
         WHERE id=$1 RETURNING id`,
        [id, product.slug, product.title, product.description, product.kind, product.priceMinor, product.currency, product.stock,
          product.active, product.paymentLinkEnabled, product.priceConfirmed, product.fulfillmentReady]
      );
      return rows[0] ? this.findProductById(id) : null;
    },
    async deleteProduct(id) {
      const { rowCount } = await pool.query('DELETE FROM products WHERE id=$1', [id]);
      return rowCount > 0;
    },
    async setProductFile(id, file) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(`UPDATE products SET storage_key=$2, file_name=$3, file_content_type=$4, updated_at=now()
          WHERE id=$1 AND kind='digital_download' RETURNING id`, [id, file.key, file.fileName, file.contentType]);
        if (!rows[0]) { await client.query('ROLLBACK'); return null; }
        await client.query(`UPDATE order_file_grants SET revoked_at=now() WHERE order_id IN (SELECT id FROM orders WHERE product_id=$1) AND revoked_at IS NULL`, [id]);
        const product = await client.query('SELECT * FROM products WHERE id=$1', [id]);
        await client.query('COMMIT');
        return product.rows[0] ?? null;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async createOrder(order) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: products } = await client.query('SELECT * FROM products WHERE id=$1 AND active=true FOR UPDATE', [order.productId]);
        const product = products[0];
        if (!product || !product.price_confirmed || !product.fulfillment_ready || product.kind === 'digital_download' && !product.storage_key) {
          await client.query('ROLLBACK');
          return null;
        }
        if (order.checkoutMethod === 'payment_link' && !product.payment_link_enabled) {
          await client.query('ROLLBACK');
          return null;
        }
        if (product.stock !== null && Number(product.stock) < order.quantity) {
          await client.query('ROLLBACK');
          return null;
        }
        const amountMinor = Number(product.price_minor) * order.quantity;
        if (!Number.isSafeInteger(amountMinor) || amountMinor < 1) {
          await client.query('ROLLBACK');
          return null;
        }
        const reserved = product.kind === 'physical_book' && product.stock !== null;
        if (reserved) await client.query('UPDATE products SET stock=stock-$2, updated_at=now() WHERE id=$1', [product.id, order.quantity]);
        const { rows } = await client.query(
          `INSERT INTO orders (product_id, quantity, amount_minor, currency, customer_email, shipping_address, checkout_method, status, inventory_reserved)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'created',$8) RETURNING *`,
          [product.id, order.quantity, amountMinor, product.currency, order.email, order.shippingAddress, order.checkoutMethod, reserved]
        );
        await client.query('COMMIT');
        return rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
    async setRazorpayOrder(id, razorpayOrderId) {
      const { rows } = await pool.query(`UPDATE orders SET razorpay_order_id=$2, status='pending', updated_at=now() WHERE id=$1 AND status='created' RETURNING *`, [id, razorpayOrderId]);
      return rows[0] ?? null;
    },
    async setRazorpayPaymentLink(id, paymentLinkId) {
      const { rows } = await pool.query(`UPDATE orders SET razorpay_payment_link_id=$2, checkout_method='payment_link', status='pending', updated_at=now() WHERE id=$1 AND status='created' RETURNING *`, [id, paymentLinkId]);
      return rows[0] ?? null;
    },
    async findOrder(id) {
      const { rows } = await pool.query('SELECT * FROM orders WHERE id=$1', [id]);
      return rows[0] ?? null;
    },
    async setPaymentStatus(input) {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const result = await applyPayment({ ...input, client }); await client.query(result ? 'COMMIT' : 'ROLLBACK'); return result; }
      catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async applyWebhook(input) {
      return applyProviderPayment({ ...input, order: { localId: null, providerId: input.razorpayOrderId } });
    },
    async applyPaymentLinkWebhook(input) {
      return applyProviderPayment({ ...input, order: { localId: input.orderId, providerId: null }, paymentLinkId: input.paymentLinkId, status: 'paid' });
    },
    async listOrders() {
      const { rows } = await pool.query(`SELECT o.id, o.product_id AS "productId", p.title AS "productTitle", p.kind,
        o.quantity, o.amount_minor AS "amountMinor", o.currency, o.customer_email AS "customerEmail", o.shipping_address AS "shippingAddress",
        o.status, o.fulfillment_status AS "fulfillmentStatus", o.tracking_reference AS "trackingReference", o.created_at AS "createdAt", o.paid_at AS "paidAt"
        FROM orders o JOIN products p ON p.id=o.product_id ORDER BY o.created_at DESC LIMIT 500`);
      return rows;
    },
    async updateOrderFulfillment({ orderId, currentStatus, nextStatus, trackingReference }) {
      const { rows } = await pool.query(`UPDATE orders SET fulfillment_status=$3, tracking_reference=$4, updated_at=now()
        WHERE id=$1 AND status='paid' AND fulfillment_status=$2 RETURNING id, fulfillment_status AS "fulfillmentStatus", tracking_reference AS "trackingReference"`,
      [orderId, currentStatus, nextStatus, trackingReference ?? null]);
      return rows[0] ?? null;
    },
    async createDownloadGrant({ orderId, tokenHash, expiresAt, maxDownloads }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT o.id,p.storage_key FROM orders o JOIN products p ON p.id=o.product_id
          WHERE o.id=$1 AND o.status='paid' AND p.kind='digital_download' AND p.storage_key IS NOT NULL FOR UPDATE OF o`, [orderId]);
        if (!rows[0]) { await client.query('ROLLBACK'); return false; }
        await client.query('UPDATE order_file_grants SET revoked_at=now() WHERE order_id=$1 AND revoked_at IS NULL', [orderId]);
        await client.query('INSERT INTO order_file_grants (order_id,token_hash,expires_at,max_downloads) VALUES ($1,$2,$3,$4)', [orderId, tokenHash, expiresAt, maxDownloads]);
        await client.query('COMMIT');
        return true;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async consumeDownloadGrant(tokenHash) {
      const { rows } = await pool.query(`UPDATE order_file_grants g SET download_count=download_count+1
        FROM orders o JOIN products p ON p.id=o.product_id
        WHERE g.order_id=o.id AND g.token_hash=$1 AND g.revoked_at IS NULL AND g.expires_at>now()
          AND g.download_count<g.max_downloads AND o.status='paid' AND p.kind='digital_download' AND p.storage_key IS NOT NULL
        RETURNING p.storage_key AS "storageKey", p.file_name AS "fileName", p.file_content_type AS "fileContentType"`, [tokenHash]);
      return rows[0] ?? null;
    },
    async listAffiliates() {
      const { rows } = await pool.query('SELECT id,title,publisher,url,disclosure,active FROM affiliates ORDER BY title');
      return rows;
    },
    async listPublicAffiliates() {
      const { rows } = await pool.query('SELECT id,title,publisher,url,disclosure FROM affiliates WHERE active=true ORDER BY title');
      return rows;
    },
    async createAffiliate(affiliate) {
      const { rows } = await pool.query(`INSERT INTO affiliates(title,publisher,url,disclosure,active) VALUES($1,$2,$3,$4,$5) RETURNING id,title,publisher,url,disclosure,active`,
        [affiliate.title, affiliate.publisher, affiliate.url, affiliate.disclosure, affiliate.active]);
      return rows[0];
    },
    async updateAffiliate(id, affiliate) {
      const { rows } = await pool.query(`UPDATE affiliates SET title=$2,publisher=$3,url=$4,disclosure=$5,active=$6,updated_at=now()
        WHERE id=$1 RETURNING id,title,publisher,url,disclosure,active`, [id, affiliate.title, affiliate.publisher, affiliate.url, affiliate.disclosure, affiliate.active]);
      return rows[0] ?? null;
    },
    async deleteAffiliate(id) { const { rowCount } = await pool.query('DELETE FROM affiliates WHERE id=$1', [id]); return rowCount > 0; },
  };
}
