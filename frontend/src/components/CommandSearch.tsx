import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Clock, Loader2, MapPin, Search, X } from "lucide-react";
import { resolvePlace, searchPlaces, type Place } from "../lib/geocode";

const RECENTS_KEY = "landlens.recentPlaces";
const MAX_RECENTS = 5;

export function loadRecents(): Place[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as Place[];
  } catch {
    return [];
  }
}

function saveRecent(p: Place) {
  try {
    const next = [p, ...loadRecents().filter((r) => r.id !== p.id)].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}

interface Props {
  near?: { lat: number; lng: number };
  onSelect: (p: Place) => void;
  size?: "lg" | "md";
  variant?: "default" | "pill";
  placeholder?: string;
}

export function CommandSearch({ near, onSelect, size = "md", variant = "default", placeholder = "Search a layout, survey area or address" }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const nearRef = useRef(near);
  nearRef.current = near;
  const skipSearch = useRef(false);

  // ⌘K / Ctrl+K / "/" focuses search from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const text = q.trim();
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    if (text.length < 3) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      try {
        setResults(await searchPlaces(text, nearRef.current, ctrl.signal));
        setActive(0);
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") {
          setResults([]);
          setSearchError("Places search is unavailable right now. Please try again in a moment.");
        }
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const showingRecents = q.trim().length < 3;
  const items = showingRecents ? loadRecents() : results;
  const open = focused && items.length > 0;

  const choose = async (p: Place) => {
    skipSearch.current = true;
    setQ(p.name);
    setFocused(false);
    input.current?.blur();
    try {
      setLoading(true);
      setSearchError(null);
      const full = await resolvePlace(p);
      saveRecent(full);
      onSelect(full);
    } catch {
      setSearchError("We couldn't open that place. Please choose it again or try another result.");
      setFocused(true);
      input.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const lg = size === "lg";
  const pill = variant === "pill";
  return (
    <div className="relative w-full">
      <div
        className={`panel flex items-center gap-3 ${pill ? "ho-pill rounded-full py-2.5 pl-2.5 pr-5" : lg ? "rounded-2xl px-5 py-4" : "rounded-xl px-4 py-2.5"} transition-shadow ${focused ? "shadow-[0_0_0_1px_rgba(45,212,191,0.5),0_20px_60px_rgba(0,0,0,0.45)]" : ""}`}
      >
        {pill ? (
          <span className="ho-pill-ico">{loading ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Search className="h-[18px] w-[18px]" />}</span>
        ) : loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ac" />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-tx-2" />
        )}
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              input.current?.blur();
              return;
            }
            if (!open) return;
            if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, items.length - 1));
            else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
            else if (e.key === "Enter") choose(items[active]);
            else return;
            e.preventDefault();
          }}
          placeholder={placeholder}
          aria-label="Search a place"
          aria-busy={loading}
          role="combobox"
          aria-expanded={open}
          className={`min-w-0 flex-1 bg-transparent text-tx placeholder:text-tx-3 focus:outline-none focus-visible:outline-none ${lg ? "text-[15px]" : "text-sm"}`}
        />
        {q ? (
          <button onClick={() => setQ("")} aria-label="Clear search" className="text-tx-3 hover:text-tx">
            <X className="h-4 w-4" />
          </button>
        ) : (
          <span className="kbd hidden sm:inline">⌘K</span>
        )}
      </div>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="panel absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl py-1.5"
          >
            {showingRecents && <li className="lbl px-4 pb-1 pt-1.5">Recent</li>}
            {items.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === active}>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(p)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors ${i === active ? "bg-chip" : ""}`}
                >
                  {showingRecents ? <Clock className="mt-0.5 h-4 w-4 shrink-0 text-tx-3" /> : <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ac" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-tx">{p.name}</span>
                    <span className="block truncate text-xs text-tx-2">{p.detail}</span>
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      {focused && !open && q.trim().length >= 3 && (
        <div className="panel absolute left-0 right-0 top-full z-40 mt-2 rounded-xl px-4 py-3 text-[13px] text-tx-2" role={searchError ? "alert" : "status"}>
          {loading
            ? "Searching Google Maps…"
            : searchError
              ? searchError
              : "No matching places found. Try a nearby landmark or a shorter address."}
        </div>
      )}
    </div>
  );
}
