'use client';

/**
 * FILE: src/components/ui/mention-textarea.tsx
 *
 * A textarea that supports @mention autocomplete for player names.
 * When the user types @, a dropdown appears filtered by the query.
 * Selecting a player inserts their full name as @Full Name.
 *
 * Storage: plain text with @Name inline — no schema change.
 * Display: use parseMentions() to highlight @Name tokens in rendered text.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

// ─── Props ────────────────────────────────────────────────────────────────────

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  players: string[];           // flat list of player names
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MentionTextarea({
  value,
  onChange,
  players,
  placeholder,
  rows = 2,
  disabled = false,
  maxLength,
  className,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null); // null = not in mention mode
  const [mentionStart, setMentionStart] = useState<number>(0);           // cursor pos of the @
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 }); // kept for compatibility

  // Filtered players based on query
  const filtered = mentionQuery !== null
    ? players.filter(p =>
        p.toLowerCase().includes(mentionQuery.toLowerCase())
      ).slice(0, 8)
    : [];

  // ── Detect @ trigger on input ─────────────────────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);

    const cursor = e.target.selectionStart ?? val.length;
    // Find the @ before cursor on the same "word"
    const textBefore = val.slice(0, cursor);
    const atMatch = textBefore.match(/@([^@\n]*)$/);

    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionStart(cursor - atMatch[0].length);
      setSelectedIdx(0);
    } else {
      setMentionQuery(null);
    }
  };

  // ── Position dropdown below textarea ─────────────────────────────────────
  // Simple and reliable: always appears just below the textarea, left-aligned
  const positionDropdown = (_textarea: HTMLTextAreaElement, _cursor: number) => {
    // Position is handled via CSS — dropdown is absolutely positioned
    // relative to the wrapper div, appearing below the textarea
    setDropdownPos({ top: 0, left: 0 }); // unused — CSS handles it
  };

  // ── Insert mention on selection ───────────────────────────────────────────
  const insertMention = useCallback((playerName: string) => {
    if (!textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart ?? value.length;
    // Replace from @ to current cursor with @Full Name + space
    const before = value.slice(0, mentionStart);
    const after = value.slice(cursor);
    const inserted = `@${playerName} `;
    const newVal = before + inserted + after;
    onChange(newVal);
    setMentionQuery(null);

    // Restore focus and set cursor after inserted text
    setTimeout(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      const newCursor = mentionStart + inserted.length;
      textareaRef.current.setSelectionRange(newCursor, newCursor);
    }, 0);
  }, [value, mentionStart, onChange]);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery === null || !filtered.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (filtered[selectedIdx]) insertMention(filtered[selectedIdx]);
    } else if (e.key === 'Escape') {
      setMentionQuery(null);
    }
  };

  // ── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setMentionQuery(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        maxLength={maxLength}
        className={cn(
          'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
          'ring-offset-background placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50 resize-none',
          className
        )}
      />

      {/* Mention dropdown — appears below the textarea, full width */}
      {mentionQuery !== null && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 z-50 bg-card border rounded-xl shadow-lg py-1 mt-1"
          style={{ top: '100%' }}
        >
          <p className="text-xs text-muted-foreground px-3 py-1 border-b">
            Tag a player
          </p>
          {filtered.map((player, i) => (
            <button
              key={player}
              type="button"
              onMouseDown={e => {
                e.preventDefault(); // prevent textarea blur
                insertMention(player);
              }}
              className={cn(
                'w-full text-left px-3 py-2 text-sm transition-colors',
                i === selectedIdx
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              )}
            >
              @{player}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helper: parse @mentions in rendered text ─────────────────────────────────

/**
 * Splits text into plain segments and @mention segments.
 * Use in report display to highlight mentions as badges.
 *
 * Example:
 *   parseMentions("Great catch by @Atharv Pilkhane at mid-on")
 *   → [
 *       { type: 'text', value: 'Great catch by ' },
 *       { type: 'mention', value: 'Atharv Pilkhane' },
 *       { type: 'text', value: ' at mid-on' },
 *     ]
 */
export interface TextSegment {
  type: 'text' | 'mention';
  value: string;
}

export function parseMentions(text: string, knownPlayers?: string[]): TextSegment[] {
  if (!text) return [];
  const segments: TextSegment[] = [];
  // Match @Word Word (up to 4 words after @)
  const regex = /@([A-Z][a-zA-Z'-]+(?: [A-Z][a-zA-Z'-]+){0,3})/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ type: 'text', value: text.slice(last, match.index) });
    }
    const name = match[1];
    // If knownPlayers provided, only highlight if it's actually a known player
    const isKnown = !knownPlayers || knownPlayers.some(p =>
      p.toLowerCase() === name.toLowerCase()
    );
    segments.push({ type: isKnown ? 'mention' : 'text', value: isKnown ? name : match[0] });
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    segments.push({ type: 'text', value: text.slice(last) });
  }
  return segments;
}

// ─── Helper: render text with @mention highlights ────────────────────────────

/**
 * Renders a string with @mentions highlighted as inline badges.
 * Use in place of <p>{text}</p> in report display components.
 */
export function MentionText({
  text,
  knownPlayers,
  className,
}: {
  text: string;
  knownPlayers?: string[];
  className?: string;
}) {
  const segments = parseMentions(text, knownPlayers);
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.type === 'mention' ? (
          <span
            key={i}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20 mx-0.5"
            title={`Player: ${seg.value}`}
          >
            @{seg.value}
          </span>
        ) : (
          <span key={i}>{seg.value}</span>
        )
      )}
    </span>
  );
}
