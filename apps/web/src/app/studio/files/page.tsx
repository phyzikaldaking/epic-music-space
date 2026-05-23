import type { Metadata } from "next";

import ElectricStudio from "../try/ElectricStudio";
import styles from "../try/studio-clean.module.css";

export const metadata: Metadata = {
  title: "Studio Files",
  description: "Epic Music Space files workspace.",
};

export default function StudioFilesPage() {
  return (
    <div className={styles.cleanStudio}>
      <ElectricStudio />
    </div>
  );
}
