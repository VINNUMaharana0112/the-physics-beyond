# Add a product to the Bookshelf

The Physics Beyond is a static website. There is no product-upload dashboard or checkout database yet. Products are added to the site files, and payments are collected through a hosted Razorpay page or link.

## Choose the right product type

### Free download

1. Put the PDF in `products/` (as with `products/physics-study-planner.pdf`).
2. Add a card in the Digital Downloads section of `bookshelf/index.html` and link its button to `/products/your-file.pdf`.
3. Only put files here when they are meant to be public. Anyone with a public file URL can download it without paying.

### Paid digital product

1. Keep the paid PDF or ebook in private storage. Do not add it to this public GitHub Pages repository or link to an unrestricted Drive URL.
2. Create a Razorpay Payment Page or Payment Link for the product after your Razorpay merchant account is activated.
3. Add a Bookshelf card and product detail page with the title, description, price, file format, what is included, and delivery method. The Buy button will link to the Razorpay hosted checkout.
4. For the first version, check Razorpay for a confirmed `Paid` status and send the buyer a private download link by email. Do not send a file based only on a screenshot or a return-to-site page.
5. Later, automated delivery will require a private file store and a server-side payment confirmation/webhook. Never put a Razorpay Key Secret in browser JavaScript or public website files.

### Printed book

1. Add the cover image to `assets/books/` and give it a descriptive filename.
2. Create a detail page under `bookshelf/<product-slug>/index.html`. The Higher Mathematics page at `bookshelf/higher-mathematics/index.html` is the current example.
3. State the author, publisher, format, price in INR, stock/availability, shipping charges or how they are confirmed, and delivery estimate.
4. When checkout is ready, link the order button to a Razorpay Payment Page or Payment Link. Collect the delivery details needed to ship the order.

### Affiliate recommendation

Affiliate recommendations are not sold through this website and do not use Razorpay. Add the retailer's affiliate URL to the relevant recommendation card, keep the affiliate disclosure visible beside the links, and retain `rel="sponsored nofollow noopener noreferrer"`.

## Set up Razorpay for the first sales

1. Create and activate your Razorpay merchant account using your own business and payment details. Keep login credentials, API secrets, bank details, and identity documents inside Razorpay; never send them in chat or add them to the website repository.
2. For a simple static site, use a Razorpay-hosted **Payment Page** as a small storefront, or make one **Payment Link** per product. Payment Pages are no-code hosted checkouts; Payment Links are useful for a single fixed-price item or an order you confirm manually.
3. For printed books, configure the fields needed for the buyer's delivery address. For digital products, collect the buyer's email address.
4. Send me the hosted checkout URL for each product. I can add it to the matching Bookshelf button. No secret key is needed for this link-based setup.
5. Keep fulfillment manual at first: confirm payment in Razorpay, then ship the book or privately email the download. Razorpay collects the payment; it does not make a public PDF link private or automatically grant access to a file stored in this repository.

Before enabling checkout, publish accurate customer-facing terms, refund/cancellation details, delivery/shipping information, privacy information, and seller contact details. Razorpay's terms require merchants to display applicable refund/cancellation and customer terms and to deliver products as described. Decide the policy details for your business before publishing them.

## What to send me for each new listing

- Product type: free download, paid download, printed book, or affiliate recommendation
- Product title, short description, author/publisher, format, and price (if applicable)
- Cover or product image, supplied as an image file
- For books: availability, shipping charge, and delivery estimate
- For downloads: what the buyer receives and the private fulfillment method; do not attach a public paid-file URL
- For Razorpay sales: the hosted Payment Page or Payment Link URL
- For affiliate items: the complete tagged retailer URL

I can add the product card and detail page, check the links, and publish the update. For paid downloads, share the payment URL and product details, not the paid file itself or any payment credentials.
