'use client';
import { useEffect, useReducer, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Live search (Task 7, Requirement A): a combobox-backed search input whose
 * typing queries suggestions LIVE (debounced ~250ms) and renders them in
 * place — no navigation, no form submit while browsing. Two modes:
 *
 * - 'popup' (default): dropdown listbox under the input with full combobox
 *   a11y semantics; picking a suggestion calls `onPick` (the parent's owned
 *   selection state updates directly — no remount, tray/counter never flash).
 *   Enter with no highlighted suggestion is the explicit full-page fallback
 *   (`onFallbackSubmit` — the URL-param search remains that fallback only).
 * - 'headless': the input filters a list the PARENT renders — suggestions are
 *   reported through `renderSuggestions(suggestions, query, loading)`, which
 *   the picker surfaces use to show matched rows in place (the fold-away
 *   list itself), mockup-exact.
 *
 * The reducer and view are pure (unit-tested); this module's `LiveSearch`
 * shell only wires the debounce, request-id guard, and abort handling. */

export type Suggestion = { id: string; title: string; subtitle?: string };

export const SUGGEST_DEBOUNCE_MS = 250;

export type LiveSearchState = {
  text: string;
  /** The parent's committed value — Escape reverts to it. */
  committed: string;
  open: boolean;
  suggestions: Suggestion[];
  loading: boolean;
  requestId: number;
  activeIndex: number;
};

export const initialLiveSearchState = (value = ''): LiveSearchState =>
  ({ text: value, committed: value, open: false, suggestions: [], loading: false,
    requestId: 0, activeIndex: -1 });

export type LiveSearchEvent =
  | { type: 'change'; text: string }
  | { type: 'request'; requestId: number }
  | { type: 'response'; requestId: number; suggestions: Suggestion[] }
  | { type: 'highlight'; move: 1 | -1 }
  | { type: 'highlightAt'; index: number }
  | { type: 'pick' }
  | { type: 'commit' }
  | { type: 'close' }
  | { type: 'escape'; committed: string }
  | { type: 'sync'; text: string };

export function liveSearchReducer(state: LiveSearchState, event: LiveSearchEvent):
  LiveSearchState {
  switch (event.type) {
    case 'change':
      return { ...state, text: event.text, open: event.text.trim().length > 0, activeIndex: -1 };
    case 'request':
      return { ...state, requestId: event.requestId, loading: true };
    case 'response':
      if (event.requestId !== state.requestId) return state;
      return { ...state, suggestions: event.suggestions, loading: false, open: true, activeIndex: -1 };
    case 'highlight': {
      if (!state.open || state.suggestions.length === 0) return state;
      const count = state.suggestions.length;
      return { ...state, activeIndex: (state.activeIndex + event.move + count) % count };
    }
    case 'highlightAt':
      return { ...state, activeIndex: event.index };
    case 'pick':
    case 'commit':
      return { ...state, open: false, suggestions: [], loading: false, activeIndex: -1 };
    case 'close':
      return { ...state, open: false, activeIndex: -1 };
    case 'escape':
      return { ...state, text: event.committed, committed: event.committed, open: false,
        suggestions: [], loading: false, activeIndex: -1 };
    case 'sync':
      if (state.text === event.text && !state.open) return state;
      return { ...state, text: event.text, committed: event.text, open: false,
        suggestions: [], loading: false, activeIndex: -1 };
  }
}

/** Pure keyboard mapping for the combobox: arrows move the highlight, Enter
 * picks the active suggestion (or falls back to the full-page submit when
 * nothing is highlighted), Escape closes and reverts. */
export function liveSearchKeyDown(key: string, state: LiveSearchState): LiveSearchEvent | null {
  switch (key) {
    case 'ArrowDown': return { type: 'highlight', move: 1 };
    case 'ArrowUp': return { type: 'highlight', move: -1 };
    case 'Enter':
      return state.open && state.activeIndex >= 0 ? { type: 'pick' } : { type: 'commit' };
    case 'Escape': return { type: 'escape', committed: state.committed };
    default: return null;
  }
}

export type LiveSearchViewProps = {
  state: LiveSearchState;
  id: string;
  label: string;
  placeholder?: string;
  mode?: 'popup' | 'headless';
  /** Rendered at the toolbar row's end (e.g. the gold counter chip). */
  toolbarEnd?: ReactNode;
  /** Rows already picked by the parent render with a selected marker. */
  selectedIds?: ReadonlySet<string>;
  onType?(text: string): void;
  onEvent?(event: LiveSearchEvent): void;
  onPick?(suggestion: Suggestion): void;
  /** Popup mode: Enter with no highlighted suggestion — the explicit
   * full-page fallback navigation (plain typing NEVER triggers it). */
  onFallbackSubmit?(text: string): void;
  /** Headless mode: renders the result area below the toolbar — for the
   * picker surfaces this is the filtered fold-away list itself. */
  renderSuggestions?(suggestions: Suggestion[], query: string, loading: boolean): ReactNode;
  className?: string;
};

export function LiveSearchView({ state, id, label, placeholder, mode = 'popup',
  toolbarEnd, selectedIds, onType, onEvent, onPick, onFallbackSubmit, renderSuggestions,
  className }: LiveSearchViewProps) {
  const popup = mode === 'popup';
  const active = state.activeIndex >= 0 ? state.suggestions[state.activeIndex] : undefined;
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const mapped = liveSearchKeyDown(event.key, state);
    if (!mapped) return;
    event.preventDefault();
    onEvent?.(mapped);
    if (mapped.type === 'pick' && active) onPick?.(active);
    if (mapped.type === 'commit') {
      const text = state.text.trim();
      if (onFallbackSubmit) onFallbackSubmit(text);
    }
  };
  const input = (
    <input
      type="search"
      value={state.text}
      placeholder={placeholder}
      aria-label={label}
      role={popup ? 'combobox' : undefined}
      aria-autocomplete={popup ? 'list' : undefined}
      aria-expanded={popup ? state.open : undefined}
      aria-controls={popup && state.open ? `${id}-listbox` : undefined}
      aria-activedescendant={popup && active ? `${id}-option-${active.id}` : undefined}
      data-live-search-input={id}
      onChange={(event) => {
        onEvent?.({ type: 'change', text: event.target.value });
        onType?.(event.target.value);
      }}
      onKeyDown={handleKeyDown}
      onBlur={() => onEvent?.({ type: 'close' })}
      className="h-11 w-full rounded-2xl border border-[var(--lavender-deep)] bg-[var(--input)] px-3.5 text-sm text-[var(--foreground)] transition-colors placeholder:text-[var(--foreground)]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
    />
  );
  if (!popup) {
    return (
      <div className={cn('min-w-0 space-y-2', className)}>
        <div className="flex items-center gap-2">
          {input}
          {toolbarEnd}
        </div>
        {renderSuggestions?.(state.suggestions, state.text, state.loading)}
      </div>
    );
  }
  return (
    <div className={cn('relative min-w-0 flex-1', className)}>
      {input}
      {state.open ? (
        <ul
          role="listbox"
          id={`${id}-listbox`}
          data-live-search-listbox={id}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-2xl border border-[var(--lavender-deep)] bg-[var(--card-solid)] p-1 shadow-[0_8px_30px_var(--shadow)]"
        >
          {state.suggestions.map((suggestion, index) => {
            const picked = selectedIds?.has(suggestion.id) ?? false;
            return (
              <li
                key={suggestion.id}
                role="option"
                id={`${id}-option-${suggestion.id}`}
                aria-selected={picked}
                data-active={index === state.activeIndex ? 'true' : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { onEvent?.({ type: 'pick' }); onPick?.(suggestion); }}
                onMouseMove={() => onEvent?.({ type: 'highlightAt', index })}
                className={cn('flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-[var(--hover)]',
                  index === state.activeIndex && 'bg-[var(--hover)]',
                  picked && 'text-[var(--plum)]')}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{suggestion.title}</span>
                  {suggestion.subtitle
                    ? <span className="block truncate text-[11.5px] opacity-55">{suggestion.subtitle}</span>
                    : null}
                </span>
                {picked ? <span aria-hidden="true" className="ml-auto shrink-0 font-bold text-[var(--plum)]">✓</span> : null}
              </li>
            );
          })}
          {state.suggestions.length === 0
            ? <li className="px-3 py-2 text-sm opacity-55">{state.loading ? 'Searching…' : 'No matches.'}</li>
            : null}
        </ul>
      ) : null}
    </div>
  );
}

