import { useId } from 'react';
import { Button } from '@/components/ui/button';

// Inline, so the space holds even where the stylesheet isn't loaded yet.
const SLOT_SIZE = { height: '4rem', boxSizing: 'border-box' } as const;
const SLOT_LAYOUT = {
  height: '100%',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
} as const;

export interface Suggestion {
  title: string;
  author: string | null;
}

export interface SuggestionSlotProps {
  /** What the suggestion is, e.g. "From the barcode" or "Did you mean:". */
  label: string;
  /** The suggested title and author; null leaves the slot empty. */
  suggestion: Suggestion | null;
  /** Put the suggestion in the form. */
  onUse: () => void;
  /** Keep what the volunteer typed. */
  onKeep: () => void;
}

/**
 * A title and author offered in place of what the volunteer typed, with
 * "Use this" and "Keep mine". Its space is kept while empty, so nothing below
 * it moves under the pointer when a suggestion appears, and a suggestion
 * appearing is announced politely. Neither button is a submit button (Enter
 * in a field still saves the form), and pressing one leaves the focus in the
 * field being typed in, as the dialog's Cancel does.
 */
export function SuggestionSlot({ label, suggestion, onUse, onKeep }: SuggestionSlotProps) {
  const textId = useId();
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div style={SLOT_SIZE} aria-live="polite">
      {suggestion && (
        <div
          role="group"
          aria-label={label}
          className="overflow-hidden rounded-md border bg-muted/50 px-3"
          style={SLOT_LAYOUT}
        >
          <div id={textId} className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="truncate text-sm" title={suggestion.title}>
              <span>“{suggestion.title}”</span>
              {suggestion.author && (
                <span className="text-muted-foreground"> by {suggestion.author}</span>
              )}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            aria-describedby={textId}
            onMouseDown={keepFocus}
            onClick={onUse}
          >
            Use this
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-describedby={textId}
            onMouseDown={keepFocus}
            onClick={onKeep}
          >
            Keep mine
          </Button>
        </div>
      )}
    </div>
  );
}
