import type { Metadata } from "next";
import SimplifiedHomePage from "@/components/SimplifiedHomePage";

export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: "Epic Music Space — Create, Collaborate, Sell, Discover" },
  description: "A simple music workspace where creators and fans choose their own workflow: create, collaborate, sell, or discover.",
  alternates: { canonical: "/" },
};

export default function SimpleHomeRoute() {
  return <SimplifiedHomePage />;
}
