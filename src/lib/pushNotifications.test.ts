import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disablePush, enablePush, getPushEnabled } from './pushNotifications';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ requireSupabase: () => ({ rpc }) }));
const unsubscribe = vi.fn(), subscribe = vi.fn(), getSubscription = vi.fn(), register = vi.fn(), requestPermission = vi.fn();
const subscription = { endpoint: 'https://fcm.googleapis.com/device', toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/device', keys: { p256dh: 'public', auth: 'auth' } }), unsubscribe };
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: true, error: null });
  unsubscribe.mockResolvedValue(true);
  getSubscription.mockResolvedValue(subscription);
  subscribe.mockResolvedValue(subscription);
  requestPermission.mockResolvedValue('granted');
  vi.stubEnv('VITE_PUSH_VAPID_PUBLIC_KEY', 'AAAA');
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission });
  vi.stubGlobal('navigator', { serviceWorker: { register, ready: Promise.resolve({ pushManager: { getSubscription, subscribe } }) } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('browser push preferences', () => {
  it('checks ownership on the server instead of treating browser permission as opt in', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await getPushEnabled()).toBe(false);
    expect(rpc).toHaveBeenCalledWith('get_my_push_subscription', { push_endpoint: subscription.endpoint });
  });
  it('does not register an opted-in subscription when permission is denied', async () => {
    requestPermission.mockResolvedValue('denied');
    await expect(enablePush()).rejects.toThrow('Povolte notifikace');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('cleans up a new browser subscription if storing it fails', async () => {
    getSubscription.mockResolvedValue(null);
    rpc.mockResolvedValue({ data: null, error: new Error('Offline') });
    await expect(enablePush()).rejects.toThrow('Offline');
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('removes the server subscription before unsubscribing in the browser', async () => {
    await disablePush();
    expect(rpc).toHaveBeenCalledWith('delete_my_push_subscription', { push_endpoint: subscription.endpoint });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('keeps the subscription available for retry when server opt out fails', async () => {
    rpc.mockResolvedValue({ error: new Error('Offline') });
    await expect(disablePush()).rejects.toThrow('Offline');
    expect(unsubscribe).not.toHaveBeenCalled();
  });
});
