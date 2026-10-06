self.addEventListener('push', function(event) {
  let title = 'FamiTree';
  let body = '';
  try {
    const data = event.data.json();
    if (data.title) title = data.title;
    if (data.body) body = data.body;
  } catch (e) {
    // fallback
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'famitree'
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(clientList) {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('/');
    })
  );
});
