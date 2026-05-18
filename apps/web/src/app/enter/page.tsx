import type { Metadata } from "next";

import EnterStudioPortal from "./EnterStudioPortal";

export const metadata: Metadata = {
  title: "Enter Epic Music Space",
  description: "Boot into the Epic Music Space world before opening the studio.",
  alternates: { canonical: "/enter" },
};

export default function EnterPage() {
  return <EnterStudioPortal />;
}
