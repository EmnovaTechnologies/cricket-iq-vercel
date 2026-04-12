'use client';

import * as React from 'react';
import { format, parse, isValid } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { FormControl, FormDescription, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import type { ControllerRenderProps, FieldValues, Path } from 'react-hook-form';

// ─── Locale detection ────────────────────────────────────────────────────────

type LocaleDateConfig = {
  format: string;          // date-fns format string
  placeholder: string;     // shown in the input
  description: string;     // shown below the input
};

function getLocaleDateConfig(): LocaleDateConfig {
  if (typeof navigator === 'undefined') {
    // SSR fallback — default to US
    return { format: 'MM/dd/yyyy', placeholder: 'MM/DD/YYYY', description: 'Enter date as MM/DD/YYYY or pick from calendar.' };
  }

  const locale = navigator.language || 'en-US';

  // ISO-style locales (YYYY-MM-DD)
  if (/^(ja|ko|zh|sv|lt|hu)/.test(locale)) {
    return { format: 'yyyy-MM-dd', placeholder: 'YYYY-MM-DD', description: 'Enter date as YYYY-MM-DD or pick from calendar.' };
  }

  // Day-first locales (DD/MM/YYYY)
  if (/^(en-GB|en-AU|en-NZ|en-IN|en-ZA|en-SG|fr|de|es|it|pt|nl|pl|ru|ar|hi|tr|id|vi)/.test(locale)) {
    return { format: 'dd/MM/yyyy', placeholder: 'DD/MM/YYYY', description: 'Enter date as DD/MM/YYYY or pick from calendar.' };
  }

  // Default: US month-first (MM/DD/YYYY)
  return { format: 'MM/dd/yyyy', placeholder: 'MM/DD/YYYY', description: 'Enter date as MM/DD/YYYY or pick from calendar.' };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DatePickerFieldProps<
  TFieldValues extends FieldValues,
  TName extends Path<TFieldValues>
> {
  field: ControllerRenderProps<TFieldValues, TName>;
  label: string;
  description?: string;        // overrides the auto locale description if provided
  disabled?: boolean;
  required?: boolean;
  fromYear?: number;           // earliest selectable year in calendar
  toYear?: number;             // latest selectable year in calendar
  yearRange?: number;          // ± years from current year (used if fromYear/toYear not set)
}

export function DatePickerField<
  TFieldValues extends FieldValues,
  TName extends Path<TFieldValues>
>({
  field,
  label,
  description,
  disabled = false,
  required = false,
  fromYear,
  toYear,
  yearRange = 5,
}: DatePickerFieldProps<TFieldValues, TName>) {
  const localeConfig = React.useMemo(() => getLocaleDateConfig(), []);
  const currentYear = new Date().getFullYear();
  const calFromYear = fromYear ?? currentYear - yearRange;
  const calToYear = toYear ?? currentYear + yearRange;

  const [inputValue, setInputValue] = React.useState(
    field.value && isValid(field.value as Date)
      ? format(field.value as Date, localeConfig.format)
      : ''
  );
  const [isCalendarOpen, setIsCalendarOpen] = React.useState(false);

  // Sync inputValue when field.value changes externally (e.g. form reset)
  React.useEffect(() => {
    if (field.value && isValid(field.value as Date)) {
      setInputValue(format(field.value as Date, localeConfig.format));
    } else {
      setInputValue('');
    }
  }, [field.value, localeConfig.format]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleInputBlur = () => {
    if (!inputValue.trim()) {
      field.onChange(null);
      return;
    }

    // Try locale format first, then fallbacks
    const formatsToTry = [
      localeConfig.format,
      'MM/dd/yyyy',
      'dd/MM/yyyy',
      'yyyy-MM-dd',
      'MM-dd-yyyy',
      'dd-MM-yyyy',
    ];

    let parsed: Date | null = null;
    for (const fmt of formatsToTry) {
      try {
        const d = parse(inputValue.trim(), fmt, new Date());
        if (isValid(d)) { parsed = d; break; }
      } catch { /* ignore */ }
    }

    if (parsed) {
      field.onChange(parsed);
      // Reformat to locale format for display consistency
      setInputValue(format(parsed, localeConfig.format));
    } else {
      field.onChange(null);
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    field.onChange(date ?? null);
    if (date) setInputValue(format(date, localeConfig.format));
    setIsCalendarOpen(false);
  };

  return (
    <FormItem className="flex flex-col">
      <FormLabel>
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </FormLabel>
      <div className="relative">
        <FormControl>
          <Input
            placeholder={localeConfig.placeholder}
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            className={cn('pr-10', disabled && 'cursor-not-allowed opacity-50')}
            disabled={disabled}
          />
        </FormControl>
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              aria-label="Open calendar"
              disabled={disabled}
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.preventDefault(); setIsCalendarOpen(prev => !prev); }}
            >
              <CalendarIcon className="h-4 w-4 opacity-80" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              classNames={{ caption_label: 'hidden' }}
              selected={field.value && isValid(field.value as Date) ? (field.value as Date) : undefined}
              onSelect={handleCalendarSelect}
              disabled={(date) => date < new Date('1900-01-01') || !!disabled}
              initialFocus
              captionLayout="dropdown-buttons"
              fromYear={calFromYear}
              toYear={calToYear}
            />
          </PopoverContent>
        </Popover>
      </div>
      <FormDescription>
        {description ?? localeConfig.description}
      </FormDescription>
      <FormMessage />
    </FormItem>
  );
}
