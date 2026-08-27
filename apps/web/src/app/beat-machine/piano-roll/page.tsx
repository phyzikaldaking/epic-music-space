import { redirect } from "next/navigation";

export default function BeatMachinePianoRollPage() {
  redirect("/studio?mode=beat");
}
