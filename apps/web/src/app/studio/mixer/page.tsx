import type { Metadata } from "next";

import ElectricStudio from "../try/ElectricStudio";
import styles from "../try/studio-clean.module.css";
import mixStyles from "../try/studio-mix.module.css";

export const metadata: Metadata = {
  title: "Studio Mixer",
  description: "Epic Music Space mixer workspace.",
};

export default function StudioMixerPage() {
  return (
    <div className={`${styles.cleanStudio} ${mixStyles.mixUpgrade}`}>
      <ElectricStudio />
    </div>
  );
}
