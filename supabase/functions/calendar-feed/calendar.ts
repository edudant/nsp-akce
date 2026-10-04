export interface CalendarEvent {
  id: string; title: string; location: string | null; note: string | null;
  startsAt: string; endsAt: string; updatedAt: string; status: string;
  response: string; memberResponse: string | null; memberResponseAt: string | null;
  adminResponse: string | null; adminResponseAt: string | null;
}
const labels: Record<string, string> = { yes: 'Přijdu', no: 'Nepřijdu', maybe: 'Zatím nevím', substitute: 'Náhradník', unanswered: 'Bez odpovědi', unset: 'Bez odpovědi' };
function label(value: string) { return labels[value] ?? 'Bez odpovědi'; }
export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
// RFC 5545 counts octets, including the space on continuation lines.
export function foldLine(value: string): string {
  const encoder = new TextEncoder();
  let line = ''; let bytes = 0; const lines: string[] = [];
  for (const char of value) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) { lines.push(line); line = ' '; bytes = 1; }
    line += char; bytes += size;
  }
  lines.push(line); return lines.join('\r\n');
}
function utc(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid database timestamp');
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
export function calendarFeed(events: CalendarEvent[], appUrl: string): string {
  const base = new URL(appUrl);
  if (base.protocol !== 'https:' && base.hostname !== '127.0.0.1' && base.hostname !== 'localhost') throw new Error('Invalid app URL');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NSP Akce//Osobní odběr//CS', 'CALSCALE:GREGORIAN'];
  for (const event of events) {
    const url = new URL(base); url.hash = `/udalosti/${event.id}`;
    const description = [event.note ?? '', `Aktuální odpověď: ${label(event.response)}`];
    if (event.memberResponse !== null) description.push(`Vlastní odpověď: ${label(event.memberResponse)}${event.memberResponseAt ? ` (${event.memberResponseAt})` : ''}`);
    if (event.adminResponse !== null) description.push(`Změna adminem: ${label(event.adminResponse)}${event.adminResponseAt ? ` (${event.adminResponseAt})` : ''}`);
    description.push(url.href);
    lines.push('BEGIN:VEVENT', `UID:${event.id}@nsp-akce`, `DTSTAMP:${utc(event.updatedAt)}`, `LAST-MODIFIED:${utc(event.updatedAt)}`, `DTSTART:${utc(event.startsAt)}`, `DTEND:${utc(event.endsAt)}`,
      `SUMMARY:${escapeText(`${event.status === 'cancelled' ? 'Zrušeno · ' : ''}[${label(event.response)}] ${event.title}`)}`,
      `DESCRIPTION:${escapeText(description.filter(Boolean).join('\n'))}`, `LOCATION:${escapeText(event.location ?? '')}`, `URL:${url.href}`,
      `STATUS:${event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR'); return lines.map(foldLine).join('\r\n') + '\r\n';
}
