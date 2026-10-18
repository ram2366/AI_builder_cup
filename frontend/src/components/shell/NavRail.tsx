import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeftRight, Bookmark, Clock, Compass, HelpCircle, MapPin, Moon, Sun, X } from "lucide-react";
import type { Theme } from "../../lib/theme";
import type { Place } from "../../lib/geocode";
import { useSaved, type SavedPlot } from "../../lib/saved";
import { Logo } from "../ui";
import { SavedPlots } from "../SavedPlots";
import { loadRecents } from "../CommandSearch";

type Panel = "saved" | "history" | "help" | null;

const HOW = [
  ["Pick a plot", "Search an address, drop a pin, draw the boundary or import KML/GeoJSON."],
  ["We read 40 years of satellite data", "Water history, floods, ground height, land-use change and heat for that exact ground."],
  ["Get a cited report", "Every claim links to the dataset behind it. Opinions are shown, never scored. We say what we can't tell."],
];

function RailButton({ label, icon, active, onClick, badge }: { label: string; icon: ReactNode; active?: boolean; onClick: () => void; badge?: number }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-current={active ? "page" : undefined} data-tip={label} className={`nav-btn ${active ? "is-active" : ""}`}>
      {icon}
      {!!badge && <span className="nav-badge">{badge}</span>}
    </button>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line-2 p-4 text-center">
      <p className="text-[13.5px] font-semibold text-tx">{title}</p>
      <p className="mt-1 text-[12.5px] text-tx-3">{body}</p>
    </div>
  );
}

/** Left rail on desktop, bottom bar on phones. Saved plots, history and help open as a flyout. */
export function NavRail({
  compact,
  exploring,
  comparing,
  compareCount,
  theme,
  onTheme,
  onExplore,
  onCompare,
  onOpenSaved,
  onRecheckSaved,
  onPickPlace,
}: {
  compact: boolean;
  exploring: boolean;
  comparing: boolean;
  compareCount: number;
  theme: Theme;
  onTheme: () => void;
  onExplore: () => void;
  onCompare: () => void;
  onOpenSaved: (p: SavedPlot) => void;
  onRecheckSaved: (p: SavedPlot) => void;
  onPickPlace: (p: Place) => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const { saved } = useSaved();
  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);
  const recents = panel === "history" ? loadRecents() : [];
  const icon = "h-[18px] w-[18px]";

  return (
    <>
      <nav className={compact ? "nav-bar" : "nav-rail"} aria-label="Primary">
        {!compact && (
          <button type="button" onClick={onExplore} aria-label="GeoMind home" className="nav-logo">
            <Logo size={27} />
          </button>
        )}
        <RailButton label="Explore" icon={<Compass className={icon} />} active={exploring && !panel} onClick={() => { setPanel(null); onExplore(); }} />
        <RailButton label="Saved plots" icon={<Bookmark className={icon} />} active={panel === "saved"} onClick={() => toggle("saved")} />
        <RailButton label="Compare" icon={<ArrowLeftRight className={icon} />} active={comparing} badge={compareCount} onClick={() => { setPanel(null); onCompare(); }} />
        {!compact && <RailButton label="History" icon={<Clock className={icon} />} active={panel === "history"} onClick={() => toggle("history")} />}
        {!compact && <span className="nav-spacer" />}
        <RailButton label="How it works" icon={<HelpCircle className={icon} />} active={panel === "help"} onClick={() => toggle("help")} />
        {!compact && <RailButton label={theme === "dark" ? "Light theme" : "Dark theme"} icon={theme === "dark" ? <Sun className={icon} /> : <Moon className={icon} />} onClick={onTheme} />}
      </nav>
      <AnimatePresence>
        {panel && (
          <motion.aside
            key={panel}
            initial={{ opacity: 0, x: compact ? 0 : -8, y: compact ? 12 : 0 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className={`nav-flyout panel ${compact ? "is-compact" : ""}`}
            aria-label={panel === "saved" ? "Saved plots" : panel === "history" ? "History" : "How it works"}
          >
            <button type="button" className="nav-flyout-x" onClick={() => setPanel(null)} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
            {panel === "saved" &&
              (saved.length ? (
                <SavedPlots onOpen={(p) => { setPanel(null); onOpenSaved(p); }} onRecheck={(p) => { setPanel(null); onRecheckSaved(p); }} />
              ) : (
                <Empty title="No saved plots yet" body="Save a plot from its report to find it here." />
              ))}
            {panel === "history" && (
              <div>
                <p className="lbl mb-2">Recent searches</p>
                {recents.length ? (
                  <ul className="flex flex-col gap-1">
                    {recents.map((p) => (
                      <li key={p.id}>
                        <button type="button" className="nav-row" onClick={() => { setPanel(null); onPickPlace(p); }}>
                          <MapPin className="h-4 w-4 shrink-0 text-ac" />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] text-tx">{p.name}</span>
                            <span className="block truncate text-[11.5px] text-tx-3">{p.detail}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty title="Nothing here yet" body="Places you search for will appear here." />
                )}
              </div>
            )}
            {panel === "help" && (
              <div>
                <p className="lbl mb-3">How it works</p>
                <ol className="flex flex-col gap-3">
                  {HOW.map(([t, d], i) => (
                    <li key={t} className="grid grid-cols-[28px_1fr] gap-2">
                      <span className="font-mono text-[15px] text-ac">0{i + 1}</span>
                      <span>
                        <b className="block text-[13.5px] text-tx">{t}</b>
                        <span className="text-[12.5px] leading-snug text-tx-2">{d}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-4 text-[12px] text-tx-3">Physical history only. Not legal title, and not a substitute for a site visit after heavy rain.</p>
                {compact && (
                  <button type="button" onClick={onTheme} className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-line text-[13px] text-tx">
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {theme === "dark" ? "Light theme" : "Dark theme"}
                  </button>
                )}
              </div>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
