import type { ReactNode } from "react";
import { Icon, type IconName } from "./workspace-icons";

export function PageIntro({ title, description, label, actions }: { title: string; description?: string; label?: string; actions?: ReactNode }) {
  return <header className="pg-page-intro"><div>
    {label && <p className="pg-kicker">{label}</p>}
    <h1>{title}</h1>{description && <p className="pg-page-description">{description}</p>}
  </div>{actions && <div className="pg-intro-actions">{actions}</div>}</header>;
}

export function Disclosure({ title, description, icon = "list", children }: { title: string; description?: string; icon?: IconName; children: ReactNode }) {
  return <details className="pg-disclosure pg-card"><summary><span className="pg-emblem"><Icon name={icon} size={18}/></span>
    <span><b>{title}</b>{description && <small>{description}</small>}</span><Icon name="down" size={17}/></summary>
    <div className="pg-disclosure-body">{children}</div>
  </details>;
}

export function Notice({ children, kind = "info" }: { children: ReactNode; kind?: "info" | "warning" | "error" | "success" }) {
  return <div className="pg-notice" data-kind={kind} role={kind === "error" ? "alert" : "status"}>
    <Icon name={kind === "success" ? "check" : kind === "info" ? "guide" : "alert"} size={18}/><div>{children}</div>
  </div>;
}

export function EmptyState({ title, text, icon = "box" }: { title: string; text?: string; icon?: IconName }) {
  return <div className="pg-empty"><span className="pg-emblem"><Icon name={icon} size={24}/></span><b>{title}</b>{text && <p>{text}</p>}</div>;
}
