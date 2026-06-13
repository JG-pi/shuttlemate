import type { AppEvent } from './firebase';

export function formatEventStartDate(dateStr: string): string {
  const date = parseEventDate(dateStr);
  if (!date) return dateStr;

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatEventDateTimeRange(event: Pick<AppEvent, 'date' | 'durationHours'>): string {
  const startDate = parseEventDate(event.date);
  if (!startDate) return event.date;

  if (typeof event.durationHours !== 'number' || event.durationHours <= 0) {
    return formatEventStartDate(event.date);
  }

  const endDate = new Date(startDate.getTime() + event.durationHours * 60 * 60 * 1000);
  const datePart = startDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return `${datePart}, ${formatTime(startDate)} - ${formatTime(endDate)}`;
}

function parseEventDate(dateStr: string): Date | null {
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).replace(/\s/g, '');
}
