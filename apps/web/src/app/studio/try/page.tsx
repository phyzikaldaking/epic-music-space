import { auth } from "@/lib/auth";
import StudioTryClient from "./StudioTryClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function StudioTryPage() {
  return <StudioTryEntry />;
}

async function StudioTryEntry() {
  const session = await auth();
  return <StudioTryClient isAuthed={Boolean(session?.user?.id)} />;
}

