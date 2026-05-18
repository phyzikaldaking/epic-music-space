import type { Metadata } from "next";

import ElectricStudio from "./ElectricStudio";
import styles from "./studio-clean.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Try Studio | Epic Music Space",
  description: "Open the Epic Music Space studio demo and test the mixer, transport, timeline, and production tools before signing in.",
  alternates: { canonical: "/studio/try" },
  openGraph: {
    title: "Try the Epic Music Space Studio",
    description: "Preview the EMS studio surface with transport, mixer, and production controls.",
    url: "/studio/try",
  },
};

export default function StudioTryPage() {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            body {
              overflow: hidden !important;
              padding-bottom: 0 !important;
              background: #06080c !important;
            }

            body > nav,
            nav[aria-label="Epic Music Space main menu"],
            nav[aria-label="Epic Music Space mobile navigation"],
            a[href="#main-content"] {
              display: none !important;
            }
          `,
        }}
      />
      <div className={styles.cleanStudio}>
        <h1 className="sr-only">Try the Epic Music Space Studio</h1>
        <ElectricStudio />
      </div>
    </>
  );
}
