import { auth } from "@/lib/auth";
import NavbarClient from "./NavbarClient";

export default async function Navbar() {
  const session = await auth();
  const isLoggedIn = !!session?.user;
  const userName = session?.user?.name ?? session?.user?.email ?? null;
  const userInitial = (userName ?? "?")[0]?.toUpperCase() ?? "?";

  return (
    <NavbarClient
      isLoggedIn={isLoggedIn}
      userName={userName}
      userInitial={userInitial}
    />
  );
}


