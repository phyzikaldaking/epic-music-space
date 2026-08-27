import { redirect } from "next/navigation";

export default function BeatMachinePage() {
  redirect("/studio?mode=beat");
}
