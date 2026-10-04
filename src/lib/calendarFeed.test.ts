import { describe, expect, it } from 'vitest';
import { calendarFeed, foldLine, type CalendarEvent } from '../../supabase/functions/calendar-feed/calendar';
import { createFeedHandler } from '../../supabase/functions/calendar-feed/handler';
const event: CalendarEvent = { id: 'event-1', title: 'Páteční zkouška', location: 'Sál; Postřekov', note: 'První řádek,\nDruhý \\ řádek', startsAt: '2026-03-29T01:30:00Z', endsAt: '2026-03-29T02:30:00Z', updatedAt: '2026-03-28T12:00:00Z', status: 'open', response: 'yes', memberResponse: 'maybe', memberResponseAt: '2026-03-27T12:00:00Z', adminResponse: 'yes', adminResponseAt: '2026-03-28T12:00:00Z' };
const app = 'https://example.org/nsp-akce/';
const unfold = (value: string) => value.replace(/\r\n /g, '');
describe('calendar serialization', () => {
 it('provides the default calendar name even when there are no events', () => {
  for (const events of [[], [event]]) {
   const text = calendarFeed(events, app);
   const header = text.split('BEGIN:VEVENT')[0];
   expect(header).toContain('\r\nNAME:NSP Akce\r\n');
   expect(header).toContain('\r\nX-WR-CALNAME:NSP Akce\r\n');
  }
 });
 it('exports current response, provenance, event note and app link, without alarms', () => {
  const text = unfold(calendarFeed([event], app));
  expect(text).toContain('SUMMARY:[Přijdu] Páteční zkouška');
  expect(text).toContain('Vlastní odpověď: Zatím nevím');
  expect(text).toContain('Změna adminem: Přijdu');
  expect(text).toContain('První řádek\\,\\nDruhý \\\\ řádek');
  expect(text).toContain('URL:https://example.org/nsp-akce/#/udalosti/event-1');
  expect(text).not.toContain('VALARM');
  expect(text).toContain('DTSTART:20260329T013000Z'); // DST boundary, UTC remains unchanged
  expect(text).toContain('DTEND:20260329T023000Z');
  expect(text).toContain('LAST-MODIFIED:20260328T120000Z');
  expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
 });
 it('keeps UID on cancellation and content changes', () => {
  const initial = calendarFeed([event], app);
  const changed = calendarFeed([{ ...event, status: 'cancelled', title: 'Nový název', response: 'no', updatedAt: '2026-10-25T02:00:00Z' }], app);
  expect(changed.match(/UID:.*/)?.[0]).toBe(initial.match(/UID:.*/)?.[0]);
  expect(changed).toContain('STATUS:CANCELLED');
  expect(changed).toContain('SUMMARY:Zrušeno · [Nepřijdu] Nový název');
  expect(changed).toContain('LAST-MODIFIED:20261025T020000Z');
 });
 it('labels missing responses and folds UTF-8 without breaking code points', () => {
  expect(calendarFeed([{ ...event, response: 'unanswered', memberResponse: null, adminResponse: null }], app)).toContain('[Bez odpovědi]');
  const source = `DESCRIPTION:${'ěščřž😀'.repeat(80)}`;
  const folded = foldLine(source);
  for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  expect(unfold(folded)).toBe(source);
 });
});
describe('public handler', () => {
 const token = 'a'.repeat(64);
 const request = (method = 'GET', value = token) => new Request(`https://example.org/?token=${value}`, { method });
 it('hashes token, serves GET/HEAD privately, supports valid empty feeds', async () => {
  let digest = '';
  const handler = createFeedHandler(async hash => { digest = hash; return [event]; }, app);
  const response = await handler(request());
  expect(response.status).toBe(200); expect(digest).toMatch(/^[0-9a-f]{64}$/); expect(digest).not.toBe(token);
  expect(response.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await (await handler(request('HEAD'))).text()).toBe('');
  expect((await createFeedHandler(async () => [], app)(request())).status).toBe(200);
 });
 it('returns generic errors for revoked or malformed tokens and 503 for backend failures', async () => {
  const handler = createFeedHandler(async () => null, app);
  expect((await handler(request())).status).toBe(404);
  expect(await (await handler(request('GET', 'invalid'))).text()).toBe(await (await handler(request())).text());
  const failure = createFeedHandler(async () => { throw new Error('private data'); }, app);
  const response = await failure(request()); expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private data');
  expect((await handler(request('POST'))).status).toBe(405);
  expect((await createFeedHandler(async () => [event], '')(request())).status).toBe(503);
 });
});
