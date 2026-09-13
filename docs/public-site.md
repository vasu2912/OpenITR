# Public site deployment

The public site and analysis tool share the existing Cloudflare Workers Static Assets deployment. No server rendering, database, or additional hosting service is required.

## Routes

- `/` is the static homepage.
- `/how-it-works/`, `/supported-documents/`, `/scope/`, and `/faq/` are static reference pages.
- `/app/` starts the existing React analysis tool. Its session remains in memory.
- Unknown paths return the generated `404.html` with HTTP 404 through Wrangler's `404-page` setting.

## Build and preview

Run `pnpm install --frozen-lockfile`, then `pnpm build`. The build compiles the app, moves its entry to `/app/`, generates public HTML, and runs the release guard against the complete output.

Run `pnpm exec wrangler dev --port 8787` to check the built site with Cloudflare routing and headers. Open `http://localhost:8787/`. The existing `pnpm dev` command still serves the app at the root for application development. Public content changes require another build.

Edit public copy in `tools/public-site/build.mjs` and styling in `tools/public-site/public-site.css`. Keep capabilities consistent with `CONTEXT.md` and reviewed adapter and rule-pack revisions. Do not describe OpenITR as return-submission software.

## Indexing controls

The generator writes canonical URLs, social metadata, SoftwareApplication JSON-LD, a sitemap, and `robots.txt`. Public pages contain their complete text without JavaScript. The canonical origin is defined once in the generator. Change it before moving to a custom domain, and update the preview host rule if the Worker name or account subdomain changes.

The app and error page have `noindex` metadata. Non-main Cloudflare builds also mark public pages `noindex` using `WORKERS_CI_BRANCH`. A hostname-specific `_headers` rule covers version and branch preview URLs, including previews built from main. Robots remain allowed so crawlers can read the noindex instruction. Noindex is not access control.

The wildcard robots policy permits search and user-retrieval crawlers, including Googlebot, Bingbot, OAI-SearchBot, Claude-SearchBot, and Claude-User. It does not set a separate restriction on model-training crawlers. Training policy is a separate owner decision.

## Checks before production deployment

1. Run `pnpm test` and `pnpm build`.
2. Check `/`, `/app/`, a reference page, and an unknown path with local Wrangler.
3. On a Cloudflare preview URL, check that HTML responses include `X-Robots-Tag: noindex, follow`.
4. Check Cloudflare bot controls for the deployed hostname. Repository robots rules cannot override an edge block or challenge. Allow search and user-retrieval bots where those controls are available. Do not disable security controls globally.
5. After the branch is reviewed and deployed, confirm the production homepage is indexable and submit `/sitemap.xml` to search-engine webmaster tools if desired.

This branch does not change live Cloudflare dashboard settings or submit URLs to search engines. Crawlability does not guarantee indexing, ranking, or recommendations by an AI assistant.

## References

- [Cloudflare static site routing](https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/)
- [Cloudflare response header rules](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Google guidance for AI search features](https://developers.google.com/search/docs/appearance/ai-features)
- [OpenAI publisher guidance](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq)

Implementation references checked on 13 September 2026.
