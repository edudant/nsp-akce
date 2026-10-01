import { format, isSameDay, parseISO } from "date-fns";
import { cs } from "date-fns/locale";

export function formatDate(date: string, pattern = "d. MMMM yyyy") {
  return format(parseISO(date), pattern, { locale: cs });
}

export function formatShortDate(date: string) {
  return format(parseISO(date), "d. M.", { locale: cs });
}

export function formatWeekday(date: string) {
  return format(parseISO(date), "EEEE", { locale: cs });
}

export function formatDateTime(date: string, time: string) {
  return `${format(parseISO(date), "EEEE d. MMMM", { locale: cs })}, ${time}`;
}

export function dateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function todayInPrague() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isToday(date: string) {
  return isSameDay(parseISO(date), new Date());
}

export function formatPoints(value: number) {
  return new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatAuditTime(at?: string | null) {
  return at
    ? new Intl.DateTimeFormat("cs-CZ", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Europe/Prague",
      }).format(new Date(at))
    : "";
}

export function formatSetDate(at: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(new Date(at));
}

export function formatSetName(at = new Date().toISOString()) {
  return `${formatSetDate(at)} ${new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at))}`;
}
