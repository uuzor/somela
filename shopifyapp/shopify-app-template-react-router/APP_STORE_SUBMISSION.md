# OpenCommerceLens Shopify App Store Checklist

## Production configuration

Before running `shopify app deploy`, replace the placeholder domain in
`shopify.app.toml`, or copy `shopify.app.production.toml.example` to
`shopify.app.production.toml` and replace every production-domain placeholder:

```toml
application_url = "https://your-app-domain.com"

[auth]
redirect_urls = [
  "https://your-app-domain.com/auth/callback",
  "https://your-app-domain.com/auth/shopify/callback",
  "https://your-app-domain.com/api/auth/callback",
]
```

Set these production secrets on the app host:

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL`
- `SCOPES=read_products,read_inventory`
- `DATABASE_URL` for the shared OpenCommerceLens PostgreSQL catalogue
- `VOYAGE_API_KEY`
- `SHOPIFY_BILLING_TEST=false`
- `NODE_ENV=production`
- `PORT`, if the host does not inject one

The Shopify session, merchant, and sync-tracking models use the same managed
PostgreSQL service as isolated `shopify_app_*` tables. Container startup runs
the Shopify storage and durable webhook queue migrations before serving.

Verify production readiness after deployment:

1. Request `GET /health` and expect HTTP 200 with database and queue `ready`.
2. Run `shopify app deploy --config production` after creating the production
   TOML file.
3. Install or re-authenticate the development store so its session is written
   to PostgreSQL.

## Merchant workflow to test

1. Install on a clean development store.
2. Confirm the 50-product free preview starts and reaches `complete` or `partial`.
3. Create, update, archive, reactivate, and delete products in Shopify.
4. Confirm each change is reflected in the app and shared AI catalogue.
5. Subscribe to each billing plan in test mode and verify 500, 5,000, and unlimited limits.
6. Uninstall and confirm the shop's products are removed from discovery.
7. Trigger all three compliance webhooks and confirm valid requests return 200 and invalid HMAC requests return 401.
8. Test install, billing, navigation, and uninstall on desktop and mobile Shopify admin.

## Listing assets and policies

Prepare these before opening the App Store review page:

- 1200 x 1200 PNG or JPEG app icon
- Listing name, subtitle, detailed description, and feature list
- Screenshots showing setup, catalogue status, products, and billing
- Pricing that exactly matches the Shopify Billing API plans
- Public privacy policy, terms of service, support URL, and support email
- Reviewer instructions and a development-store test path
- Clear disclosure that product catalogue data and product images are processed for AI search embeddings

Suggested positioning:

> Install OpenCommerceLens and make your Shopify catalogue discoverable to AI shopping agents, with automatic product updates and plan-aware indexing.

Do not claim guaranteed traffic, sales, placement, or support by every AI agent.

## Submission

1. Create or select the public app in the Shopify Dev Dashboard.
2. Set App Store distribution and complete configuration, contact, and emergency contact fields.
3. Add the compliance webhook configuration by deploying `shopify.app.toml`.
4. Create the primary-language listing and select the closest accurate category and features.
5. Opt out of protected customer data because this app requests only product and inventory scopes.
6. Run Shopify's automated checks and test on a development store.
7. Provide concise reviewer instructions, including billing-test behavior and how to verify indexed products.
8. Submit from the App Store review page and respond to all reviewer feedback there.

## Current blockers

- `shopify.app.toml` still contains `https://example.com` and no redirect URLs.
- The in-app documentation/support links still require real OpenCommerceLens public URLs.
- A real production hostname is still required in the production TOML.
- The initial full-catalogue sync still runs in the web process; move full
  resync jobs into the durable queue before supporting very large catalogues.
