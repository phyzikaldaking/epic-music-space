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
    <div className={styles.cleanStudio}>
      <h1 className="sr-only">Try the Epic Music Space Studio</h1>
      <ElectricStudio />
    </div>
  );
}
