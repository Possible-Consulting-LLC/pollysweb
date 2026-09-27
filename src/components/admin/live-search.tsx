'use client';
import { useEffect, useReducer, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/** Live search (UX Task 8 fix round 1, ruling 1): a HEADLESS narrowing search.
 * Typing queries matches LIVE (debounced ~250ms) over ALL rows and reports the
 * narrowed page + truthful total back to the parent, which renders the matched
 * rows in place of the committed list — the mockup's `filtered()` behavior.
 * There is no dropdown by construction: the Task 7 popup combobox mode is
 * retired entirely. Enter is the explicit full-page fallback
 * (`onEnter` — the URL-param search remains that fallback only; plain typing
 * NEVER navigates). Escape reverts to the committed search and restores the
 * committed view. Clearing the query restores the committed view; an empty
 * match set echoes the query through the parent's empty state.
 *
 * The reducer and the input view are pure (unit-tested); `useNarrowing` only
 * wires the debounce, request-id guard, and abort handling. */

export type Suggestion = { id: string; title: string; subtitle?: string;
  /** Deleting accounts (users entity) arrive flagged so the picker greys them. */
  disabled?: boolean };
export type NarrowingResult = { rows: Suggestion[]; total: number };

export const SUGGEST_DEBOUNCE_MS = 250;

export type NarrowingState = {
  text: string;
  /** The parent's committed value — Escape reverts to it. */
  committed: string;
  /** The query the current rows answer — '' until a response lands, so
   * consumers can tell "narrowed matches valid for the typed text" apart from
   * "still typing / committed view". */
  query: string;
  page: number;
  rows: Suggestion[];
  total: number;
  loading: boolean;
  requestId: number;
};

export const initialNarrowingState = (value = ''): NarrowingState =>
  ({ text: value, committed: value, query: '', page: 1, rows: [], total: 0,
    loading: false, requestId: 0 });

export type NarrowingEvent =
  | { type: 'change'; text: string }
  | { type: 'request'; requestId: number }
  | { type: 'response'; requestId: number; query: string; rows: Suggestion[]; total: number }
  | { type: 'page'; page: number }
  | { type: 'escape'; committed: string }
  | { type: 'sync'; text: string };

export function narrowingReducer(state: NarrowingState, event: NarrowingEvent):
  NarrowingState {
  switch (event.type) {
    case 'change':
      // A new keystroke restarts narrowing: page resets and the previous
      // response is retired (the committed view shows until fresh matches land).
      return { ...state, text: event.text, query: '', page: 1, loading: false };
    case 'request':
      return { ...state, requestId: event.requestId, loading: true };
    case 'response':
      if (event.requestId !== state.requestId) return state;
      return { ...state, query: event.query, rows: event.rows, total: event.total,
        loading: false };
    case 'page':
      return { ...state, page: event.page };
    case 'escape':
      return { ...state, text: event.committed, query: '', page: 1, loading: false };
    case 'sync': {
      if (state.text === event.text && state.committed === event.text &&
        state.query === '' && !state.loading) return state;
      return { ...state, text: event.text, committed: event.text, query: '', page: 1,
        loading: false };
    }
  }
}

export type NarrowingSource =
  (query: string, page: number, signal: AbortSignal) => Promise<NarrowingResult>;

/** What the hook hands its host: narrowed matches for the live query plus the
 * committed fallback state, so the parent can render
 * `live ? narrowedRows : committedRows` and a truthful counter. */
export type Narrowing = {
  text: string;
  query: string;
  /** A live query is being typed (non-empty input, narrowing in progress). */
  active: boolean;
  /** True once matches for the CURRENT text have arrived — render
   * `rows`/`total` in place of the committed view exactly then. */
  narrowed: boolean;
  rows: Suggestion[];
  total: number;
  page: number;
  loading: boolean;
  onType(text: string): void;
  onPageChange(page: number): void;
  onEscape(): void;
};

let nextRequestId = 1;

/** Client state owner of the narrowing search: the debounced fetch (250ms),
 * the request-id guard, abort handling, and the external-value sync. All
 * behavior lives in the reducer above. */
export function useNarrowing({ value, source }: {
  value: string;
  source: NarrowingSource;
}): Narrowing {
  const [state, dispatch] = useReducer(narrowingReducer, value, initialNarrowingState);
  const latest = useRef({ source });
  // Sync the latest props for event handlers (post-render, per lint rules).
  useEffect(() => { latest.current = { source }; });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const runQuery = (query: string, page: number) => {
    const requestId = nextRequestId++;
    dispatch({ type: 'request', requestId });
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    latest.current.source(query, page, abort.signal)
      .then(result => dispatch({ type: 'response', requestId, query,
        rows: result.rows, total: result.total }))
      .catch(() => {
        if (!abort.signal.aborted)
          dispatch({ type: 'response', requestId, query, rows: [], total: 0 });
      });
  };
  const cancelPending = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    controller.current?.abort();
  };
  const onType = (text: string) => {
    dispatch({ type: 'change', text });
    if (timer.current) clearTimeout(timer.current);
    const query = text.trim();
    if (query)
      timer.current = setTimeout(() => {
        timer.current = null;
        runQuery(query, 1);
      }, SUGGEST_DEBOUNCE_MS);
    else
      controller.current?.abort();
  };
  const onPageChange = (page: number) => {
    const query = state.text.trim();
    if (!query || page === state.page) return;
    if (timer.current) clearTimeout(timer.current);
    dispatch({ type: 'page', page });
    runQuery(query, page);
  };
  const onEscape = () => {
    cancelPending();
    dispatch({ type: 'escape', committed: state.committed });
  };
  // External value changes (fallback navigation) sync the text and restore
  // the committed view.
  useEffect(() => { dispatch({ type: 'sync', text: value }); }, [value]);
  useEffect(() => () => cancelPending(), []);
  const query = state.text.trim();
  return {
    text: state.text,
    query,
    active: query !== '',
    narrowed: state.query !== '' && state.query === query,
    rows: state.rows,
    total: state.total,
    page: state.page,
    loading: state.loading,
    onType,
    onPageChange,
    onEscape,
  };
}

