import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Make your catalogue discoverable to AI shoppers</h1>
        <p className={styles.text}>
          OpenCommerceLens syncs your Shopify products into an AI-ready catalogue
          so customers can discover the right products through natural language.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shopify store domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>Example: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
              <strong>AI-ready product catalogue</strong>. Sync product details,
              variants, images, inventory, and embeddings for agent discovery.
          </li>
          <li>
              <strong>Automatic synchronisation</strong>. Keep products indexed
              when they are created, updated, or deleted in Shopify.
          </li>
          <li>
              <strong>Catalogue controls</strong>. Monitor indexing status and
              manage your free catalogue preview from the Shopify admin.
          </li>
        </ul>
        <nav className={styles.policies} aria-label="Legal and support links">
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
          <a href="/support">Support</a>
          <a href="/data-deletion">Data Deletion</a>
        </nav>
      </div>
    </div>
  );
}
