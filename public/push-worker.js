/* No cache or offline interception: this worker only handles notifications. */
self.addEventListener('push', (event) => {
  let payload;
  try { payload = event.data?.json(); } catch { payload = {}; }
  const url = new URL(payload?.url ?? './', self.registration.scope);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.waitUntil(self.registration.showNotification(payload?.title ?? 'NSP Akce', {
    body: payload?.body ?? 'Blíží se termín pro vyjádření k účasti.',
    icon: new URL('favicon.jpg', self.registration.scope).href,
    tag: payload?.tag ?? 'attendance-reminder',
    data: { url: url.href },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? './', self.registration.scope);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const client = clients.find((item) => item.url.startsWith(self.registration.scope));
    if (client) { await client.navigate(url.href); await client.focus(); }
    else await self.clients.openWindow(url.href);
  }));
});
