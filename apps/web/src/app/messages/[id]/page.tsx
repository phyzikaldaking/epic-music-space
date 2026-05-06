import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ThreadClient from "./ThreadClient";

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ThreadPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=/messages/${id}`);
  }

  const conv = await prisma.conversation.findUnique({
    where: { id },
    select: {
      id: true,
      userAId: true,
      userBId: true,
      userA: {
        select: { id: true, name: true, image: true, isVerified: true, studio: { select: { username: true } } },
      },
      userB: {
        select: { id: true, name: true, image: true, isVerified: true, studio: { select: { username: true } } },
      },
    },
  });
  if (!conv) notFound();
  if (conv.userAId !== session.user.id && conv.userBId !== session.user.id) {
    notFound();
  }
  const peer = conv.userAId === session.user.id ? conv.userB : conv.userA;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <ThreadClient
        conversationId={id}
        viewerId={session.user.id}
        peer={peer}
      />
    </div>
  );
}
