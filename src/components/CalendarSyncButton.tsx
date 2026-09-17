import React, { useState } from 'react';
import { Calendar, Download, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { generateIcsFile, getGoogleCalendarUrl, CalendarEvent } from '../utils/calendarSync';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface CalendarSyncButtonProps {
  event: CalendarEvent;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'xs' | 'lg';
  className?: string;
  buttonText?: string;
  showIconOnly?: boolean;
}

export default function CalendarSyncButton({
  event,
  variant = 'outline',
  size = 'sm',
  className,
  buttonText = 'Add to Calendar',
  showIconOnly = false,
}: CalendarSyncButtonProps) {
  const [syncedType, setSyncedType] = useState<'google' | 'ics' | null>(null);

  const handleGoogleCalendar = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const url = getGoogleCalendarUrl(event);
      window.open(url, '_blank', 'noopener,noreferrer');
      setSyncedType('google');
      toast.success('Opening Google Calendar...');
      setTimeout(() => setSyncedType(null), 2500);
    } catch (err) {
      console.error('Failed to open Google Calendar:', err);
      toast.error('Failed to open Google Calendar');
    }
  };

  const handleIcsDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      generateIcsFile(event);
      setSyncedType('ics');
      toast.success('Calendar (.ics) file downloaded');
      setTimeout(() => setSyncedType(null), 2500);
    } catch (err) {
      console.error('Failed to generate .ics file:', err);
      toast.error('Failed to download calendar file');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant={variant}
            size={size}
            className={cn(
              "gap-1.5 font-semibold transition-all rounded-xl cursor-pointer select-none",
              className
            )}
            title="Sync to your personal calendar"
          />
        }
      >
        {syncedType ? (
          <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        ) : (
          <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
        )}
        {!showIconOnly && (
          <span className="truncate">
            {syncedType ? 'Added' : buttonText}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-52 p-1.5 rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md shadow-xl"
      >
        <DropdownMenuLabel className="text-[10px] uppercase font-bold text-muted-foreground px-2 py-1">
          Add to Calendar
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-1 border-border/50" />

        <DropdownMenuItem
          onClick={handleGoogleCalendar}
          className="flex items-center justify-between cursor-pointer py-2 px-2.5 rounded-lg text-xs font-semibold hover:bg-primary/10 hover:text-primary transition-colors group"
        >
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-sky-500 group-hover:scale-110 transition-transform" />
            <span>Google Calendar</span>
          </div>
          {syncedType === 'google' && (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          )}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={handleIcsDownload}
          className="flex items-center justify-between cursor-pointer py-2 px-2.5 rounded-lg text-xs font-semibold hover:bg-primary/10 hover:text-primary transition-colors group"
        >
          <div className="flex items-center gap-2">
            <Download className="h-3.5 w-3.5 text-primary group-hover:scale-110 transition-transform" />
            <span>Apple / Outlook (.ics)</span>
          </div>
          {syncedType === 'ics' && (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
