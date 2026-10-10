import { requireSupabase } from './supabase';

export function pushSupported() {
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
async function worker() {
  const base = import.meta.env.BASE_URL;
  await navigator.serviceWorker.register(`${base}push-worker.js`, { scope: base });
  return navigator.serviceWorker.ready;
}
export async function getPushEnabled() {
  if (!pushSupported()) return false;
  const subscription = await (await worker()).pushManager.getSubscription();
  if (!subscription) return false;
  const { data, error } = await requireSupabase().rpc('get_my_push_subscription', { push_endpoint: subscription.endpoint });
  if (error) throw error;
  return data === true && Notification.permission === 'granted';
}
export async function enablePush() {
  if (!pushSupported()) throw new Error('Tento prohlížeč push notifikace nepodporuje. Na iPhonu otevřete aplikaci přidanou na plochu.');
  const key = import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY;
  if (!key) throw new Error('Push notifikace zatím nejsou nakonfigurované.');
  if (await Notification.requestPermission() !== 'granted') throw new Error('Povolte notifikace v nastavení prohlížeče.');
  const registration = await worker();
  const bytes = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  const { error } = await requireSupabase().rpc('save_my_push_subscription', { subscription: subscription.toJSON() });
  if (error) {
    if (!existing) await subscription.unsubscribe();
    throw error;
  }
}
export async function disablePush() {
  if (!pushSupported()) return;
  const subscription = await (await worker()).pushManager.getSubscription();
  if (!subscription) return;
  const { error } = await requireSupabase().rpc('delete_my_push_subscription', { push_endpoint: subscription.endpoint });
  if (error) throw error;
  // Server removal is authoritative; an unsubscribe failure cannot leave reminders enabled.
  await subscription.unsubscribe();
}
