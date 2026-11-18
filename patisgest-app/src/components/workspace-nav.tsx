"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import type { WorkspaceLink } from "@/lib/workspace-nav";
import { Icon } from "./workspace-icons";

export default function WorkspaceNav({ links }: { links: readonly WorkspaceLink[] }) {
  const path = usePathname();
  const more = useRef<HTMLDetailsElement>(null);
  const primary = links.filter((link) => link.primary);
  const other = links.filter((link) => !link.primary);
  const secondaryActive = other.find((link) => link.href === path);
  function item(link: WorkspaceLink) {
    return <Link key={link.href} href={link.href} className="pg-nav-link" aria-current={link.href === path ? "page" : undefined}
      onClick={() => { if (more.current) more.current.open = false; }}>
      <Icon name={link.icon} size={18}/><span className="pg-nav-full">{link.title}</span><span className="pg-nav-short">{link.short}</span>
    </Link>;
  }
  return <nav className="pg-nav" aria-label="Navigation principale">
    <p className="pg-nav-caption">Espace de travail</p>
    <div className="pg-nav-primary">{primary.map(item)}</div>
    <details className="pg-more" ref={more} onKeyDown={(event) => {
      if (event.key === "Escape" && more.current?.open) {
        more.current.open = false;
        more.current.querySelector("summary")?.focus();
      }
    }}><summary title="Autres modules" data-current={Boolean(secondaryActive)}><Icon name="dots" size={18}/><span>Plus</span><Icon name="down" size={13}/></summary>
      <div className="pg-more-links">{other.map(item)}</div>
    </details>
    <div className="pg-nav-other"><p className="pg-nav-caption">Autres modules</p>{other.map(item)}</div>
  </nav>;
}
