/* Foreshock service worker: lets the laptop install Foreshock as an app and show alerts as system notifications.
   It doesn't cache anything: the dashboard always needs the live server. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then(ws => ws.length ? ws[0].focus() : self.clients.openWindow("/")));
});
