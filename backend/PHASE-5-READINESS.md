# Phase 5 — QA and deployment readiness

Reviewed locally on 2026-10-10. This is a readiness review of the repository implementation, not a production certification or deployment.

## QA completed

- Backend test suite: **22 passed, 0 failed** (`npm test`). Coverage includes OIDC state/PKCE/session allowlisting, admin origin checks, catalogue and checkout, Razorpay signature/provider verification, webhook replay, inventory and fulfilment gates, private downloads, and affiliate separation.
- JavaScript syntax: **passed** for all repository `.js` files with `node --check` (Node.js 24.15.0).
- Manual security review: confirmed server-side admin authorization, exact origin allowlisting on admin mutations, short-lived signed HttpOnly sessions, allowlisted admin subjects, provider-side payment confirmation, raw-body webhook signatures, order/payment amount matching, private-file path confinement, hash-only expiring download capabilities, and paid-order checks at grant creation and download.
- Fixed a checkout race: the order transaction now derives price and currency from the locked product row and rechecks Payment Link eligibility there. The payment provider receives the committed order amount. Regression coverage was added for both properties.
- Higher Mathematics remains inactive and Payment Links remain disabled for it. No live keys, payment provider, customer policy, stock quantity, or shipping terms were configured or inferred.

## Checks that require external services

- **PostgreSQL migration: not applied or database-tested.** `psql`, `pg_ctl`, `initdb`, and Docker are unavailable in this environment, and no database connection is configured. The repeatable `schema.sql` still needs to be applied to a disposable PostgreSQL database and production database, then checked for seeded catalogue state, constraints, indexes, and a second clean re-application.
- **Razorpay test flow: not run.** No test credentials or webhook endpoint are configured. Exercise Standard Checkout and a deliberately enabled Payment Link in test mode, including success, failure/retry, exact amount/currency mismatch, and webhook replay before accepting any payment.
- **OIDC: mocked tests only.** Configure the real provider, exact callback URI, client and issuer, approved immutable subject IDs, and session secret. Verify sign-in, denied non-admin identity, logout, and cookie behavior through the deployed HTTPS origins.
- **Private storage: local implementation only.** Set an absolute durable private path outside the website root, restrict service-account access, and verify persistence, backup/restore, replacement, and deletion behavior on the chosen host. A temporary container filesystem is not suitable.
- **Browser/deployment checks: not run.** The static page and API have not been published together. Validate their exact origins, credentialed CORS, TLS, static cache/security headers, admin callback, checkout, private download, shipping workflow, monitoring, and backup restoration in a staging deployment.

## Release gates

1. Provision managed PostgreSQL with verified TLS, encrypted backups, a restricted runtime role, and a separate migration role. Apply and re-apply the schema in staging first.
2. Configure a real OIDC provider and explicitly reviewed admin subject allowlist. Keep credentials and session secrets in the host secret manager.
3. Deploy the API on a private Node.js service and the website on a managed static host/CDN with TLS. Set exact API, admin, and CORS origins; configure the durable private-file volume outside the static document root.
4. Configure Razorpay **test mode** credentials and webhook secret, register the documented payment events, and complete the staging purchase and fulfilment scenarios above. Do not switch to live mode until the owner approves a separate release.
5. Confirm the Higher Mathematics payable total (including shipping/tax), stock, service area, address handling, seller contact, and published shipping/cancellation/refund terms before any activation. Its current ₹756 listing is not sufficient confirmation.
6. Set customer-data retention/deletion rules, confirm privacy disclosures, review access/logging/alerts and recovery procedures, then record the staging sign-off.

**Current state: not deployment-ready.** Infrastructure, provider configuration, merchant confirmations, staging end-to-end QA, and operational sign-off remain outstanding. Nothing was pushed or deployed in this phase.
