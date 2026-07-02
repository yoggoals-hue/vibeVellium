// VibeVellium keyboard shortcuts handler + shortcuts modal + chat search + what-if simulator
// All keyboard shortcuts are global (work from anywhere in the app).
// The shortcuts modal is opened with ⌘/ (or Ctrl+/ on Windows/Linux).

import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "../shared/i18n";
import { memoryClient, type ChatSearchResultDto } from "../shared/api/memoryClient";

// ---------------------------------------------------------------------------
// Shortcut definitions
// ---------------------------------------------------------------------------

export interface ShortcutDef {
  key: string;
  modKey: boolean;  // ⌘ (macOS) or Ctrl (Windows/Linux)
  shiftKey: boolean;
  description: string;
  eventName: string; // window event to dispatch
}

export const SHORTCUTS: ShortcutDef[] = [
  { key: "Enter",     modKey: true,  shiftKey: false, description: "Send message",                    eventName: "shortcut-send" },
  { key: "Enter",     modKey: true,  shiftKey: true,  description: "Regenerate last response",        eventName: "shortcut-regenerate" },
  { key: "k",         modKey: true,  shiftKey: false, description: "Quick chat switcher / search",    eventName: "shortcut-search" },
  { key: "i",         modKey: true,  shiftKey: false, description: "Toggle Inspector panel",          eventName: "open-inspector" },
  { key: "b",         modKey: true,  shiftKey: false, description: "Toggle chat sidebar",             eventName: "shortcut-toggle-sidebar" },
  { key: "n",         modKey: true,  shiftKey: false, description: "New chat",                        eventName: "shortcut-new-chat" },
  { key: "/",         modKey: true,  shiftKey: false, description: "Show this shortcuts dialog",      eventName: "shortcut-show-help" }
];

// ---------------------------------------------------------------------------
// Global keyboard handler — registers once on app mount
// ---------------------------------------------------------------------------

export function useGlobalShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea/select UNLESS the shortcut includes modKey
      const target = e.target as HTMLElement | null;
      const isTyping = target && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      );

      // Don't trigger when modifier keys beyond modKey+shift are held
      if (e.altKey) return;

      const modKey = e.metaKey || e.ctrlKey;
      if (!modKey) return;

      // For Enter inside a textarea, we still want ⌘↵ to send — only check isTyping for non-Enter
      const key = e.key.toLowerCase();
      const matchedShortcut = SHORTCUTS.find((s) => {
        if (s.key.toLowerCase() !== key) return false;
        if (s.modKey !== modKey) return false;
        if (s.shiftKey !== e.shiftKey) return false;
        return true;
      });

      if (!matchedShortcut) return;

      // Block ⌘↵ in textareas only if it's the send shortcut (which is the intended behavior)
      // For other shortcuts, block if typing
      if (isTyping && matchedShortcut.key !== "Enter") return;

      e.preventDefault();
      window.dispatchEvent(new Event(matchedShortcut.eventName));
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

