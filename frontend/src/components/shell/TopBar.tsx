import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { Place } from "../../lib/geocode";
import { CommandSearch } from "../CommandSearch";

/** Breadcrumb on the left, ⌘K search in the centre, page actions on the right. */
export function TopBar({
  crumbs,
  near,
  onSelect,
  hideSearch,
  actions,
  compact,
  home,
}: {
  crumbs: string[];
  near?: { lat: number; lng: number };
  onSelect: (p: Place) => void;
  hideSearch?: boolean;
  actions?: ReactNode;
  compact?: boolean;
  home?: boolean;
}) {
  return (
    <header className={`top-bar on-map ${compact ? "is-compact" : ""} ${home ? "is-home" : ""}`}>
      {!compact && crumbs.length > 1 && (
        <nav aria-label="Breadcrumb" className="top-crumbs">
          {crumbs.map((c, i) => (
            <span key={`${c}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-tx-3" aria-hidden />}
              <span className={i === crumbs.length - 1 ? "truncate text-tx" : "shrink-0 text-tx-3"}>{c}</span>
            </span>
          ))}
        </nav>
      )}
      <div className="top-search">{!hideSearch && <CommandSearch near={near} onSelect={onSelect} placeholder="Search or jump to…" />}</div>
      <div className="top-actions">{actions}</div>
    </header>
  );
}
