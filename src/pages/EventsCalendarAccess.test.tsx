import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { EventsPage } from './EventsPage';
import type { AppDatabase } from '../lib/domain';
const fixture = vi.hoisted(() => ({ data: null as AppDatabase | null }));
vi.mock('../components/DataContext', () => ({ databaseQueryKey: ['database'], useDatabase: () => ({ data: fixture.data }), useViewMode: () => ({ scope: 'user' }) }));
vi.mock('../components/CalendarSubscriptionDialog', () => ({ CalendarSubscriptionDialog: ({ onClose }: { onClose: () => void }) => <div role="dialog"><button onClick={onClose}>Zavřít odběr</button></div> }));
afterEach(cleanup);
it.each([
 ['member', 'member-id', true], ['admin', 'member-id', true], ['admin', undefined, false], ['shared', undefined, false], ['shared', 'member-id', false],
] as const)('calendar access for %s with member %s', (accessMode, myMemberId, visible) => {
 fixture.data = { members: [], events: [], preferences: [], updatedAt: '', accessMode, myMemberId };
 render(<QueryClientProvider client={new QueryClient()}><EventsPage canEdit={accessMode === 'admin'} /></QueryClientProvider>);
 const button = screen.queryByRole('button', { name: 'Přidat do kalendáře' });
 expect(Boolean(button)).toBe(visible);
 if (button) {
  expect(button.querySelector('svg')).not.toBeNull();
  expect(button).toHaveAttribute('title', 'Přidat do kalendáře');
  fireEvent.click(button); expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Zavřít odběr')); expect(screen.queryByRole('dialog')).toBeNull();
 }
});
