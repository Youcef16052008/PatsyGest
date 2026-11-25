"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { NAV_LABELS_AR } from "@/lib/i18n";
import type { WorkspaceLink } from "@/lib/workspace-nav";
import { useLocale } from "./locale-provider";
import { Icon } from "./workspace-icons";

export default function WorkspaceNav({ links, advancedMode = false }: { links: readonly WorkspaceLink[]; advancedMode?: boolean }) {
  const path = usePathname();
  const more = useRef<HTMLDetailsElement>(null);
  const { locale } = useLocale();
  const core = links.filter((link) => !link.advanced);
  const extra = advancedMode ? links.filter((link) => link.advanced) : [];
  const secondaryActive = extra.find((link) => link.href === path);

  function item(link: WorkspaceLink) {
    const arTitle = locale === "ar" ? NAV_LABELS_AR[link.href] : undefined;
    return (
      <Link
        key={link.href}
        href={link.href}
        className="pg-nav-link"
        aria-current={link.href === path ? "page" : undefined}
        onClick={() => {
          if (more.current) more.current.open = false;
        }}
      >
        <Icon name={link.icon} size={18} />
        <span className="pg-nav-full">{arTitle ?? link.title}</span>
        <span className="pg-nav-short">{arTitle ?? link.short}</span>
      </Link>
    );
  }

  return (
    <nav className="pg-nav" aria-label="Navigation principale">
      <p className="pg-nav-caption">{locale === "ar" ? "القائمة الرئيسية" : "Menu principal"}</p>
      <div className="pg-nav-primary">{core.map(item)}</div>
      {extra.length > 0 && (
        <>
          <details
            className="pg-more"
            ref={more}
            onKeyDown={(event) => {
              if (event.key === "Escape" && more.current?.open) {
                more.current.open = false;
                more.current.querySelector("summary")?.focus();
              }
            }}
          >
            <summary title="Mode avancé" data-current={Boolean(secondaryActive)}>
              <Icon name="dots" size={18} />
              <span>{locale === "ar" ? "المزيد" : "Plus"}</span>
              <Icon name="down" size={13} />
            </summary>
            <div className="pg-more-links">{extra.map(item)}</div>
          </details>
          <div className="pg-nav-other">
            <p className="pg-nav-caption">{locale === "ar" ? "الوضع المتقدم" : "Mode avancé"}</p>
            {extra.map(item)}
          </div>
        </>
      )}
    </nav>
  );
}
