import { describe, expect, it, vi } from 'vitest';
import { createReminderHandler, type Reminder } from '../../supabase/functions/push-reminders/handler';
const reminder: Reminder = { subscriptionId: 's', eventId: 'e', deadline: new Date(Date.now() + 3_600_000).toISOString(), leaseId: 'lease', endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'x', auth: 'x' }, title: 'Vystoupení' };
function fixture() {
  const deps = { secret: 'test', appUrl: 'https://example.com/nsp-akce/', claim: vi.fn().mockResolvedValue([reminder]), isCurrent: vi.fn().mockResolvedValue(true), send: vi.fn().mockResolvedValue({}), finish: vi.fn().mockResolvedValue(undefined) };
  return { deps, handler: createReminderHandler(deps), request: new Request('https://example.com', { method: 'POST', headers: { authorization: 'Bearer test' } }) };
}
describe('push reminder worker', () => {
  it('rejects unauthenticated invocation before reading subscriptions', async () => {
    const { deps, handler } = fixture();
    expect((await handler(new Request('https://example.com', { method: 'POST' }))).status).toBe(401);
    expect(deps.claim).not.toHaveBeenCalled();
  });
  it('sends an event deep link, limits lifetime to the deadline and records delivery', async () => {
    const { deps, handler, request } = fixture();
    expect((await handler(request)).status).toBe(200);
    const payload = JSON.parse(deps.send.mock.calls[0][1]);
    expect(payload.url).toBe('https://example.com/nsp-akce/#/udalosti/e');
    expect(payload.body).toContain('Vystoupení');
    expect(deps.send.mock.calls[0][2]).toBeLessThanOrEqual(3600);
    expect(deps.finish).toHaveBeenCalledWith('lease', false);
  });
  it.each([404,410])('removes expired subscriptions for HTTP %s', async (statusCode) => {
    const { deps, handler, request } = fixture();
    deps.send.mockRejectedValue({ statusCode });
    expect((await handler(request)).status).toBe(200);
    expect(deps.finish).toHaveBeenCalledWith('lease', true);
  });
  it('leaves transient failures for a later lease retry and continues other deliveries', async () => {
    const { deps, handler, request } = fixture();
    deps.claim.mockResolvedValue([reminder, { ...reminder, leaseId: 'other' }]);
    deps.send.mockRejectedValueOnce({ statusCode: 503 });
    expect((await handler(request)).status).toBe(503);
    expect(deps.finish).toHaveBeenCalledExactlyOnceWith('other', false);
  });
  it('skips a subscription revoked or answered after the batch was claimed', async () => {
    const { deps, handler, request } = fixture();
    deps.isCurrent.mockResolvedValue(false);
    await handler(request);
    expect(deps.send).not.toHaveBeenCalled();
  });
  it('does not send after the deadline', async () => {
    const { deps, handler, request } = fixture();
    deps.claim.mockResolvedValue([{ ...reminder, deadline: new Date(Date.now() - 1).toISOString() }]);
    await handler(request);
    expect(deps.send).not.toHaveBeenCalled();
  });
});
