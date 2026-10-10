export interface Reminder {
  subscriptionId: string; eventId: string; deadline: string; leaseId: string;
  endpoint: string; keys: { p256dh: string; auth: string }; title: string;
}
export function createReminderHandler(deps: {
  secret: string; appUrl: string;
  claim: () => Promise<Reminder[]>;
  isCurrent: (lease: string) => Promise<boolean>;
  send: (reminder: Reminder, payload: string, ttl: number) => Promise<unknown>;
  finish: (lease: string, expired: boolean) => Promise<void>;
}) {
  const base = new URL(deps.appUrl);
  if (base.protocol !== 'https:' || base.search || base.hash || !base.pathname.endsWith('/')) throw new Error('Invalid push app URL');
  return async (request: Request) => {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    if (!deps.secret || request.headers.get('authorization') !== `Bearer ${deps.secret}`) return new Response(null, { status: 401 });
    try {
      let sent = 0, failed = 0, expired = 0;
      const reminders = await deps.claim();
      const deliver = async (reminder: Reminder) => {
        const ttl = Math.floor((Date.parse(reminder.deadline) - Date.now()) / 1000);
        if (ttl <= 0) return;
        try {
          if (!await deps.isCurrent(reminder.leaseId)) return;
          await deps.send(reminder, JSON.stringify({
            title: 'Vyjádřete se k účasti',
            body: `${reminder.title}: termín pro vyjádření se blíží.`,
            tag: `response:${reminder.eventId}:${reminder.deadline}`,
            url: `${base.href}#/udalosti/${encodeURIComponent(reminder.eventId)}`,
          }), ttl);
          await deps.finish(reminder.leaseId, false);
          sent++;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await deps.finish(reminder.leaseId, true);
            expired++;
          } else failed++;
        }
      };
      // Ten concurrent sends keep a batch within the Edge Function's wall-time limit.
      for (let offset = 0; offset < reminders.length; offset += 10) {
        await Promise.all(reminders.slice(offset, offset + 10).map(deliver));
      }
      return Response.json({ sent, failed, expired }, { status: failed ? 503 : 200 });
    } catch {
      return Response.json({ error: 'Reminder delivery failed' }, { status: 500 });
    }
  };
}
