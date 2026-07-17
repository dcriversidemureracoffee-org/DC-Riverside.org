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
 const callId = payload.data?.callId || "";

  // ── SMART URL LOGIC ─────────────────────────────────────────────────────
  let url = "https://dcriversidemureracoffee-org.github.io/DC-Riverside.org/home.html";
 if (callId) {
  url = `https://dcriversidemureracoffee-org.github.io/DC-Riverside.org/call.html?callId=${encodeURIComponent(callId)}`;
}
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

  const isCall = !!callId;

self.registration.showNotification(title, {
  body: body,
  icon: icon,
  badge: badge,
  image: payload.data?.image || "",
  vibrate: isCall ? [500, 200, 500, 200, 500] : [200, 100, 200],
  requireInteraction: isCall, // keeps call notification on screen until tapped
  tag: isCall ? `call-${callId}` : undefined, // prevents duplicate call notifications
  data: {
    url: url,
    channelId: channelId,
    postId: postId,
    gameId: gameId,
    announcement: announcement,
    callId: callId
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
            (event.notification.data?.callId && client.url.includes("call.html")) ||
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

const CACHE_NAME = 'Riverside-Connect-v8'; // bumped — play.html restored + offline fixes

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
  // Caching is now done file-by-file below (not cache.addAll()), so even
  // if one of these ever 404s, it only skips itself — it can't wipe out
  // caching for the rest of the app the way addAll() did before.
];

// These are the operations your pages actually call and that benefit from
// "show last-known data while offline" behavior.
const API_CACHE_PATTERNS = [
  '?operation=getUserStatus',
  '?operation=getAllChannels',
  '?operation=getAllQnAChannels',
  '?operation=getUnseenAnnCount',
  '?operation=getChannelPosts',
  '?operation=getQnAGames',
  '?operation=getQnAQuestionsAndChoices',
  '?operation=getQnALeaderboard',
  '?operation=getSurveyResults',
  '?operation=getSurveyParticipants',
];

const EXPECTED_CACHES = [CACHE_NAME];

const API_BASE = 'https://script.google.com/macros/s/AKfycbwWv2rfL2mpy-62lwwPDBFVvTklnu43tVQ-IHMz-FW_h58slnPLSRWQ8HhS2UJoVIym/exec';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // IMPORTANT: cache each file independently instead of cache.addAll().
        // addAll() is atomic — one missing/blocked file fails the WHOLE
        // install and leaves the cache empty. Caching one-by-one means a
        // single bad URL only skips itself, everything else still gets cached.
        return Promise.all(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err => {
              console.warn('[SW] Skipped (missing or blocked):', url, err.message);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] Install complete for', CACHE_NAME);
        return self.skipWaiting();
      })
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

      const isCacheableApiCall = API_CACHE_PATTERNS.some(pattern =>
        event.request.url.includes(pattern)
      );

      if (!isCacheableApiCall) {
        // Not one of ours to special-case — let the browser do a normal
        // network fetch (page-level try/catch already handles failures).
        return;
      }

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
                // No network AND nothing cached yet for this exact call —
                // return a graceful offline placeholder instead of an error.
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
                    posts: [],
                    unseenCount: 0,
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
    // POST / mutations → network-first, graceful offline failure
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
  // Navigation & HTML pages → network-first, cache fallback,
  // and a hard fallback to index.html so a bad/missing exact-URL
  // cache match never leaves respondWith() with nothing to return.
  // ────────────────────────────────────────────────
  if (event.request.mode === 'navigate' ||
      url.pathname.endsWith('.html') ||
      url.pathname === '/') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then(cached => cached || caches.match('./index.html'))
      )
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
          return caches.match('./index.html');
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
