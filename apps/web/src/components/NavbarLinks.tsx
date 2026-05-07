"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

interface NavLink {
  href: string;
  label: string;
}

interface Props {
  publicLinks: NavLink[];
  authedLinks: NavLink[];
  adminLink: NavLink;
}

export default function NavbarLinks({ publicLinks, authedLinks, adminLink }: Props) {
  const { data: session } = useSession();
  const links = session
    ? [
        ...authedLinks,
        ...(session.user?.role === "ADMIN" ? [adminLink] : []),
      ]
    : publicLinks;

  return (
    <div className="hidden items-center gap-1 text-sm font-medium md:flex">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          data-ui-sfx="page"
          className="rounded-lg px-3 py-2 text-white/60 transition hover:bg-white/6 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