/** The mockup-styled search input: a plain search field (no combobox roles —
 * no dropdown exists). Escape reverts to the committed search; Enter is the
 * explicit full-page fallback. Plain typing NEVER navigates. */
export function LiveSearchInput({ id, label, value, placeholder, onType, onEscape,
  onEnter, className }: {
    id: string;
    label: string;
    value: string;
    placeholder?: string;
    onType(text: string): void;
    onEscape(): void;
    onEnter?(text: string): void;
    className?: string;
  }) {
  return (
    <input
      type="search"
      value={value}
      placeholder={placeholder}
      aria-label={label}
      maxLength={80}
      data-live-search-input={id}
      onChange={(event) => onType(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onEscape();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          onEnter?.(value.trim());
        }
      }}
      className={cn('h-11 w-full rounded-2xl border border-[var(--lavender-deep)] bg-[var(--input)] px-3.5 text-sm text-[var(--foreground)] transition-colors placeholder:text-[var(--foreground)]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]',
        className)}
    />
  );
}

/** The live narrowing pager (Prev / "Page N of M" / Next) used while matches
 * replace the committed view — pagination over the matches, not the committed
 * pages. Hidden entirely when the matches fit one page. */
export function NarrowPager({ page, total, pageSize, onPageChange, label }: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange(page: number): void;
  label: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (totalPages <= 1) return null;
  return (
    <nav className="mt-3 flex items-center gap-3 border-t border-[var(--hover)] pt-3.5"
      aria-label={`${label} pagination`} data-testid="narrow-pager">
      <Button variant="soft" size="sm" aria-label="Previous page" disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}>Prev</Button>
      <span className="text-[12.5px] opacity-70" data-page-label>Page {page} of {totalPages}</span>
      <Button variant="soft" size="sm" aria-label="Next page" disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}>Next</Button>
    </nav>
  );
}

/** Client fetcher for the super_admin-gated narrowing endpoint
 * (`/admin/suggest/<entity>?q=…&page=…&pageSize=…`). Degrades to an empty
 * narrowed set on failure — the full-page fallback still works. */
export const narrowViaEndpoint = (entity: string, pageSize?: number) =>
  async (query: string, page: number, signal?: AbortSignal): Promise<NarrowingResult> => {
    const params = new URLSearchParams({ q: query, page: String(page) });
    if (pageSize) params.set('pageSize', String(pageSize));
    const response = await fetch(`/admin/suggest/${entity}?${params}`, { signal });
    if (!response.ok) return { rows: [], total: 0 };
    const data = await response.json() as Partial<NarrowingResult>;
    return { rows: data.rows ?? [], total: data.total ?? 0 };
  };
