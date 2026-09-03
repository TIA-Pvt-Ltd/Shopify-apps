import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const meta = () => [
  { title: "Product Customizer" },
  {
    name: "description",
    content:
      "Let customers design products in your Shopify store with live text, graphics, and fonts — then add the result to cart.",
  },
];

export const loader = async ({ request, url }) => {
  const location = url ?? new URL(request.url);

  if (location.searchParams.get("shop")) {
    throw redirect(`/app?${location.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

const FEATURES = [
  {
    title: "Live design studio",
    detail: "Shoppers add text, graphics, and shapes on a real product mockup before they buy.",
  },
  {
    title: "Your brand assets",
    detail: "Upload fonts, logos, and templates once. They appear in the storefront customizer immediately.",
  },
  {
    title: "Cart-ready previews",
    detail: "Each design saves with the order so you can print what the customer actually approved.",
  },
];

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            <svg viewBox="0 0 32 32" width="28" height="28">
              <rect x="3" y="5" width="26" height="22" rx="6" fill="#0f766e" />
              <rect x="8" y="10" width="16" height="12" rx="2" fill="#ccfbf1" />
              <path d="M11 18.5l3-3.5 2.2 2.4 3.3-4.4 3.5 5.5H11z" fill="#0f766e" />
            </svg>
          </span>
          <span>Product Customizer</span>
        </div>
        <span className={styles.badge}>Shopify app</span>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Storefront product studio</p>
          <h1 className={styles.heading}>Let customers design the product they buy.</h1>
          <p className={styles.lede}>
            Add a live customizer to any product. Shoppers place text, graphics, and brand fonts on
            the mockup, then add a print-ready design to cart.
          </p>

          {showForm ? (
            <Form className={styles.form} method="post" action="/auth/login">
              <label className={styles.label} htmlFor="shop">
                Shop domain
              </label>
              <div className={styles.row}>
                <input
                  id="shop"
                  className={styles.input}
                  type="text"
                  name="shop"
                  placeholder="your-store.myshopify.com"
                  autoComplete="on"
                  spellCheck="false"
                  required
                />
                <button className={styles.button} type="submit">
                  Log in
                </button>
              </div>
              <p className={styles.hint}>Use the myshopify.com domain for the store you want to connect.</p>
            </Form>
          ) : null}
        </section>

        <aside className={styles.preview} aria-hidden="true">
          <div className={styles.previewCard}>
            <div className={styles.previewBar}>
              <span />
              <span />
              <span />
            </div>
            <div className={styles.previewStage}>
              <div className={styles.mockShirt}>
                <div className={styles.printArea}>
                  <span className={styles.mockWordmark}>STUDIO</span>
                  <span className={styles.mockScript}>est. 2026</span>
                </div>
              </div>
            </div>
            <div className={styles.previewMeta}>
              <strong>Front · Classic tee</strong>
              <span>Text · Graphic · Fonts</span>
            </div>
          </div>
        </aside>
      </main>

      <ul className={styles.features}>
        {FEATURES.map((feature) => (
          <li key={feature.title} className={styles.feature}>
            <h2>{feature.title}</h2>
            <p>{feature.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
