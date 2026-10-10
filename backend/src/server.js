import { Pool } from 'pg';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiServer } from './app.js';
import { createAdminAuth } from './admin-auth.js';
import { createPrivateFileStore } from './private-files.js';
import { createRazorpayClient } from './razorpay.js';
import { createRepository } from './repository.js';

const required = ['DATABASE_URL', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const config = {
  keyId: process.env.RAZORPAY_KEY_ID,
  keySecret: process.env.RAZORPAY_KEY_SECRET,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  allowedOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean),
  issuer: process.env.OIDC_ISSUER,
  clientId: process.env.OIDC_CLIENT_ID,
  redirectUri: process.env.OIDC_REDIRECT_URI,
  adminUiUrl: process.env.ADMIN_UI_URL,
  adminSubjects: (process.env.OIDC_ADMIN_SUBJECTS ?? '').split(',').map((value) => value.trim()).filter(Boolean),
  sessionSecret: process.env.ADMIN_SESSION_SECRET,
  publicApiUrl: process.env.PUBLIC_API_URL,
  production: process.env.NODE_ENV === 'production',
};
const paymentMode = process.env.PAYMENT_MODE ?? 'test';
if (!['test', 'live'].includes(paymentMode)) throw new Error('PAYMENT_MODE must be test or live.');
if (paymentMode === 'test' && !config.keyId.startsWith('rzp_test_')) throw new Error('Test mode requires a Razorpay test key ID.');
if (paymentMode === 'live' && config.keyId.startsWith('rzp_test_')) throw new Error('Live mode cannot use a Razorpay test key ID.');
if (config.keySecret === config.webhookSecret) throw new Error('Use a distinct Razorpay webhook secret.');
if (process.env.NODE_ENV === 'production' && config.allowedOrigins.length === 0) {
  throw new Error('CORS_ORIGINS must contain the exact website origin(s) in production.');
}
if (process.env.NODE_ENV === 'production' && process.env.PGSSL !== 'true') {
  throw new Error('PGSSL=true is required in production to verify the PostgreSQL TLS certificate.');
}
let apiOrigin;
let adminOrigin;
try {
  apiOrigin = new URL(config.publicApiUrl).origin;
  adminOrigin = new URL(config.adminUiUrl).origin;
} catch {
  throw new Error('PUBLIC_API_URL and ADMIN_UI_URL must be absolute URLs.');
}
if (!config.publicApiUrl.startsWith('https://') && process.env.NODE_ENV === 'production') throw new Error('PUBLIC_API_URL must use HTTPS in production.');
if (apiOrigin !== new URL(config.redirectUri).origin || !config.redirectUri.endsWith('/api/admin/auth/callback')) throw new Error('OIDC_REDIRECT_URI must be PUBLIC_API_URL/api/admin/auth/callback.');
if (!config.allowedOrigins.includes(adminOrigin)) throw new Error('CORS_ORIGINS must include the exact ADMIN_UI_URL origin.');
if (!process.env.PRIVATE_FILES_DIR) throw new Error('PRIVATE_FILES_DIR must point outside the public website directory.');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined });
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const adminAuth = createAdminAuth(config);
const fileStore = createPrivateFileStore({ directory: process.env.PRIVATE_FILES_DIR, publicRoot: repositoryRoot });
const server = createApiServer({
  repository: createRepository(pool),
  razorpay: createRazorpayClient({ keyId: config.keyId, keySecret: config.keySecret, apiBaseUrl: process.env.RAZORPAY_API_BASE_URL }),
  config,
  adminAuth,
  fileStore,
});
const port = Number(process.env.PORT ?? 3000);
server.listen(port, '0.0.0.0', () => console.log(`Commerce API listening on ${port}`));

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
