import type { MouseEvent } from "react";
import { LogoMark, Wordmark } from "./Logo";

function sectionLink(id: string, onHome: boolean) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onHome) return;
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
}

/** Public website navigation, shared by the homepage and the research page. */
export function SiteNav({ active = "home" }: { active?: "home" | "science" }) {
  const onHome = active === "home";
  const links = [
    { label: "How it works", href: "#/?section=how", onClick: sectionLink("how", onHome) },
    { label: "Privacy", href: "#/?section=privacy", onClick: sectionLink("privacy", onHome) },
    { label: "Science", href: "#/science", current: active === "science" },
  ];
  return (
    <nav className="land-nav" aria-label="Site">
      <Wordmark href="#/" />
      <span className="spacer" />
      {links.map((link) => (
        <a key={link.label} className="navlink" href={link.href} onClick={link.onClick} aria-current={link.current ? "page" : undefined}>{link.label}</a>
      ))}
      <a className="land-cta" href="#/home">Try the demo</a>
      <details
        className="mobile-menu"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a")) event.currentTarget.open = false;
        }}
      >
        <summary>
          Menu
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <div className="mobile-menu-links">
          {links.map((link) => (
            <a key={link.label} href={link.href} onClick={link.onClick} aria-current={link.current ? "page" : undefined}>{link.label}</a>
          ))}
          <a className="land-cta" href="#/home">Try the demo</a>
        </div>
      </details>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="land-footer">
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--magenta)" }}>
        <LogoMark size={20} /> Hearth
      </span>
      <span>A wellbeing and self-insight tool. Not a medical device: it does not tell you what is wrong or how to treat it.</span>
      <span>Built with Firebase AI Logic hybrid inference · #BuildHybridAI 2026</span>
    </footer>
  );
}
