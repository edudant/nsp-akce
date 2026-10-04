import { requireSupabase } from './supabase';
export type SubscriptionKind = 'all' | 'rehearsal' | 'performance';
export interface SubscriptionMetadata { id: string; kind: SubscriptionKind; createdAt: string; revokedAt: string | null; linked: boolean }
export const calendarSubscriptions = {
  async list(): Promise<SubscriptionMetadata[]> {
    const { data, error } = await requireSupabase().rpc('get_calendar_subscriptions');
    if (error) throw error;
    return data;
  },
  async create(kind: SubscriptionKind): Promise<string> {
    const url = new URL('/functions/v1/calendar-feed', import.meta.env.VITE_SUPABASE_URL);
    if (url.protocol !== 'https:') throw new Error('Odběr vyžaduje HTTPS adresu Supabase.');
    const { data, error } = await requireSupabase().rpc('create_calendar_subscription', { subscription_kind: kind });
    if (error) throw error;
    url.searchParams.set('token', data.token);
    return url.href;
  },
  async revoke(kind: SubscriptionKind): Promise<void> {
    const { error } = await requireSupabase().rpc('revoke_calendar_subscription', { subscription_kind: kind });
    if (error) throw error;
  },
};
