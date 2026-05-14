"use client";

import ElectricStudio from "./ElectricStudio";
import styles from "./studio-clean.module.css";

export const dynamic = "force-dynamic";

export default function StudioTryPage() {
  return <div className={styles.cleanStudio}><ElectricStudio /></div>;
}
