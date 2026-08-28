import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Studio Mixer",
  description: "Epic Music Space mixer workspace.",
};

export default function StudioMixerPage(): never {
  redirect("/studio/try?mode=mix");
}
