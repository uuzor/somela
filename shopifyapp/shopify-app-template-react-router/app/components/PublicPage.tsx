import type { ReactNode } from "react";
import { Link } from "react-router";

import styles from "./PublicPage.module.css";

type PublicPageProps = {
  title: string;
  summary: string;
  children: ReactNode;
};

export function PublicPage({ title, summary, children }: PublicPageProps) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} to="/">
          OpenCommerceLens
        </Link>
        <nav className={styles.nav} aria-label="Policy navigation">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/support">Support</Link>
        </nav>
      </header>
      <article className={styles.article}>
        <p className={styles.eyebrow}>OpenCommerceLens</p>
        <h1>{title}</h1>
        <p className={styles.summary}>{summary}</p>
        <div className={styles.content}>{children}</div>
      </article>
      <footer className={styles.footer}>
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms of Service</Link>
        <Link to="/support">Support</Link>
        <Link to="/data-deletion">Data Deletion</Link>
      </footer>
    </main>
  );
}
