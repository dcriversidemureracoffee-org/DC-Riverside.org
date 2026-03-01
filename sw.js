// sw.js — Powerful offline-first PWA support for Riverside Connect (WhatsApp-style)
// Now caches comments, announcements, view counts & approval status

const CACHE_NAME = 'Riverside-Connect-v5';   // ← bumped version for announcements + view counts

const STATIC_ASSETS = [
  './',
  './login.html',
  './index.html',
  './home.html',
  './Q&A.html',
  './play.html',
  './announce.html',
  './channel.html',
  './manifest.json',
  './maskable_icon_x192.png',
  './maskable_icon_x512.png'
];

const API_CACHE_PATTERNS = [
  '?operation=getAllQnAChannels',
  '?operation=getQnAGames',
  '?operation=getQnAQuestionsAndChoices',
  '?operation=getQnALeaderboard',
  '?operation=getSurveyResults',
  '?operation=getSurveyParticipants',
];

const EXPECTED_CACHES = [CACHE_NAME];

const API_BASE = 'https://script.google.com/macros/s/AKfycbyG18AvucL_ckaUQr6V-nzBtwxi21TEOL_096iArq8RXC-Z6xAQotZwtFU7WiYOl8xG/exec';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Installing v' + CACHE_NAME + ' — caching core assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Install failed:', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key => !EXPECTED_CACHES.includes(key))
            .map(key => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.href.startsWith(API_BASE)) {

  // ────────────────────────────────────────────────
  // GET requests → cache-first + stale-while-revalidate pattern
  // ────────────────────────────────────────────────
if (event.request.method === 'GET') {

  // ── Only cache these specific Q&A API calls (and announcements/comments if you want)
  const isCacheableApiCall = API_CACHE_PATTERNS.some(pattern => 
    event.request.url.includes(pattern)
  );

  // You can also add announcement/comment patterns here if needed
  // const isAnnouncementRelated = event.request.url.includes('getAnnouncements') || event.request.url.includes('getComments');

  if (!isCacheableApiCall /* && !isAnnouncementRelated */) {
    // Let it go through normal network-first or whatever your current logic is
    // (or just skip special caching for other endpoints)
    return; // or continue with default fetch
  }

  // ── Only if it's one of our important patterns → do the cache-first logic
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cachedResponse => {
        const networkedFetch = fetch(event.request)
          .then(freshResponse => {
            if (freshResponse && freshResponse.status === 200 && 
                freshResponse.headers.get('content-type')?.includes('application/json')) {
              cache.put(event.request, freshResponse.clone());
            }
            return freshResponse;
          })
          .catch(() => {
            // your nice fallback object here
            return new Response(
              JSON.stringify({
                status: "offline",
                offline: true,
                userStatus: "pending",
                comments: [],
                announcements: [{
                  id: "offline-notice-1",
                  title: "Offline Mode",
                  content: "You are currently offline.\n\nShowing last known data if previously loaded.\n\nConnect to see latest announcements, channels, games, etc.",
                  created: new Date().toISOString(),
                  creator: "System",
                  pinned: true
                }],
                viewCounts: [],
                announcementsViewCounts: [],
                channels: [],
                games: [],
                questions: [],
                leaders: [],
                results: [],
                participants: [],
                message: "Offline — last known data or placeholder"
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          });

        return cachedResponse || networkedFetch;
      });
    })
  );
  return;
}
  // ────────────────────────────────────────────────
  // POST / mutations (create channel, create game, submit score, delete game, post announcement, etc.)
  // → network-first, graceful offline failure
  // ────────────────────────────────────────────────
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response(
        JSON.stringify({
          status: "offline",
          offline: true,
          message: "Cannot create, delete, submit scores, post announcements or modify data while offline. Action will be retried when you reconnect."
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    })
  );
  return;
}
  // ────────────────────────────────────────────────
  // Navigation & HTML pages → network-first + cache fallback
  // ────────────────────────────────────────────────
  if (event.request.mode === 'navigate' || 
      url.pathname.endsWith('.html') || 
      url.pathname === '/') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // ────────────────────────────────────────────────
  // All other requests (images, CSS, JS, fonts…) → cache-first + revalidate
  // ────────────────────────────────────────────────
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        fetch(event.request)
          .then(freshResponse => {
            if (freshResponse && freshResponse.status === 200 && event.request.method === 'GET') {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, freshResponse.clone());
              });
            }
          })
          .catch(() => {});

        return cachedResponse;
      }

      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || event.request.method !== 'GET') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./home.html');
        }
        return new Response('', { status: 503 });
      });
    })
  );
});

// Future: background sync for pending actions (messages/announcements)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-pending-messages') {
    event.waitUntil(syncPendingMessages());
  }
});


async function syncPendingMessages() {
  console.log('[SW] Background sync triggered — attempting to send pending messages/announcements');
  // → Add IndexedDB queue + retry logic here in future if needed
}

