import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCredits, parseAccolades, parseGear } from "@/lib/proProfile";
import ProProfileEditor from "./ProProfileEditor";

export const metadata = { title: "Edit pro profile — Epic Music Space" };
export const dynamic = "force-dynamic";

export default async function ProEditPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/pro/edit");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true, username: true, name: true, image: true,
      headline: true, bioLong: true, coverImage: true, location: true,
      websiteUrl: true, instagramUrl: true, twitterUrl: true,
      youtubeUrl: true, tiktokUrl: true, spotifyUrl: true,
      grammyNominations: true, grammyWins: true,
      riaaPlatinum: true, riaaGold: true, billboardNumberOne: true,
      yearsExperience: true, proProfilePublished: true,
      engineerCredits: true, engineerAccolades: true, engineerGear: true,
    },
  });
  if (!user) redirect("/auth/signin");

  if (user.role !== "ENGINEER" && user.role !== "PRODUCER" && user.role !== "ARTIST" && user.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold">Pro profiles are for engineers, producers, and artists</h1>
        <p className="mt-3 text-sm text-white/55">
          Switch your role on your account to edit a pro profile.
        </p>
      </div>
    );
  }

  return (
    <ProProfileEditor
      username={user.username ?? ""}
      role={user.role}
      initial={{
        headline: user.headline ?? "",
        bioLong: user.bioLong ?? "",
        coverImage: user.coverImage ?? "",
        location: user.location ?? "",
        websiteUrl: user.websiteUrl ?? "",
        instagramUrl: user.instagramUrl ?? "",
        twitterUrl: user.twitterUrl ?? "",
        youtubeUrl: user.youtubeUrl ?? "",
        tiktokUrl: user.tiktokUrl ?? "",
        spotifyUrl: user.spotifyUrl ?? "",
        grammyNominations: user.grammyNominations,
        grammyWins: user.grammyWins,
        riaaPlatinum: user.riaaPlatinum,
        riaaGold: user.riaaGold,
        billboardNumberOne: user.billboardNumberOne,
        yearsExperience: user.yearsExperience,
        proProfilePublished: user.proProfilePublished,
        engineerCredits: parseCredits(user.engineerCredits),
        engineerAccolades: parseAccolades(user.engineerAccolades),
        engineerGear: parseGear(user.engineerGear),
      }}
    />
  );
}
