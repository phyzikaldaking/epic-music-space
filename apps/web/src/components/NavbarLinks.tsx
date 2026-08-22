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

export default function NavbarLinks({
  publicLinks,
  authedLinks,
  adminLink,
}: Props) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const links = session
    ? [...authedLinks, ...(session.user?.role === "ADMIN" ? [adminLink] : [])]
    : publicLinks;

  return (
    <div className="hidden items-center gap-6 text-[11px] font-semibold uppercase tracking-[0.16em] md:flex lg:gap-8">
      {links.map((link) =>
        (() => {
          const active =
            pathname === link.href ||
            (link.href !== "/" && pathname.startsWith(`${link.href}/`)) ||
            (link.activePrefixes?.some((prefix) =>
              pathname.startsWith(prefix),
            ) ??
              false);
          return (
            <Link
              key={link.href}
              href={link.href}
              data-ui-sfx="page"
              className={`border-b py-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a96e] ${
                active
                  ? "border-[#c9a96e] text-[#c9a96e]"
                  : "border-transparent text-[#d1cbc0]/60 hover:text-[#f2ede3]"
              }`}
            >
              {link.label}
            </Link>
          );
        })(),
      )}
    </div>
  );
}
