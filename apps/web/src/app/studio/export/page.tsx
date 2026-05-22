import type { Metadata } from "next";

import ElectricStudio from "../try/ElectricStudio";
import styles from "../try/studio-clean.module.css";

export const metadata: Metadata = {
  title: "Studio Export",
  description: "Epic Music Space export workspace.",
};

export default function StudioExportPage() {
  return (
    <div className={styles.cleanStudio}>
      <ElectricStudio initialMode="export" />
    </div>
  );
}
