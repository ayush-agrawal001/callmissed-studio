"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/chat", label: "Chat" },
  { href: "/images", label: "Images" },
  { href: "/voice", label: "Voice" },
] as const;

export function Nav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <header className="shrink-0 border-b border-border bg-bg">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-8 sm:py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">CallMissed Studio</span>
        </Link>
        <nav aria-label="Main" className="order-last flex w-full gap-1 sm:order-none sm:w-auto">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={`rounded-full px-3 py-2 text-sm transition-colors ${
                active(href) ? "bg-surface-3 font-medium text-text" : "text-muted hover:text-text"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <a
          href="https://docs.callmissed.com"
          className="font-mono text-xs tracking-[0.02em] text-muted transition-colors hover:text-text"
        >
          docs.callmissed.com ↗
        </a>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <span className="grid size-7 place-items-center rounded-lg bg-text text-bg">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 12h3l2.5-6 4 12 3-9 2 3h3.5"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
