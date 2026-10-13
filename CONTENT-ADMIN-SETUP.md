# Connect the Publishing Studio

The Publishing Studio is separate from the checkout system. It stores the site's articles, public videos, book listings, digital product details, and affiliate recommendations. Only signed-in Sanity users can edit or publish. Published content and uploaded images are public, so do not upload private or paid-for files here.

## Connected project

The Sanity project is configured with project ID `e0mmj6n8`, the public `production` dataset, and the hosted editor at [the-physics-beyond.sanity.studio](https://the-physics-beyond.sanity.studio/). The website's `/admin/` page links to this editor. Sign in with an account that has access to the project to create or publish content.

## One-time connection

1. Sign in to [Sanity Manage](https://www.sanity.io/manage) with the account that owns the project and confirm its dataset named `production` is public. The Free plan currently includes hosted Studio, public datasets, image assets, and up to 20 seats; check the current [Sanity plan details](https://www.sanity.io/pricing) before adding collaborators.
2. The project ID, public dataset and hosted Studio URL are already configured in this repository. To redeploy schema or editor changes, use the `studio` folder:

   ```powershell
   npm install
   npx sanity@latest deploy
   ```

   Sign in when prompted. The existing Studio address is `https://the-physics-beyond.sanity.studio/`.

3. In Sanity Manage, add `https://thephysicsbeyond.com` and `https://www.thephysicsbeyond.com` under the project's CORS origins if the browser reports a cross-origin access error.
4. Publish the site changes to the Cloudflare Pages production branch. Once the updated site is live, `/admin/` opens the hosted Studio, and published content appears in the matching website section.

If Sanity Manage asks whether the dataset is public or private, choose public. The website uses unauthenticated, read-only CDN requests; do not add a write token or secret to the website files.

Sanity's browser-based Studio deployment is documented at [Hosting and deployment](https://www.sanity.io/docs/studio/deployment). Public website reads use Sanity's [API CDN](https://www.sanity.io/docs/content-lake/api-cdn).
