import type { Metadata } from "next";
import ProStudioClient from "./ProStudioClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Try the Studio — no signup",
  description:
    "Make a beat, record a take, and mix in the compact EMS Pro Studio interface.",
};

export default function StudioTryPage() {
  return <ProStudioClient />;
}
