import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getValidationErrors } from '@/lib/api';
import { useClearPronouns, useSetPronouns } from '@/hooks';
import type { Jurisdiction } from '@/types';

/** The pronouns offered as choices; anything else is "Other (as written)". */
const PRONOUN_CHOICES = ['he/him', 'she/her', 'they/them'] as const;

const OTHER = 'other';
// Matches the backend's limit.
const MAX_LENGTH = 30;

const FIELD_LABELS: Record<string, string> = {
  pronouns: 'Pronouns',
  set_by: 'Initials',
};

interface PronounsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jurisdiction: Jurisdiction;
  inmateId: number;
  /** The pronouns already recorded, or null to record them for the first
   *  time. Deliberately the only thing about the inmate this dialog gets:
   *  pronouns must come from a letter, never from `sex`. */
  pronouns: string | null;
}

/** Why a save or remove failed, from the server's validation errors if any. */
function errorMessage(error: unknown): string {
  const fieldErrors = getValidationErrors(error);
  if (fieldErrors.length > 0) {
    return fieldErrors
      .map(({ field, message }) => `${FIELD_LABELS[field] ?? field}: ${message}`)
      .join(' ');
  }
  return error instanceof Error ? error.message : String(error);
}

/** Record, change or remove the pronouns a person stated in a letter. */
export function PronounsDialog({
  open,
  onOpenChange,
  jurisdiction,
  inmateId,
  pronouns,
}: PronounsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pronouns stated in a letter</DialogTitle>
          <DialogDescription>
            Only record pronouns this person wrote in a letter. Don&apos;t guess from their name,
            the TDCJ/BOP &apos;Sex&apos; field, or their unit. If the letter doesn&apos;t say, leave
            this empty.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so each opening starts from the saved value. */}
        <PronounsForm
          jurisdiction={jurisdiction}
          inmateId={inmateId}
          pronouns={pronouns}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function initialChoice(pronouns: string | null): string {
  if (!pronouns) return '';
  return (PRONOUN_CHOICES as readonly string[]).includes(pronouns) ? pronouns : OTHER;
}

function PronounsForm({
  jurisdiction,
  inmateId,
  pronouns,
  onDone,
}: {
  jurisdiction: Jurisdiction;
  inmateId: number;
  pronouns: string | null;
  onDone: () => void;
}) {
  const setMutation = useSetPronouns(jurisdiction, inmateId);
  const clearMutation = useClearPronouns(jurisdiction, inmateId);

  const [choice, setChoice] = useState(() => initialChoice(pronouns));
  const [otherText, setOtherText] = useState(() =>
    initialChoice(pronouns) === OTHER ? (pronouns ?? '') : ''
  );
  const [initials, setInitials] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isEditing = pronouns !== null;
  const isPending = setMutation.isPending || clearMutation.isPending;
  const value = choice === OTHER ? otherText.trim() : choice;
  const canSave = value !== '' && initials.trim() !== '' && !isPending;
  const canRemove = initials.trim() !== '' && !isPending;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    setError(null);
    try {
      await setMutation.mutateAsync({ pronouns: value, set_by: initials.trim() });
      toast.success('Pronouns saved');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const remove = async () => {
    if (!canRemove) return;
    setError(null);
    try {
      await clearMutation.mutateAsync({ set_by: initials.trim() });
      toast.success('Pronouns removed');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Pronouns</legend>
        {[...PRONOUN_CHOICES, OTHER].map((option) => (
          <div key={option} className="flex items-center gap-2">
            <input
              id={`pronouns-${option}`}
              type="radio"
              name="pronouns"
              value={option}
              checked={choice === option}
              onChange={() => setChoice(option)}
              className="h-4 w-4"
            />
            <Label htmlFor={`pronouns-${option}`} className="font-normal">
              {option === OTHER ? 'Other (as written)' : option}
            </Label>
          </div>
        ))}
        {choice === OTHER && (
          <div className="space-y-1 pl-6">
            <Label htmlFor="pronouns-other-text" className="text-xs">
              As written in the letter
            </Label>
            <Input
              id="pronouns-other-text"
              autoComplete="off"
              maxLength={MAX_LENGTH}
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              className="h-9"
            />
          </div>
        )}
      </fieldset>

      <div className="space-y-1">
        <Label htmlFor="pronouns-initials">Your initials</Label>
        <Input
          id="pronouns-initials"
          autoComplete="off"
          required
          maxLength={40}
          value={initials}
          onChange={(e) => setInitials(e.target.value)}
          className="h-9"
        />
      </div>

      <DialogFooter>
        {isEditing && (
          <Button
            type="button"
            variant="outline"
            className="text-destructive sm:mr-auto"
            onClick={remove}
            disabled={!canRemove}
          >
            {clearMutation.isPending ? 'Removing...' : 'Remove'}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave}>
          {setMutation.isPending ? 'Saving...' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  );
}
