# Commerce catalogue review

This inventory was checked against the current Bookshelf pages on 2026-10-10. It separates site-owned paid products from free downloads and third-party affiliate recommendations. Affiliate offers are stored in their own table and cannot be used to create orders.

| Offer | Type | Verified details | State for payment testing |
| --- | --- | --- | --- |
| Higher Mathematics | Site-owned physical book | Title, author Maharana Sibasankar, self-published by Inno Mind Academy, printed format, ₹756 listed price, 7–10 day estimate | Seeded at 75,600 paise and kept inactive. Confirm shipping charges, stock, service area, tax treatment, seller terms, and fulfilment before activation. |
| Physics Study Planner | Free public PDF | Existing public file at `/products/physics-study-planner.pdf`; Bookshelf labels it free | Not a paid product and excluded from the payment database. |
| Six Easy Pieces | Amazon affiliate recommendation | Richard P. Feynman; tagged Amazon India search link | Seeded separately with the published Amazon Associate disclosure. Never sold or fulfilled by this site. |
| Astrophysics for People in a Hurry | Amazon affiliate recommendation | Neil deGrasse Tyson; tagged Amazon India search link | Seeded separately with the published Amazon Associate disclosure. Never sold or fulfilled by this site. |
| Conceptual Physics | Amazon affiliate recommendation | Paul G. Hewitt; tagged Amazon India search link | Seeded separately with the published Amazon Associate disclosure. Never sold or fulfilled by this site. |

The book's current page explicitly says to confirm delivery availability and shipping charges by email. The API currently charges listed product price times quantity and does not calculate shipping or tax. Do not activate it, create a Payment Link, or accept test orders until the merchant confirms that ₹756 includes all payable charges or a reviewed server-side shipping/tax calculation is implemented, and approves stock, service area, address, refund and fulfilment terms. The database and admin UI require explicit price and fulfilment confirmations before activation; `payment_link_enabled` is off by default and requires deliberate operator enablement on an active product.

Before activation, publish the seller's legal/business contact, refund/cancellation and shipping terms; set a retention and deletion schedule for order/address data; confirm the database provider's encryption-at-rest and backup settings; and review the updated privacy notice against the actual hosting, support and fulfillment operators.

No paid digital download is listed. The free planner remains a public free resource, not a paid product. Do not convert it or the affiliate recommendations into paid site products. Paid files uploaded later must use the private file store and paid-order grants; never copy them into the public repository. The source facts are in [`../bookshelf/index.html`](../bookshelf/index.html) and [`../bookshelf/higher-mathematics/index.html`](../bookshelf/higher-mathematics/index.html).
