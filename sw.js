// sw.js — Riverside Connect: Firebase push + offline-first caching
// Bump the version numbers below on every deploy so people get the new files.

const CACHE_NAME = "Riverside-Connect-v9";
const RUNTIME = "Riverside-Connect-runtime-v9"; // fonts, avatars, other sites
const SITE = "https://dcriversidemureracoffee-org.github.io/DC-Riverside.org/";
const HOME = SITE + "home.html";

/* ═════════ FIREBASE PUSH (your original logic) ═════════ */
try {
  importScripts(
    "https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js",
  );
} catch (err) {
  // if this fails the worker still installs and the app still works offline
  console.warn("[SW] Firebase scripts unavailable:", err && err.message);
}

if (self.firebase) {
  firebase.initializeApp({
    apiKey: "AIzaSyDBKHrHJ8Kz7W-4ztMCOeMf8Oakv-WZcws",
    authDomain: "dc-riverside-murera-coffee.firebaseapp.com",
    projectId: "dc-riverside-murera-coffee",
    storageBucket: "dc-riverside-murera-coffee.firebasestorage.app",
    messagingSenderId: "373863707096",
    appId: "1:373863707096:web:5e3c703655687b96e442ad",
  });

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const d = payload.data || {};
    const title = d.title || "Riverside Connect";
    const body = d.body || "New activity";
    const channelId = d.channelId || "";
    const postId = d.postId || "";
    const gameId = d.gameId || "";
    const announcement = d.announcement || "";
    const callId = d.callId || "";

    let url = HOME;
    if (callId) url = `${SITE}call.html?callId=${encodeURIComponent(callId)}`;
    if (gameId) url = `${SITE}Q&A.html?gameId=${encodeURIComponent(gameId)}`;
    else if (channelId) {
      url = `${SITE}channel.html?channelId=${encodeURIComponent(channelId)}`;
      if (postId) url += `&postId=${encodeURIComponent(postId)}`;
    } else if (announcement) url = SITE + "announce.html";

    const isCall = !!callId;
    self.registration.showNotification(title, {
      body,
      icon: d.icon || "./maskable_icon_x192.png",
      badge: "./badge.png",
      image: d.image || "",
      vibrate: isCall ? [500, 200, 500, 200, 500] : [200, 100, 200],
      requireInteraction: isCall, // call stays on screen until tapped
      tag: isCall ? `call-${callId}` : undefined,
      data: { url, channelId, postId, gameId, announcement, callId },
    });
  });
}

// Tap a notification: focus the app if that page is open, otherwise take an
// open tab (or a new one) straight to the right page.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen =
    (event.notification.data && event.notification.data.url) || HOME;
  event.waitUntil(
    (async () => {
      const list = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const same = list.find((c) => c.url === urlToOpen);
      if (same) return same.focus();
      const any = list[0];
      if (any && "navigate" in any) {
        try {
          const c = await any.navigate(urlToOpen);
          return (c || any).focus();
        } catch {}
      }
      return clients.openWindow(urlToOpen);
    })(),
  );
});

/* ═════════ OFFLINE CACHING ═════════ */
const STATIC_ASSETS = [
  "./",
  "./login.html",
  "./index.html",
  "./home.html",
  "./user.html",
  "./profile.html",
  "./geo.html",
  "./Q&A.html",
  "./play.html",
  "./split.html",
  "./announce.html",
  "./channel.html",
  "./call.html",
  "./manifest.json",
  "./maskable_icon_x192.png",
  "./maskable_icon_x512.png",
  "./badge.png",
  "./RM.png",
  "./announce.png",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/webfonts/fa-solid-900.woff2",
];

// Your Apps Script backends (index, geo and the others use different deployments),
// so we match by host instead of one fixed URL.
const API_HOSTS = ["script.google.com", "script.googleusercontent.com"];

// GET operations worth keeping a last-known copy of
const API_OPS = [
  "getUserStatus",
  "getAllChannels",
  "getAllQnAChannels",
  "getUnseenAnnCount",
  "getChannelPosts",
  "getQnAGames",
  "getQnAQuestionsAndChoices",
  "getQnALeaderboard",
  "getSurveyResults",
  "getSurveyParticipants",
  "getEvents",
];