// ---------------------------------------------------------------------------
// Shortcuts modal — opened via ⌘/
// ---------------------------------------------------------------------------

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  const mod = isMac ? "⌘" : "Ctrl";

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("shortcuts.title" as never)}
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <h3 className="text-sm font-semibold text-text-primary">{t("shortcuts.title" as never)}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md border border-border p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-2">
            {SHORTCUTS.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-border-subtle last:border-b-0">
                <span className="text-sm text-text-secondary">{s.description}</span>
                <kbd className="keyboard-shortcut-key">
                  {mod}
                  {s.shiftKey && " ⇧ "}
                  {" "}
                  {s.key === "Enter" ? "↵" : s.key === "/" ? "/" : s.key.toUpperCase()}
                </kbd>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-text-tertiary leading-relaxed">
            {t("shortcuts.note" as never)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat search modal — opened via ⌘K
// ---------------------------------------------------------------------------

export function ChatSearchModal({
  open,
  onClose,
  onSelectChat
}: {
  open: boolean;
  onClose: () => void;
  onSelectChat: (chatId: string) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatSearchResultDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError(null);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const debounce = setTimeout(async () => {
      try {
        const data = await memoryClient.searchChats(query);
        if (!cancelled) {
          setResults(data.results);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Search failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [query, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-start justify-center bg-black/55 p-4 pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t("search.title" as never)}
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border-subtle p-4">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search.placeholder" as never)}
              className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md border border-border p-1 text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading && (
            <div className="px-3 py-4 text-center text-xs text-text-tertiary">{t("search.searching" as never)}</div>
          )}
          {!loading && error && (
            <div className="px-3 py-4 text-center text-xs text-danger">{error}</div>
          )}
          {!loading && !error && query.trim() && results.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-text-tertiary">{t("search.noResults" as never)}</div>
          )}
          {!loading && !error && results.length > 0 && (
            <div className="flex flex-col gap-1">
              {results.map((r, i) => (
                <button
                  key={`${r.chatId}-${i}`}
                  type="button"
                  onClick={() => {
                    onSelectChat(r.chatId);
                    onClose();
                  }}
                  className="flex flex-col gap-1 rounded-lg border border-border-subtle bg-bg-secondary px-3 py-2 text-left transition-colors hover:bg-bg-hover"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-primary truncate">{r.chatTitle}</span>
                    <span className={`search-result-type is-${r.matchType}`}>
                      {r.matchType === "title" ? t("search.typeTitle" as never) : t("search.typeContent" as never)}
                    </span>
                  </div>
                  <div className="text-[11px] text-text-tertiary truncate">{r.preview}</div>
                </button>
              ))}
            </div>
          )}
          {!loading && !error && !query.trim() && (
            <div className="px-3 py-6 text-center text-xs text-text-tertiary">{t("search.hint" as never)}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// What-if simulator modal
// ---------------------------------------------------------------------------

export function WhatIfModal({
  open,
  onClose,
  chatId,
  originalMessageId,
  originalContent,
  onUseResult
}: {
  open: boolean;
  onClose: () => void;
  chatId: string | null;
  originalMessageId: string | null;
  originalContent: string;
  onUseResult: (alternative: string) => void;
}) {
  const { t } = useI18n();
  const [altContent, setAltContent] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAltContent(originalContent);
      setResult(null);
      setReasoning(null);
      setError(null);
    }
  }, [open, originalContent]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function generate() {
    if (!chatId || !altContent.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setReasoning(null);
    try {
      const response = await memoryClient.whatIf(chatId, {
        upToMessageId: originalMessageId,
        alternativeUserContent: altContent
      });
      setResult(response.alternative);
      setReasoning(response.reasoning || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "What-if generation failed");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={t("whatIf.title" as never)}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{t("whatIf.title" as never)}</h3>
            <p className="mt-1 text-[11px] text-text-tertiary">{t("whatIf.desc" as never)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md border border-border p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="whatif-column">
              <div className="whatif-column-label">{t("whatIf.original" as never)}</div>
              <pre className="whatif-column-text">{originalContent || "(empty)"}</pre>
            </div>
            <div className="whatif-column">
              <div className="whatif-column-label">{t("whatIf.alternative" as never)}</div>
              <textarea
                className="whatif-textarea"
                value={altContent}
                onChange={(e) => setAltContent(e.target.value)}
                rows={8}
                placeholder={t("whatIf.alternativePlaceholder" as never)}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={loading || !chatId || !altContent.trim()}
              className="rounded-md bg-accent px-4 py-2 text-xs font-semibold text-text-inverse hover:bg-accent-hover disabled:opacity-40"
            >
              {loading ? t("whatIf.generating" as never) : t("whatIf.generate" as never)}
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-danger-border bg-danger-subtle px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          {result !== null && (
            <div className="mt-4">
              <div className="whatif-column-label">{t("whatIf.result" as never)}</div>
              <pre className="whatif-result-text">{result || "(empty response)"}</pre>
              {reasoning && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-text-tertiary hover:text-text-secondary">
                    {t("whatIf.reasoning" as never)}
                  </summary>
                  <pre className="whatif-reasoning-text">{reasoning}</pre>
                </details>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onUseResult(result);
                    onClose();
                  }}
                  className="rounded-md bg-accent px-4 py-2 text-xs font-semibold text-text-inverse hover:bg-accent-hover"
                >
                  {t("whatIf.useThis" as never)}
                </button>
                <button
                  type="button"
                  onClick={generate}
                  disabled={loading}
                  className="rounded-md border border-border px-4 py-2 text-xs font-medium text-text-secondary hover:bg-bg-hover"
                >
                  {t("whatIf.regenerate" as never)}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tag chips for messages — clickable to filter
// ---------------------------------------------------------------------------

export function MessageTagChips({ tags, onClick }: { tags: string[]; onClick?: (tag: string) => void }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="message-tags-row">
      {tags.map((tag, i) => (
        <button
          key={i}
          type="button"
          className="message-tag-chip"
          onClick={() => onClick?.(tag)}
          title={`Filter by #${tag}`}
        >
          #{tag}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wrapper that lets parent components render children only when needed
// ---------------------------------------------------------------------------

export function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
  useGlobalShortcuts();
  return <>{children}</>;
}
