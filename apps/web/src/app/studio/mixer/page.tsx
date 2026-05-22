import type { Metadata } from "next";

import ElectricStudio from "../try/ElectricStudio";
import styles from "../try/studio-clean.module.css";

export const metadata: Metadata = {
  title: "Studio Mixer",
  description: "Epic Music Space mixer workspace.",
};

export default function StudioMixerPage() {
  return (
    <div className={styles.cleanStudio}>
      <ElectricStudio initialMode="mix" />
    </div>
  );
}
