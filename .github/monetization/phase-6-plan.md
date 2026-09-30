# Phase 6: Website Monetization

## Objective

Build a trustworthy Bookshelf and partnership system that supports six revenue streams, then activate each one with real offers, accounts, and disclosures. Keep the editorial experience useful and separate commercial placements from independent explanations.

## Approved revenue streams

| Order | Revenue stream | Website role | Activation requirements |
|---|---|---|---|
| 1 | Original digital products: PDFs, eBooks, planners, and diaries | Product listings on Bookshelf with an external checkout and delivery link | Product files, descriptions, seller details, price/currency, checkout and file-delivery provider |
| 2 | Printed books from Inno Mind Academy, Inno Mind Solutions, and The Physics Beyond | Publisher-labelled book listings on Bookshelf | Titles, publisher/imprint, ISBN where applicable, prices, inventory or print-on-demand provider, shipping and returns details |
| 3 | Affiliate book recommendations | Curated recommendations alongside relevant Bookshelf categories and articles | Approved affiliate program, destination links, and a clear disclosure near recommendations |
| 4 | Google AdSense | Clearly separated ad placements on suitable content pages | AdSense account/site approval, publisher configuration, policy review, and any required consent controls |
| 5 | Other publisher ad networks | Additional, policy-compatible placements on suitable content pages | Network selection, site approval, ad code, privacy/consent review, and confirmation that placements do not harm usability |
| 6 | Sponsorships and brand partnerships | Partnership inquiry information for YouTube, Instagram, the site, and future channels | Media kit, audience and engagement data, contact route, sponsor fit, and platform/legal disclosures |

## Recommended additional revenue

After the core six have a working foundation, consider short courses and workshops, educator/school licensing, a paid learning community, and newsletter sponsorships. Start these only when there is a clear audience need and a manageable delivery plan.

## Current repository audit

- The site is static and hosted on GitHub Pages; it has no built-in cart, payment processing, or digital-file delivery backend.
- `/bookshelf/` is an existing catalogue page, but its products are still described as coming soon.
- `products/product-template.html` is a noindex template with placeholder product data and a disabled purchase button.
- No affiliate links, ad code, publisher identifiers, product checkout links, or sponsorship media kit are present in the repository.
- Therefore, the first site work is to define a real product and checkout/delivery path, then build listings from actual product information. Do not publish fabricated prices, availability, or purchase destinations.

## Implementation sequence

1. Select the first digital product and the checkout/delivery provider; create one complete product listing and validate the buyer journey.
2. Add the printed catalogue using the same Bookshelf structure, with the correct publisher and fulfilment details on each listing.
3. Add curated affiliate recommendations and place clear commission disclosures next to the recommendations and links.
4. Prepare the site for AdSense and apply when the content and account are ready; keep ads distinct from navigation, purchase buttons, and editorial content.
5. Assess additional publisher networks one at a time against their current policies, audience fit, consent requirements, and page experience.
6. Prepare a sponsorship page/media kit after channel analytics are available; offer clearly scoped placements and label sponsored content.

## Editorial and advertising guardrails

- Keep scientific explanations independent of commercial relationships; identify sponsored or affiliate content clearly.
- Do not encourage ad clicks, buy click-exchange traffic, or use paid-to-click schemes. Google prohibits artificial clicks and traffic-exchange programs for AdSense publishers.
- Review current platform policies and local disclosure/privacy requirements before activating each account or code integration.
- Do not place ads where they resemble article controls, product purchase links, or navigation.

## Source references

- Google AdSense site readiness: https://support.google.com/adsense/answer/7299563
- Google AdSense program policies: https://support.google.com/adsense/answer/48182
- YouTube monetization eligibility and features: https://support.google.com/youtube/answer/72857
- YouTube paid promotion disclosure: https://support.google.com/youtube/answer/154235
- FTC affiliate and endorsement disclosure guidance (United States): https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking
