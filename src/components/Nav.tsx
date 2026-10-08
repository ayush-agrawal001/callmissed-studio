"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChat, IconHome, IconImage, IconMic } from "./icons";

const LINKS = [
  { href: "/", label: "Home", Icon: IconHome },
  { href: "/chat", label: "Chat", Icon: IconChat },
  { href: "/images", label: "Images", Icon: IconImage },
  { href: "/voice", label: "Voice agent", Icon: IconMic },
] as const;

export function Nav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
          <Logo />
          <span className="font-semibold tracking-tight">CallMissed Studio</span>
        </Link>
        <nav className="flex flex-col gap-1 px-3" aria-label="Main">
          {LINKS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active(href) ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              <Icon />
              {label}
            </Link>
          ))}
        </nav>
        <p className="mt-auto px-5 py-5 text-xs leading-relaxed text-muted">
          Every model call goes through the{" "}
          <a href="https://docs.callmissed.com" className="underline underline-offset-2 hover:text-text">
            CallMissed API
          </a>
          .
        </p>
      </aside>

      {/* Mobile top bar + bottom tabs */}
      <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <span className="font-semibold tracking-tight">CallMissed Studio</span>
      </header>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {LINKS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(href) ? "page" : undefined}
            className={`flex flex-col items-center gap-1 py-2 text-[11px] ${active(href) ? "text-accent" : "text-muted"}`}
          >
            <Icon />
            {label === "Voice agent" ? "Voice" : label}
          </Link>
        ))}
      </nav>
    </>
  );
}

function Logo() {
  return (
    <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-text">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 12h2l2-6 4 12 3-9 2 3h3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
