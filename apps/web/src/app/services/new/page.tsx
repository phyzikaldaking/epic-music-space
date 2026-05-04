import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canListServices, kindsAllowedForRole } from "@/lib/serviceListings";
import NewServiceForm from "./NewServiceForm";

export const metadata = {
  title: "List a Service | Epic Music Space",
  description: "Engineers and producers: list a mix, master, beat, template, or lesson.",
};

export default async function NewServicePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/services/new");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (!user || !canListServices(user.role)) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-5xl">🚫</p>
        <h1 className="mt-4 text-2xl font-extrabold">Producer or Engineer accounts only</h1>
        <p className="mt-2 text-sm text-white/55">
          Listing services is available to producers and engineers. Update
          your account role from your profile, or sign up again with the
          right type.
        </p>
        <a
          href="/profile/edit"
          className="mt-6 inline-block rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
        >
          Update profile →
        </a>
      </div>
    );
  }

  return <NewServiceForm allowedKinds={kindsAllowedForRole(user.role)} role={user.role} />;
}
