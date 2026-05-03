import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Assistant | Epic Music Space",
  description: "Get song recommendations, licensing guidance, and platform help from the EMS AI assistant — powered by AI.",
};

export default function AiLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
