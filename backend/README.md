# Commerce API and store operations

This Node.js API backs the static storefront with PostgreSQL, Razorpay, an OIDC-protected admin console, private digital files, order fulfilment, and a separate affiliate catalogue. The payment flow uses Razorpay Standard Checkout by default. Payment Links can be enabled per product. No card data passes through this API.

## Local setup and required services

1. Use Node.js 22.9 or newer and create a PostgreSQL database.
2. Copy `.env.example` to `.env` and configure it before starting the service. The payment mode defaults to `test` and the server rejects a live Razorpay key in test mode. Use a test key ID, its matching secret, and a different webhook secret.
3. Configure an OIDC identity provider with Authorization Code + PKCE for a public client. It must publish standard discovery metadata and RSA `RS256` signing keys. Register `OIDC_REDIRECT_URI` exactly at the provider. Add only approved provider subject IDs to `OIDC_ADMIN_SUBJECTS`; an email address alone does not grant admin access. Generate a random `ADMIN_SESSION_SECRET` of at least 32 bytes and keep it in the host's secret manager.
4. Set `ADMIN_UI_URL` to the deployed `/admin/` page, `PUBLIC_API_URL` to the API's public HTTPS origin, and include the exact admin website origin in `CORS_ORIGINS`. Set the `commerce-api-base` meta value on `/admin/`, `/bookshelf/`, and the Higher Mathematics page to that API origin. For local work, serve the website on port 8080 and the API on port 3000, then register those callback URLs with a development OIDC client.
5. Set `PRIVATE_FILES_DIR` to an absolute, durable directory outside the website document root and public repository. Restrict host access to the API service account; use encrypted storage and backups. The application stores generated file IDs rather than public paths and accepts PDF, EPUB, ZIP, or binary files up to 50 MB.
6. Apply `schema.sql`, install the backend dependencies, run `npm test`, and start the service. The repeatable schema seeds the three current affiliate recommendations with the published Amazon Associate disclosure. It adds Higher Mathematics at the already listed ₹756 as inactive, with price and fulfilment confirmation false and stock unset. It does not seed the free planner as a paid product.

The API requires a real OIDC configuration and a private-file directory at startup. It has no built-in password, sample admin account, or insecure fallback login. Do not commit `.env`, provider credentials, database credentials, or paid files.

## Product activation and catalogue

The public product API returns only active products with available stock. Product creation starts inactive. An authenticated admin must explicitly confirm the payable price and fulfilment setup before activation; an active digital download must also have a private file uploaded. A Payment Link can be selected only on an active product with `payment_link_enabled` deliberately set.

Higher Mathematics remains inactive until the merchant confirms that ₹756 includes all payable charges (or a reviewed server-side shipping/tax calculation is added) and confirms the stock, service area, address handling, tax, seller terms, and fulfilment process. The admin UI does not invent or calculate these policies. Its readiness check records the operator's confirmation; it is not a substitute for publishing accurate shipping, cancellation, refund, privacy, and seller information.

The three current Amazon recommendations are stored in a separate `affiliates` table, each with its tagged HTTPS retailer URL and a visible Amazon Associate disclosure. Affiliates are never commerce products, orders, or Razorpay checkouts. The public Bookshelf affiliate section can load active offers from `GET /api/affiliates`; its existing verified static cards remain as a fallback when the API is not configured or unavailable.

## Admin, payments, and fulfilment

- `/admin/` is a static admin console. Sign-in redirects through the configured OIDC provider. The API validates the ID-token signature and issuer, audience, expiry, nonce, and allowlisted subject, then issues a short-lived, HttpOnly, SameSite cookie. State and PKCE protect the sign-in flow. Admin write requests require both that session and an allowlisted browser origin.
- `GET /api/products` returns active, in-stock products. `POST /api/orders` takes the product, quantity, email, and (for physical items) shipping address. Price and currency come from PostgreSQL. Stock is reserved transactionally for a finite-inventory physical product when the checkout order is created and restored if payment fails or checkout setup fails.
- `POST /api/payments/verify` verifies the Razorpay signature and fetches provider state, order, amount, and currency. `POST /api/webhooks/razorpay` verifies the raw-body signature and applies provider events transactionally. The unique provider event ID makes replays idempotent. Configure `payment.captured`, `payment.failed`, `order.paid`, and `payment_link.paid` in the Razorpay dashboard.
- Admin order listing shows the paid state and shipping details. Physical fulfilment moves `unfulfilled → processing → shipped → delivered`; cancellation is available from `unfulfilled` or `processing`. Only paid orders can advance, and a tracking reference is required to mark an order shipped. The API prevents stale/repeated transitions.
- For a paid digital order, an admin can issue a download grant by selecting an expiry time and a download limit. The raw capability URL is shown once, the database stores only its SHA-256 hash, and the link is revoked on replacement, expires, and stops after its selected download limit. The API checks the paid order again for every download and streams the file from `PRIVATE_FILES_DIR` as an attachment. Files are never published into the website repository or served by the static host. There is no email delivery integration yet; send the generated link only through an approved private customer channel.
- Affiliate administration is separate from products and requires a disclosure for every record. Affiliate URLs must use HTTPS. `GET /api/affiliates` exposes only active offers and their disclosures; there is no endpoint that converts an affiliate offer into an order.

## API routes

Public routes:

- `GET /health`
- `GET /api/products`
- `GET /api/affiliates`
- `POST /api/orders`
- `GET /api/orders/:id` (limited order status)
- `POST /api/payments/verify`
- `POST /api/webhooks/razorpay`
- `GET /api/downloads/:capability` (paid digital grants only)

OIDC routes: `GET /api/admin/auth/login`, `GET /api/admin/auth/callback`, `GET /api/admin/session`, and `POST /api/admin/auth/logout`.

All remaining `/api/admin/*` routes require the admin session and allowed `Origin`: product create/read/update/delete and private-file upload; order listing, physical fulfilment transitions, and paid-only download grant issuance; and affiliate create/read/update/delete.

## Hosting and rollout

Use a managed static-site host/CDN with a custom domain and TLS, a private Node service, managed PostgreSQL with verified TLS and encrypted backups, and private durable file storage with restricted access. Keep database and OIDC secrets in the host secret manager. Use a separate schema migration role and a restricted runtime database role. Configure logs, alerts, backups, and health checks. Use a shared rate limiter before running multiple API instances. GitHub Pages is not the recommended long-term storefront host.

This repository contains an implementation scaffold, not a deployed system. Before production: provision and configure the identity provider, database, private storage, API host, exact website/API origins, Razorpay live credentials and webhook, product facts, and customer-facing terms; run a test-mode end-to-end purchase and download/shipping review; and complete privacy, retention, security, and operational checks. No live payment, deployment, domain change, or external provider setup has been performed.

See [Phase 5 QA and deployment readiness](PHASE-5-READINESS.md) for the checks completed, external-service limitations, and release gates. The current implementation is not deployment-ready until those gates are closed.
