import type { MetaFunction } from "react-router";

import { PublicPage } from "../components/PublicPage";

export const meta: MetaFunction = () => [
  { title: "Support | OpenCommerceLens" },
  {
    name: "description",
    content: "Get help with OpenCommerceLens installation and catalogue sync.",
  },
];

export default function Support() {
  return (
    <PublicPage
      title="Support"
      summary="We help Shopify merchants install OpenCommerceLens, sync their catalogue, and resolve indexing issues."
    >
      <h2>Contact support</h2>
      <p>
        Email <a href="mailto:support@opencommercelens.com">support@opencommercelens.com</a> with
        your shop domain, a description of the issue, and relevant screenshots
        or error timestamps.
      </p>

      <h2>Common troubleshooting</h2>
      <ul>
        <li>Confirm the app is installed and has product and inventory access.</li>
        <li>Open the dashboard and check the sync status and failed count.</li>
        <li>Use resync for an individual product or start a full resync.</li>
        <li>Allow webhook processing time after creating or updating products.</li>
      </ul>

      <h2>Response target</h2>
      <p>
        We aim to respond to support requests within two business days. Urgent
        security or privacy issues should be marked clearly in the email subject.
      </p>
    </PublicPage>
  );
}
