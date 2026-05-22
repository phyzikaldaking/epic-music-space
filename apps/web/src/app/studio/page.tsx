import type { Metadata } from "next";

import ElectricStudio from "./try/ElectricStudio";
import styles from "./try/studio-clean.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Studio Editor",
  description: "Epic Music Space production editor workspace.",
};

export default function StudioIndexPage() {
  return (
    <div className={styles.cleanStudio}>
      <h1 className="sr-only">Epic Music Space Studio Editor</h1>
      <ElectricStudio />
    </div>
  );
}
