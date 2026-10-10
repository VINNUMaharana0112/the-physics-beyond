import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../src/repository.js';

function setupProduct({ price_minor = 1250, currency = 'INR', payment_link_enabled = true } = {}) {
  const statements = [];
  const product = { id: '12345678-1234-4234-8234-123456789012', price_minor, currency, kind: 'physical_book', active: true,
    price_confirmed: true, fulfillment_ready: true, storage_key: null, stock: 5, payment_link_enabled };
  const client = {
    async query(sql, values) {
      statements.push({ sql, values });
      if (sql.includes('SELECT * FROM products')) return { rows: [product] };
      if (sql.includes('INSERT INTO orders')) return { rows: [{ id: 'order-1', amount_minor: values[2], currency: values[3] }] };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const repository = createRepository({ connect: async () => client });
  return { repository, statements };
}

test('order transaction prices from the locked current product row', async () => {
  const { repository, statements } = setupProduct({ price_minor: 4321, currency: 'INR' });
  const result = await repository.createOrder({ productId: '12345678-1234-4234-8234-123456789012', quantity: 2,
    amountMinor: 1, currency: 'USD', email: 'buyer@example.com', checkoutMethod: 'standard' });
  const insert = statements.find(({ sql }) => sql.includes('INSERT INTO orders'));
  assert.deepEqual(insert.values.slice(2, 4), [8642, 'INR']);
  assert.equal(result.amount_minor, 8642);
});

test('order transaction rechecks Payment Link eligibility on the locked row', async () => {
  const { repository, statements } = setupProduct({ payment_link_enabled: false });
  const result = await repository.createOrder({ productId: '12345678-1234-4234-8234-123456789012', quantity: 1,
    email: 'buyer@example.com', checkoutMethod: 'payment_link' });
  assert.equal(result, null);
  assert.equal(statements.some(({ sql }) => sql.includes('INSERT INTO orders')), false);
  assert.equal(statements.some(({ sql }) => sql === 'ROLLBACK'), true);
});
