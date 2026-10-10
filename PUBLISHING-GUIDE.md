# Publishing guide

This repository is a static website. Publish by adding or updating HTML and metadata files, then committing and deploying through the site's existing hosting workflow. There is no content dashboard. Use the shared contract in [`content/content-metadata.schema.json`](content/content-metadata.schema.json) for articles, videos, Reels, and Bookshelf products. A metadata record is an editorial source of truth; it does not generate pages or connect to a CMS.

## Common metadata

Every record has `type`, URL-safe lowercase `slug`, `title`, short `description`, `category`, `author`, BCP 47 `language`, and editorial `status`. Add `tags`, ISO `publishedAt` / `updatedAt`, `canonicalUrl`, and `socialImage` as available. Keep the page's visible content, social tags, canonical link, and structured data consistent. Leave publication dates unset until publication. Published pages need a canonical URL and must not retain `noindex`.

## Articles

1. Copy [`articles/article-template.html`](articles/article-template.html) to `articles/<slug>/index.html`.
2. Create a metadata record with `type: article`, estimated `readingTimeMinutes`, and a `sources` list of titled direct reference URLs. Record the featured-image path and accurate alt text when used.
3. Replace every placeholder, including title, summary, category, URL, date, reading time, Article JSON-LD, sources, and related links. Keep the existing article layout and shared styles.
4. Before publishing, set the canonical URL, remove `noindex`, check links and assets, and add the article to the existing listing.

## Videos and Reels

1. Copy [`videos/video-template.html`](videos/video-template.html) to `videos/<slug>/index.html` for a video landing page. A Reel with a landing page uses the same visual template.
2. For `type: video`, record platform, platform ID and URL, embed URL, duration in seconds, thumbnail, and transcript/caption language when available. Keep the page's `VideoObject` JSON-LD, embed, transcript, date, and visible duration consistent.
3. For `type: reel`, record platform, platform URL and ID, duration (up to 180 seconds), aspect ratio, thumbnail, caption, and transcript/caption language. A Reel published only on social media can have a metadata record without a website route. If it has a website page, set its canonical URL and use `VideoObject` structured data with its real public watch URL and thumbnail.
4. Replace all placeholders, use an accurate thumbnail and descriptive accessible text, then check the embed and transcript/caption destination. Set canonical and remove `noindex` only on the finished public page.

## Bookshelf products

Product records use `productKind`, `format`, `price`, ISO currency code, and `availability`, plus type-specific fields. Keep listing and detail-page facts consistent. A `null` price means no fixed price is published; never display an invented zero price.

### Physical books

Use `productKind: physical_book`. Record author, publisher/brand, print format, cover image and alt text, included-content summary, audience, price/currency, availability, shipping-charge policy, delivery estimate, and fulfillment status. Copy [`bookshelf/higher-mathematics/index.html`](bookshelf/higher-mathematics/index.html) as the current detail-page example or adapt [`products/product-template.html`](products/product-template.html). The Higher Mathematics page currently accepts email enquiries and says availability/shipping must be confirmed; preserve those facts unless they change. Do not imply online checkout is live.

### Digital downloads

Use `productKind: digital_download`. Record the exact file format, what the customer receives, price/currency, availability, and delivery method. Free files may live under `products/` and link directly from the Bookshelf; label them free and public. Never put paid files in this public repository or link to an unrestricted file URL. Keep paid downloads unpublished for sale until private storage and an approved fulfillment flow exist. A hosted checkout URL alone does not securely deliver a file.

### Affiliate products

Use `productKind: affiliate`, with the retailer's complete tagged `affiliateUrl` and a visible disclosure beside the recommendation. Record the referred item and publisher/brand where known; state that the retailer sets the current price and handles checkout. Affiliate items are recommendations, not products sold or fulfilled by this site. Use `rel="sponsored nofollow noopener noreferrer"` on outbound affiliate links. Keep the current Amazon Associate disclosure adjacent to the Bookshelf recommendations.

## Product-page workflow

1. Choose a product type and complete a valid record using the schema. Verify facts against supplied materials; do not guess price, stock, delivery, edition, or file contents.
2. Add approved cover/media under the existing `assets/` structure with descriptive filenames and meaningful alt text.
3. For a site-owned physical book or digital product, add `bookshelf/<slug>/index.html` and a matching Bookshelf listing. Use the existing styles, brand assets, and canonical trailing-slash route.
4. For affiliate recommendations, add the item to the existing recommendation section and keep its disclosure and sponsored link attributes visible in markup.
5. Check canonical/social metadata, structured data, price/currency, status, and links before publishing. Leave unavailable checkout actions clearly described; never make a disabled placeholder look like an active purchase.

## Sales boundary

Checkout and delivery remain manual or enquiry-based as stated on each listing. A backend, payment integration, private file delivery, and payment verification are outside this publishing phase. When hosted checkout is separately configured, the product's `checkoutUrl` can point to a Razorpay Payment Page or Payment Link; configure it to collect a shipping address for a physical book or an email address for a digital order. Fulfill manually only after confirming a `Paid` status in the merchant dashboard. A screenshot or return-to-site page is not payment confirmation. A public PDF URL cannot be made private by taking payment first.

Never place payment credentials, API secrets, or paid files in public source. Before accepting payment, publish accurate seller contact, privacy, cancellation/refund, shipping, and delivery information. Automated payment confirmation and private digital delivery require the later backend phase.

## Pre-publish checklist

- Metadata conforms to `content/content-metadata.schema.json`; page, social tags, and JSON-LD agree.
- No template placeholder, `noindex`, or incorrect canonical remains on a finished public page.
- Title, description, image alt text, source/transcript links, and related links are accurate and accessible.
- Route, assets, navigation, price, and fulfillment claims match the existing site and actual offer.
- No existing page, brand asset, route, or published content was replaced unintentionally.
