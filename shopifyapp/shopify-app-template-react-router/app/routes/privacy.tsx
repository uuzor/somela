import type { MetaFunction } from "react-router";

import { PublicPage } from "../components/PublicPage";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy | OpenCommerceLens" },
  {
    name: "description",
    content: "How OpenCommerceLens collects, uses, and protects information.",
  },
];

export default function PrivacyPolicy() {
  return (
    <PublicPage
      title="Privacy Policy"
      summary="Last updated August 7, 2026. This policy explains how OpenCommerceLens handles information when a Shopify merchant installs and uses the app."
    >
      <h2>Information we process</h2>
      <p>
        OpenCommerceLens processes information needed to provide catalogue
        discovery and synchronisation services, including the Shopify store
        domain, installation session, product titles, descriptions, handles,
        variants, prices, images, inventory, tags, and product status.
      </p>
      <p>
        We also process operational data such as synchronisation status, job
        results, error messages, and timestamps. We do not request customer,
        order, payment, or checkout scopes from Shopify.
      </p>

      <h2>How we use information</h2>
      <ul>
        <li>Synchronise and index the merchant&apos;s product catalogue.</li>
        <li>Generate embeddings used for AI-assisted product discovery.</li>
        <li>Provide catalogue status, resynchronisation, and support features.</li>
        <li>Secure the service, diagnose failures, and comply with legal obligations.</li>
      </ul>

      <h2>Service providers</h2>
      <p>
        We use infrastructure and processing providers to host the service,
        store application data, and generate catalogue embeddings. These
        providers process information only to perform services for
        OpenCommerceLens and under appropriate contractual or technical
        safeguards.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Catalogue and synchronisation records are retained while the app is
        installed or while needed to provide the service. When a shop
        uninstalls, OpenCommerceLens processes Shopify&apos;s uninstall and
        privacy webhooks and removes or anonymises data according to our
        operational and legal requirements.
      </p>
      <p>
        To request deletion or ask a privacy question, contact
        privacy@opencommercelens.com or use the <a href="/data-deletion">data deletion page</a>.
      </p>

      <h2>Security</h2>
      <p>
        We use encrypted transport, access controls, isolated merchant
        records, and audit-friendly operational logging. No internet service
        can guarantee absolute security, so merchants should also protect
        their Shopify accounts and credentials.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update this policy as the service changes. Material changes will
        be reflected on this page. Privacy questions can be sent to
        privacy@opencommercelens.com.
      </p>
    </PublicPage>
  );
}