let nextRequestId = 1;

/** Thin client shell: owns the debounced fetch (250ms), the request-id guard,
 * abort handling, and the external-value sync. All behavior lives in the
 * reducer + view above. */
export function LiveSearch({ value, source, mode = 'popup', debounceMs = SUGGEST_DEBOUNCE_MS,
  id, label, placeholder, toolbarEnd, selectedIds, onType, onPick, onFallbackSubmit,
  renderSuggestions, className }: {
    value: string;
    source(query: string, signal: AbortSignal): Promise<Suggestion[]>;
    mode?: 'popup' | 'headless';
    debounceMs?: number;
    id: string;
    label: string;
    placeholder?: string;
    toolbarEnd?: ReactNode;
    selectedIds?: ReadonlySet<string>;
    onType?(text: string): void;
    onPick?(suggestion: Suggestion): void;
    onFallbackSubmit?(text: string): void;
    renderSuggestions?(suggestions: Suggestion[], query: string, loading: boolean): ReactNode;
    className?: string;
  }) {
  const [state, dispatch] = useReducer(liveSearchReducer, value, initialLiveSearchState);
  const latest = useRef({ source, mode, debounceMs });
  latest.current = { source, mode, debounceMs };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const runQuery = (text: string) => {
    const requestId = nextRequestId++;
    dispatch({ type: 'request', requestId });
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    latest.current.source(text, abort.signal)
      .then(suggestions => dispatch({ type: 'response', requestId, suggestions }))
      .catch(() => {
        if (!abort.signal.aborted) dispatch({ type: 'response', requestId, suggestions: [] });
      });
  };
  const schedule = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      runQuery(text);
    }, latest.current.debounceMs);
  };
  // External value changes (fallback navigation) sync the text and fold the popup.
  useEffect(() => { dispatch({ type: 'sync', text: value }); }, [value]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    controller.current?.abort();
  }, []);
  const handleEvent = (event: LiveSearchEvent) => {
    dispatch(event);
    if (event.type === 'change') {
      if (timer.current) clearTimeout(timer.current);
      const query = event.text.trim();
      if (query) schedule(query);
      else controller.current?.abort();
    }
    // Headless Escape reverts to the committed filter — re-run its query so the
    // rendered list falls back to the committed state.
    if (event.type === 'escape' && latest.current.mode === 'headless') {
      const query = event.committed.trim();
      if (query) schedule(query);
    }
  };
  return <LiveSearchView state={state} id={id} label={label} placeholder={placeholder}
    mode={mode} toolbarEnd={toolbarEnd} selectedIds={selectedIds} className={className}
    onType={onType} onEvent={handleEvent} onPick={onPick} onFallbackSubmit={onFallbackSubmit}
    renderSuggestions={renderSuggestions} />;
}

/** Client fetcher for the super_admin-gated suggestion endpoint
 * (`/admin/suggest/<entity>?q=…`). Degrades to no suggestions on failure —
 * the full-page fallback still works. */
export const suggestViaEndpoint = (entity: string) =>
  async (query: string, signal?: AbortSignal): Promise<Suggestion[]> => {
    const response = await fetch(`/admin/suggest/${entity}?q=${encodeURIComponent(query)}`,
      { signal });
    if (!response.ok) return [];
    const data = await response.json() as { suggestions?: Suggestion[] };
    return data.suggestions ?? [];
  };