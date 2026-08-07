import type { MetaFunction } from "react-router";

import { PublicPage } from "../components/PublicPage";

export const meta: MetaFunction = () => [
  { title: "Data Deletion | OpenCommerceLens" },
  {
    name: "description",
    content: "Request deletion of OpenCommerceLens merchant data.",
  },
];

export default function DataDeletion() {
  return (
    <PublicPage
      title="Data Deletion"
      summary="Request deletion of your OpenCommerceLens store data or ask a privacy question."
    >
      <h2>Uninstalling the app</h2>
      <p>
        Uninstall OpenCommerceLens from your Shopify admin to stop the service.
        Shopify sends an uninstall notification that we use to remove the
        connected store&apos;s catalogue and application records.
      </p>

      <h2>Request deletion</h2>
      <p>
        Email <a href="mailto:privacy@opencommercelens.com">privacy@opencommercelens.com</a> from
        the store owner email address and include your shop domain. We may ask
        for additional information to verify the request before processing it.
      </p>

      <h2>Processing time</h2>
      <p>
        We will acknowledge a verified request and process eligible data
        deletion requests within the period required by applicable law. Some
        records may be retained where necessary for security, fraud prevention,
        dispute resolution, or legal compliance.
      </p>
    </PublicPage>
  );
}
