import { useState, useEffect, useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreateRequest, useServerTimeZone, useValidateRequest } from '@/hooks';
import { isAfterToday, todayDateInTimeZone } from '@/lib/serverDate';
import type { Jurisdiction, RequestValidationWarnings, Action } from '@/types';

interface RequestFormProps {
  jurisdiction: Jurisdiction;
  inmateId: number;
  onRequestCreated?: (requestIndex: number, action: Action) => void;
}

const POSTMARK_DATE_COOKIE = 'ibp_last_postmark_date';

const FUTURE_POSTMARK_MESSAGE = "The postmark date can't be in the future.";

const requestSchema = z.object({
  date_postmarked: z.date({ message: 'Postmark date is required' }),
});

type RequestFormData = z.infer<typeof requestSchema>;

function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

// The remembered postmark date is only good for the current working session:
// the cookie expires at the end of the day and records the day it was saved,
// so a volunteer never inherits a stale date from a previous session.
function setCookie(name: string, value: string) {
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const expires = `expires=${endOfDay.toUTCString()}`;
  document.cookie = `${name}=${value};${expires};path=/`;
}

function savePostmarkDate(date: Date) {
  const savedOn = format(new Date(), 'yyyy-MM-dd');
  setCookie(POSTMARK_DATE_COOKIE, encodeURIComponent(`${date.toISOString()}|${savedOn}`));
}

function loadPostmarkDateSavedToday(): Date | null {
  const raw = getCookie(POSTMARK_DATE_COOKIE);
  if (!raw) return null;
  const [savedDate, savedOn] = decodeURIComponent(raw).split('|');
  // Only pre-fill a date that was saved today (older-format cookies without a
  // save date are ignored as stale).
  if (savedOn !== format(new Date(), 'yyyy-MM-dd')) return null;
  const date = new Date(savedDate);
  return isNaN(date.getTime()) ? null : date;
}

