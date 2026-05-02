import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AdminUsersClient from "./AdminUsersClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold">
          <span className="text-gradient-ems">Admin Panel</span>
        </h1>
        <p className="mt-1 text-white/40">Manage users, roles, and platform access.</p>
      </div>
      <AdminUsersClient />
    </main>
  );
}
