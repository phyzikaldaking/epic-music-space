import type { Metadata } from "next";

import StudioTryShell from "./try/StudioTryShell";
import styles from "./try/studio-clean.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Studio",
  description: "A full-screen EMS DAW workspace with timeline editing, mixer controls, cloud sessions, AI mix, collaboration, export, and launch readiness tools.",
};

export default function StudioIndexPage() {
  return (
    <div className={styles.cleanStudio}>
      <h1 className="sr-only">Epic Music Space Studio</h1>
      <StudioTryShell />
    </div>
  );
}
