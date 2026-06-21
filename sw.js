const CACHE_NAME = 'dayline-pwa-v13';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('dayline-pwa-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match(request);
  }
}

function updateCachedRequest(request) {
  return fetch(request)
    .then(async (response) => {
      if (response && response.status === 200) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);
}

async function cacheFirst(request, event) {
  const cached = await caches.match(request);
  const update = updateCachedRequest(request);
  event.waitUntil(update);
  return cached || update || new Response('', { status: 504, statusText: 'Offline' });
}

async function appShellFirst(request, event) {
  const cached = (await caches.match('./index.html')) || (await caches.match('./'));
  const update = fetch(request)
    .then(async (response) => {
      if (response && response.status === 200) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put('./index.html', response.clone());
        await cache.put('./', response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  event.waitUntil(update);

  if (cached) {
    return cached;
  }

  return update || new Response('Dayline 暂时离线，请稍后重试。', {
    status: 503,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/update.html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(appShellFirst(request, event));
    return;
  }

  event.respondWith(cacheFirst(request, event));
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Dayline',
    body: '你有一个新的提醒。',
    url: './'
  };

  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    payload.body = event.data ? event.data.text() : payload.body;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Dayline', {
      body: payload.body || '你有一个新的提醒。',
      badge: './icon-192.png',
      icon: './icon-192.png',
      tag: payload.tag || `dayline-${Date.now()}`,
      data: {
        url: payload.url || './'
      }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(targetUrl);
          }
          return undefined;
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