// For these, an offline failure with nothing saved must look like a real network
// error, so index.html / geo.html fall back to their own saved copy instead of
// being told "no channels" or "pending approval".
const SOFT_OPS = [
  "getUserStatus",
  "getAllChannels",
  "getAllQnAChannels",
  "getUnseenAnnCount",
  "getEvents",
];

const OFFLINE_PLACEHOLDER = {
  status: "offline",
  offline: true,
  comments: [],
  announcements: [
    {
      id: "offline-notice-1",
      title: "Offline Mode",
      content:
        "You are currently offline.\n\nShowing last known data if previously loaded.\n\nConnect to see latest announcements, channels, games, etc.",
      created: new Date().toISOString(),
      creator: "System",
      pinned: true,
    },
  ],
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
  message: "Offline — last known data or placeholder",
};

const withTimeout = (p, ms) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // file by file, straight from the network: one missing file never blocks the rest
      await Promise.allSettled(
        STATIC_ASSETS.map(async (u) => {
          const r = await fetch(new Request(u, { cache: "reload" }));
          if (r.ok) await cache.put(u, r);
          else console.warn("[SW] Skipped:", u, r.status);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys())
        if (k !== CACHE_NAME && k !== RUNTIME) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

/* data calls: try the network for a few seconds, then use the last saved answer */
async function apiGet(req, op) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const r = await withTimeout(fetch(req), 3500);
    const json = (r.headers.get("content-type") || "").includes(
      "application/json",
    );
    if (r.ok && json) {
      cache.put(req, r.clone());
      return r;
    }
    if (r.ok) return r;
    throw new Error("bad status");
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    if (SOFT_OPS.includes(op)) return Response.error();
    return new Response(JSON.stringify(OFFLINE_PLACEHOLDER), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/* pages: network for up to 4 s (and save it), otherwise the saved copy */
async function navigate(event) {
  const req = event.request;
  const cache = await caches.open(CACHE_NAME);
  const net = fetch(req);
  try {
    const r = await withTimeout(net, 4000);
    if (r && r.ok) cache.put(req, r.clone());
    return r;
  } catch {
    // slow connection: let the request finish and refresh the saved copy for next time
    event.waitUntil(
      net.then((r) => r && r.ok && cache.put(req, r.clone())).catch(() => {}),
    );
    return (
      (await cache.match(req)) ||
      (await cache.match(req, { ignoreSearch: true })) ||
      (await cache.match("./index.html")) ||
      (await cache.match("./")) ||
      new Response(
        "<!doctype html><meta name=viewport content='width=device-width'><body style='font-family:sans-serif;background:#0a0f1e;color:#e2e8f0;padding:2rem'><h2>You're offline</h2><p>Open Riverside Connect once while online so it can be saved for offline use.</p>",
        { headers: { "Content-Type": "text/html" } },
      )
    );
  }
}

/* images, scripts, fonts: show the saved copy now, refresh it quietly */
async function assets(event) {
  const req = event.request;
  const same = new URL(req.url).origin === location.origin;
  const hit =
    (await caches.match(req)) ||
    (same ? await caches.match(req, { ignoreSearch: true }) : undefined);
  const net = fetch(req)
    .then(async (r) => {
      if (r && (r.status === 200 || r.type === "opaque")) {
        const cache = await caches.open(same ? CACHE_NAME : RUNTIME);
        cache.put(req, r.clone());
        if (!same) trim(cache, 150);
      }
      return r;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(net);
    return hit;
  }
  return (await net) || new Response("", { status: 503 });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (API_HOSTS.includes(url.hostname)) {
    if (req.method === "GET") {
      const op = url.searchParams.get("operation") || "";
      if (API_OPS.includes(op)) event.respondWith(apiGet(req, op));
      return; // other GETs go straight to the network
    }
    if (req.method === "POST") {
      event.respondWith(
        fetch(req).catch(
          () =>
            new Response(
              JSON.stringify({
                success: false,
                status: "offline",
                offline: true,
                error: "You are offline",
                message:
                  "Cannot create, delete, submit or change data while offline.",
              }),
              { status: 503, headers: { "Content-Type": "application/json" } },
            ),
        ),
      );
    }
    return;
  }

  if (req.method !== "GET") return;
  if (req.mode === "navigate") return event.respondWith(navigate(event));
  event.respondWith(assets(event));
});

// Future: background sync for pending actions
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-pending-messages") event.waitUntil(Promise.resolve());
});
