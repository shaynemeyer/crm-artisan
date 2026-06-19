"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, MapPin, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/clients", label: "Clients", icon: Users },
  { href: "/dashboard/job-sites", label: "Job Sites", icon: MapPin },
  { href: "/dashboard/quotes", label: "Quotes", icon: FileText },
];

function useActiveHref() {
  const pathname = usePathname();
  // Match the most specific prefix
  return navItems
    .slice()
    .reverse()
    .find((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
    ?.href;
}

export function SidebarNav() {
  const activeHref = useActiveHref();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {navItems.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            activeHref === href
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground"
          )}
        >
          <Icon className="size-5 shrink-0" />
          <span className="hidden lg:block">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const activeHref = useActiveHref();

  return (
    <nav className="flex items-center justify-around h-16 px-2">
      {navItems.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex flex-col items-center gap-1 min-w-[44px] min-h-[44px] justify-center px-3 rounded-md transition-colors",
            "hover:bg-accent",
            activeHref === href
              ? "text-foreground"
              : "text-muted-foreground"
          )}
        >
          <Icon className="size-5" />
          <span className="text-[10px] font-medium leading-none">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
