import { calendarFeed, type CalendarEvent } from './calendar.ts';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'Pragma': 'no-cache', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
export function createFeedHandler(load: (digest: string) => Promise<CalendarEvent[] | null>, appUrl: string) {
  return async (request: Request): Promise<Response> => {
    const reply = (body: string, status: number, extra = {}) => new Response(request.method === 'HEAD' ? null : body, { status, headers: { ...headers, ...extra } });
    if (!['GET', 'HEAD'].includes(request.method)) return reply('Method not allowed', 405, { Allow: 'GET, HEAD' });
    const token = new URL(request.url).searchParams.get('token');
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return reply('Calendar unavailable', 404);
    try {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      const digest = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
      const events = await load(digest);
      if (events === null) return reply('Calendar unavailable', 404);
      if (!Array.isArray(events)) throw new Error('Invalid projection');
      return reply(calendarFeed(events, appUrl), 200, { 'Content-Type': 'text/calendar; charset=utf-8' });
    } catch { return reply('Calendar temporarily unavailable', 503); }
  };
}
