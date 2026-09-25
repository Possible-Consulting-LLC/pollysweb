"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/field";
import { matchingSpoodNames } from "@/lib/spood-search";

export function SpoodSearch({ names, initialQuery = "" }: { names: string[]; initialQuery?: string }) {
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = matchingSpoodNames(names, query);
  const expanded = open && suggestions.length > 0;
  useEffect(() => {
    if (expanded && active >= 0) {
      listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
    }
  }, [active, expanded]);

  function choose(name: string) {
    setQuery(name);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="relative">
      <Input
        id="q" name="q" value={query} placeholder="Name or species"
        role="combobox" autoComplete="off" aria-autocomplete="list"
        aria-expanded={expanded} aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }}
        onKeyDown={event => {
          if (event.key === "Escape") { setOpen(false); setActive(-1); }
          if (suggestions.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            setOpen(true);
            setActive(event.key === "ArrowDown"
              ? (expanded ? active + 1 : 0) % suggestions.length
              : (expanded && active >= 0 ? active - 1 + suggestions.length : suggestions.length - 1) % suggestions.length);
          }
          if (event.key === "Enter" && expanded && active >= 0) {
            event.preventDefault();
            choose(suggestions[active]);
          }
        }}
      />
      {expanded ? (
        <ul ref={listRef} id={listId} role="listbox" aria-label="Matching spood names" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-[var(--plum)]/20 bg-[var(--card)] p-1 shadow-lg">
          {suggestions.map((name, index) => (
            <li key={name} id={`${listId}-${index}`} role="option" aria-selected={active === index}
              onPointerDown={event => event.preventDefault()}
              onClick={() => choose(name)}
              className={`min-h-11 cursor-pointer rounded-xl px-3 py-3 text-sm [overflow-wrap:anywhere] text-[var(--midnight)] ${active === index ? "bg-[var(--lavender)]" : "hover:bg-[var(--hover-strong)]"}`}
            >{name}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
