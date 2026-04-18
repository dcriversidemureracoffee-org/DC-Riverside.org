// firebase-messaging-sw.js
importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js");

firebase.initializeApp({
apiKey: "AIzaSyDBKHrHJ8Kz7W-4ztMCOeMf8Oakv-WZcws",
    authDomain: "dc-riverside-murera-coffee.firebaseapp.com",
    projectId: "dc-riverside-murera-coffee",
    storageBucket: "dc-riverside-murera-coffee.firebasestorage.app",
    messagingSenderId: "373863707096",
    appId: "1:373863707096:web:5e3c703655687b96e442ad"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log("Background message received:", payload);

  const title = payload.data?.title || "Riverside Connect";
  const body  = payload.data?.body  || "New activity";

  const channelId = payload.data?.channelId || "";
  const postId    = payload.data?.postId    || "";
  const gameId    = payload.data?.gameId    || "";
  const announcement = payload.data?.announcement || "";   // ← NEW for announcements

  // ── SMART URL LOGIC ─────────────────────────────────────────────────────
  let url = "https://dcriversidemureracoffee-org.github.io/DC-Riverside.org/home.html";

  if (gameId) {
    // Q&A Game
    url = `https://dcriversidemureracoffee-org.github.io/DC-Riverside.org/Q&A.html?gameId=${encodeURIComponent(gameId)}`;
  } 
  else if (channelId) {
    // Channel Post
    url = `https://dcriversidemureracoffee-org.github.io/DC-Riverside.org/channel.html?channelId=${encodeURIComponent(channelId)}`;
    if (postId) {
      url += `&postId=${encodeURIComponent(postId)}`;
    }
  }
  else if (announcement) {
    // Announcement → opens announce.html (just like comments open home.html)
    url = "https://dcriversidemureracoffee-org.github.io/DC-Riverside.org/announce.html";
  }
  // Default falls back to home.html (for normal comments)

  const icon = payload.data?.icon || "./maskable_icon_x192.png";
  const badge = "./badge.png";

  self.registration.showNotification(title, {
    body: body,
    icon: icon,
    badge: badge,
    image: payload.data?.image || "",
    data: { 
      url: url,
      channelId: channelId,
      postId: postId,
      gameId: gameId,
      announcement: announcement   // ← NEW
    }
  });
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || 
                    "https://dcriversidemureracoffee-org.github.io/DC-Riverside.org/home.html";

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      // Try to focus existing window/tab
      for (const client of clientList) {
        if (client.url === urlToOpen || 
            (event.notification.data?.gameId && client.url.includes("Q&A.html")) ||
            (event.notification.data?.channelId && client.url.includes("channel.html")) ||
            (event.notification.data?.announcement && client.url.includes("announce.html")) ||
            "focus" in client) {
          return client.focus();
        }
      }

      // Open new window/tab with correct URL
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
// sw.js — Powerful offline-first PWA support for Riverside Connect (WhatsApp-style)
// Now caches comments, announcements, view counts & approval status

const CACHE_NAME = 'Riverside-Connect-v6';   // ← bumped version for announcements + view counts

const STATIC_ASSETS = [
  './',
  './login.html',
  './index.html',
  './home.html',
   './user.html',
  './Q&A.html',
  './play.html',
  './split.html',
 './announce.html',
  './channel.html',
  './manifest.json',
  './maskable_icon_x192.png',
  './maskable_icon_x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/webfonts/fa-solid-900.woff2'
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

const API_BASE = 'https://script.google.com/macros/s/AKfycbz7Bav_E5Q5lfUMR5smrFz9EwMFiy_6QNx9gVqDBDcwyEOqrWMyfLQ23SgVw6IxeU-l/exec';

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

