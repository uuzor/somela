# Shopify App Pre-Submission Test Plan

## 1. Local environment

- Use Node.js 22 LTS. The app does not support Node 24.
- Install dependencies and generate the Prisma client.
- Configure `.env` from the Shopify app's `.env.example`.
- Rotate the Shopify merchant token exposed in the previously rejected push.

```powershell
cd "C:\Users\ASUS FX95G\Documents\apps\somela\shopifyapp\shopify-app-template-react-router"
pnpm install
pnpm run setup
```

Required development environment values:

```env
DATABASE_URL=your_shared_backend_postgres_url
VOYAGE_API_KEY=your_voyage_key
SHOPIFY_BILLING_TEST=true
SCOPES=read_products,read_inventory
NODE_ENV=development
```

## 2. Link and start the app

```powershell
shopify auth login
pnpm run config:link
shopify app config validate
pnpm run dev
```

Select the OpenCommerceLens public app and a Shopify development store. Shopify
CLI should create the HTTPS tunnel, apply the development URLs and webhooks, and
provide the app installation link.

## 3. Installation and authentication

1. Install on a clean development store.
2. Approve `read_products` and `read_inventory`.
3. Confirm the install redirects into the embedded dashboard.
4. Refresh and navigate through Dashboard, Products, and Billing.
5. Confirm there are no repeated OAuth prompts.
6. Uninstall and reinstall the app.

## 4. Initial catalogue sync

1. Confirm the merchant record is created.
2. Confirm sync moves from `never` to `in_progress`, then `complete` or `partial`.
3. Confirm the free preview indexes at most 50 products.
4. Confirm additional products show as `Plan excluded`.
5. Confirm indexed products and embeddings appear in the shared backend database.
6. Search for those products through the OpenCommerceLens agent.
7. Verify shop, handle, title, description, vendor, product type, images,
   variants, options, collections, prices, sale, inventory, tax, and shipping data.
8. Confirm products without images receive text embeddings rather than failing.

## 5. Product webhook tests

Perform these changes directly in Shopify Admin:

1. Create a product.
2. Update its title, price, images, variants, colors, and sizes.
3. Change it to draft.
4. Reactivate it.
5. Delete it.

Expected results:

- Active products are indexed.
- Draft and archived products are removed from discovery.
- Updates replace the existing catalogue data.
- Deleted products are removed from products and product embeddings.
- Products over the plan limit remain excluded.

Sample webhook delivery:

```powershell
shopify app webhook trigger `
  --topic products/create `
  --address "https://YOUR-TUNNEL/webhooks/products/create" `
  --api-version 2025-10
```

Also test products/update, products/delete, customers/data_request,
customers/redact, and shop/redact. Valid signed deliveries should return 2xx;
an unsigned compliance request should return 401.

## 6. Uninstall cleanup

- Local sessions, merchant rows, and product tracking rows are removed.
- Shared catalogue products for the uninstalled shop are removed.
- The shared shop is marked inactive.
- Products belonging to other merchants remain unchanged.

## 7. Billing tests

Keep `SHOPIFY_BILLING_TEST=true` locally and test:

1. Starter subscription and its 500-product limit.
2. Growth subscription and its 5,000-product limit.
3. Pro subscription and unlimited indexing.
4. Upgrades, downgrades, and cancellation.
5. Overflow products are removed from discovery after a downgrade.
6. Cancellation restores the 50-product free preview.
7. Billing approval returns to `/app/billing` and persists after refresh.

Set `SHOPIFY_BILLING_TEST=false` in production.

## 8. Automated validation

```powershell
pnpm run typecheck
pnpm run lint
pnpm run build
shopify app config validate
```

## 9. Staging test

Deploy the React Router server to a permanent HTTPS staging host. Replace
`https://example.com` and the empty redirect list in `shopify.app.toml`, deploy
the Shopify configuration with `pnpm run deploy`, and repeat the full test plan
on a second clean development store.

## 10. App Store readiness

- Run all Shopify App Store automated checks.
- Provide reviewer instructions and a short workflow screencast.
- Provide real support, privacy policy, and terms URLs.
- Provide accurate pricing and billing instructions.
- Use persistent production session storage.
- Confirm the reviewer can install and test without contacting the developer.
- Do not submit while the app URL is `https://example.com` or redirects are empty.
