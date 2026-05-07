import type { Metadata } from "next";
import GuestSaveClient from "./GuestSaveClient";

export const metadata: Metadata = {
  title: "Save your mix — Epic Music Space",
  description: "One email, one tap. We'll keep your mix and walk you to publish.",
};

export const dynamic = "force-dynamic";

export default function GuestSavePage() {
  return <GuestSaveClient />;
}