export function RequestForm({ jurisdiction, inmateId, onRequestCreated }: RequestFormProps) {
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [warnings, setWarnings] = useState<RequestValidationWarnings | null>(null);
  const [pendingAction, setPendingAction] = useState<Action | null>(null);

  const fillButtonRef = useRef<HTMLButtonElement>(null);
  const changeTossButtonRef = useRef<HTMLButtonElement>(null);
  const hasInitiallyFocused = useRef(false);
  const hasRestoredDate = useRef(false);

  // "Today" is the server's date (America/Chicago by default), not the
  // browser's or UTC's: no postmark date after it can be picked or submitted.
  const timeZone = useServerTimeZone();
  const today = todayDateInTimeZone(timeZone);

  const createRequestMutation = useCreateRequest(jurisdiction, inmateId);
  const validateRequestMutation = useValidateRequest(jurisdiction, inmateId);

  const {
    setValue,
    setError,
    clearErrors,
    control,
    formState: { errors },
  } = useForm<RequestFormData>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      date_postmarked: undefined,
    },
  });

  const datePostmarked = useWatch({ control, name: 'date_postmarked' });

  // Load postmark date from cookie on mount, only if it was saved today and
  // is not after today
  useEffect(() => {
    if (hasRestoredDate.current) return;
    hasRestoredDate.current = true;
    const savedDate = loadPostmarkDateSavedToday();
    if (savedDate && !isAfterToday(savedDate, timeZone)) {
      setValue('date_postmarked', savedDate);
    }
  }, [setValue, timeZone]);

  // The calendar disables later days, but a date can still be in the future
  // by the time it is submitted (e.g. the server's zone arrived after it was
  // picked), so every submit checks again.
  const refuseFuturePostmark = (date: Date) => {
    if (!isAfterToday(date, timeZone)) return false;
    setError('date_postmarked', { type: 'manual', message: FUTURE_POSTMARK_MESSAGE });
    return true;
  };

  // Auto-focus Fill button on initial load when date is available
  useEffect(() => {
    if (datePostmarked && !hasInitiallyFocused.current) {
      fillButtonRef.current?.focus();
      hasInitiallyFocused.current = true;
    }
  }, [datePostmarked]);

  // Auto-focus Change to Toss button when warning dialog opens
  useEffect(() => {
    if (showWarningDialog) {
      // Small delay to ensure dialog is fully rendered
      setTimeout(() => {
        changeTossButtonRef.current?.focus();
      }, 100);
    }
  }, [showWarningDialog]);

  const handleSubmit = async (action: Action) => {
    if (!datePostmarked || refuseFuturePostmark(datePostmarked)) {
      return;
    }

    // Save postmark date to cookie (valid for the rest of today only)
    savePostmarkDate(datePostmarked);

    const requestData = {
      date_postmarked: format(datePostmarked, 'yyyy-MM-dd'),
      date_processed: format(new Date(), 'yyyy-MM-dd'),
      action,
    };

    // Skip validation for "Tossed" requests
    if (action === 'Tossed') {
      try {
        const newRequest = await createRequestMutation.mutateAsync(requestData);
        // Don't reset - keep the date_postmarked value
        toast.success('Request tossed');
        onRequestCreated?.(newRequest.index, action);
      } catch (error) {
        console.error('Failed to create request:', error);
        toast.error('Failed to create request. Please try again.');
      }
      return;
    }

    // Validate "Filled" requests
    try {
      const validationWarnings = await validateRequestMutation.mutateAsync(requestData);

      const hasWarnings =
        validationWarnings.entry_age ||
        validationWarnings.release ||
        validationWarnings.postmarkdate;

      if (hasWarnings) {
        setWarnings(validationWarnings);
        setPendingAction(action);
        setShowWarningDialog(true);
      } else {
        const newRequest = await createRequestMutation.mutateAsync(requestData);
        // Don't reset - keep the date_postmarked value
        toast.success('Request filled successfully');
        onRequestCreated?.(newRequest.index, action);
      }
    } catch (error) {
      console.error('Failed to validate request:', error);
      toast.error('Failed to validate request. Please try again.');
    }
  };

  const closeWarningDialog = () => {
    setShowWarningDialog(false);
    setWarnings(null);
    setPendingAction(null);
  };

  const handleConfirmWithWarnings = async () => {
    if (!datePostmarked || !pendingAction) return;
    if (refuseFuturePostmark(datePostmarked)) {
      closeWarningDialog();
      return;
    }

    const requestData = {
      date_postmarked: format(datePostmarked, 'yyyy-MM-dd'),
      date_processed: format(new Date(), 'yyyy-MM-dd'),
      action: pendingAction,
    };

    try {
      const newRequest = await createRequestMutation.mutateAsync(requestData);
      // Don't reset - keep the date_postmarked value
      closeWarningDialog();
      toast.success('Request filled successfully');
      onRequestCreated?.(newRequest.index, pendingAction);
    } catch (error) {
      console.error('Failed to create request:', error);
      toast.error('Failed to create request. Please try again.');
    }
  };

  const handleChangeTossed = async () => {
    if (!datePostmarked) return;
    if (refuseFuturePostmark(datePostmarked)) {
      closeWarningDialog();
      return;
    }

    const tossAction: Action = 'Tossed';
    const requestData = {
      date_postmarked: format(datePostmarked, 'yyyy-MM-dd'),
      date_processed: format(new Date(), 'yyyy-MM-dd'),
      action: tossAction,
    };

    try {
      const newRequest = await createRequestMutation.mutateAsync(requestData);
      // Don't reset - keep the date_postmarked value
      closeWarningDialog();
      toast.success('Request tossed');
      onRequestCreated?.(newRequest.index, tossAction);
    } catch (error) {
      console.error('Failed to create request:', error);
      toast.error('Failed to create request. Please try again.');
    }
  };

  const warningList = warnings
    ? [warnings.entry_age, warnings.release, warnings.postmarkdate].filter(Boolean)
    : [];

  return (
    <>
      <div className="space-y-1">
        {createRequestMutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>Failed to create request. Please try again.</AlertDescription>
          </Alert>
        )}

        <Label className="font-semibold">USPS postmark date:</Label>
        {/* Date picker and Fill/Toss buttons joined into one control, like a
            Bootstrap input group. */}
        <div className="flex">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 justify-start rounded-r-none text-left font-normal"
              >
                <CalendarIcon className="mr-1 h-4 w-4" />
                {datePostmarked ? format(datePostmarked, 'yyyy-MM-dd') : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={datePostmarked}
                onSelect={(date) => {
                  if (!date) return;
                  clearErrors('date_postmarked');
                  setValue('date_postmarked', date);
                }}
                today={today}
                disabled={{ after: today }}
                endMonth={today}
              />
            </PopoverContent>
          </Popover>

          <Button
            ref={fillButtonRef}
            size="sm"
            variant="outline"
            className="rounded-none border-l-0"
            onClick={() => handleSubmit('Filled')}
            disabled={
              !datePostmarked ||
              createRequestMutation.isPending ||
              validateRequestMutation.isPending
            }
          >
            Fill
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-l-none border-l-0"
            onClick={() => handleSubmit('Tossed')}
            disabled={!datePostmarked || createRequestMutation.isPending}
          >
            Toss
          </Button>
        </div>

        {errors.date_postmarked && (
          <p role="alert" className="text-sm text-red-500">
            {errors.date_postmarked.message}
          </p>
        )}
      </div>

      <Dialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Warnings Detected</DialogTitle>
            <DialogDescription>
              The following warnings were detected for this request:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {warningList.map((warning, index) => (
              <Alert key={index}>
                <AlertDescription>{warning}</AlertDescription>
              </Alert>
            ))}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowWarningDialog(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={handleConfirmWithWarnings}>
              Proceed with Fill
            </Button>
            {/* "Change to Toss" is the deliberate safer default: it receives
                both keyboard focus and primary styling so Enter and the visual
                affordance agree. */}
            <Button ref={changeTossButtonRef} onClick={handleChangeTossed}>
              Change to Toss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
