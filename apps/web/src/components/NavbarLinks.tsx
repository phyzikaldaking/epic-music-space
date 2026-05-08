"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

interface NavLink {
  href: string;
  label: string;
  activePrefixes?: string[];
}

interface Props {
  publicLinks: NavLink[];
  authedLinks: NavLink[];
  adminLink: NavLink;
}

export default function NavbarLinks({ publicLinks, authedLinks, adminLink }: Props) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const links = session
    ? [
        ...authedLinks,
        ...(session.user?.role === "ADMIN" ? [adminLink] : []),
      ]
    : publicLinks;

  return (
    <div className="hidden items-center gap-1 text-sm font-medium md:flex">
      {links.map((link) => (
        (() => {
          const active =
            pathname === link.href
            || (link.href !== "/" && pathname.startsWith(`${link.href}/`))
            || (link.activePrefixes?.some((prefix) => pathname.startsWith(prefix)) ?? false);
          return (
        <Link
          key={link.href}
          href={link.href}
          data-ui-sfx="page"
          className={`rounded-lg px-3 py-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
            active
              ? "bg-white/10 text-white"
              : "text-white/60 hover:bg-white/6 hover:text-white"
          }`}
        >
          {link.label}
        </Link>
          );
        })()
      ))}
    </div>
  );
}
