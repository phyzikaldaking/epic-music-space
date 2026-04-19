"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function ProfilePage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login?redirect=/profile");
      return;
    }
    // Redirect to the user's public profile page
    if (profile?.username) {
      router.replace(`/${profile.username}`);
    }
  }, [user, profile, loading, router]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
