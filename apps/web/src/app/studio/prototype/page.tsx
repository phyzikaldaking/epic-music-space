import type { Metadata } from "next";
import FuturisticStudioPrototype from "@/components/daw/FuturisticStudioPrototype";

export const metadata: Metadata = {
  title: "Studio · Futuristic Prototype",
  description: "Epic Music Space futuristic studio interface prototype.",
};

export default function StudioPrototypePage() {
  return <FuturisticStudioPrototype />;
}
