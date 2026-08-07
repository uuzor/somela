import type { MetaFunction } from "react-router";

import { PublicPage } from "../components/PublicPage";

export const meta: MetaFunction = () => [
  { title: "Terms of Service | OpenCommerceLens" },
  {
    name: "description",
    content: "Terms governing use of the OpenCommerceLens Shopify app.",
  },
];

export default function TermsOfService() {
  return (
    <PublicPage
      title="Terms of Service"
      summary="Last updated August 7, 2026. These terms govern access to and use of OpenCommerceLens by Shopify merchants."
    >
      <h2>Using the service</h2>
      <p>
        OpenCommerceLens helps Shopify merchants make authorised product
        catalogues discoverable to AI shopping experiences. You must have
        authority to install the app for the connected store and must use the
        service in accordance with Shopify&apos;s terms and applicable law.
      </p>

      <h2>Merchant responsibilities</h2>
      <ul>
        <li>Provide accurate account and store information.</li>
        <li>Use the app only with product data you are authorised to share.</li>
        <li>Review catalogue visibility, accuracy, and availability.</li>
        <li>Keep Shopify credentials and account access secure.</li>
      </ul>

      <h2>Catalogue data</h2>
      <p>
        You retain ownership of your product content. You grant
        OpenCommerceLens the limited rights needed to host, transform, index,
        embed, and display that content to provide the service. You are
        responsible for ensuring that your content, images, claims, and product
        availability are lawful and accurate.
      </p>

      <h2>Availability and changes</h2>
      <p>
        We may improve, modify, suspend, or discontinue features, including
        catalogue limits and integrations. We will make reasonable efforts to
        maintain service availability but do not guarantee uninterrupted or
        error-free operation.
      </p>

      <h2>Fees</h2>
      <p>
        OpenCommerceLens is currently provided with a free catalogue preview.
        Any future paid plans will be disclosed clearly and activated only
        through an approved billing flow.
      </p>

      <h2>Disclaimer and limitation</h2>
      <p>
        AI-assisted discovery is informational and does not guarantee sales,
        traffic, ranking, availability, suitability, or merchant performance.
        To the extent permitted by law, OpenCommerceLens is provided without
        warranties and we are not liable for indirect or consequential losses.
      </p>

      <h2>Termination and contact</h2>
      <p>
        You can stop using the app by uninstalling it from Shopify. We may
        suspend access for misuse, security concerns, or legal requirements.
        Questions about these terms can be sent to
        legal@opencommercelens.com.
      </p>
    </PublicPage>
  );
}
