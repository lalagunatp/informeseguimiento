// Service worker mínimo: solo existe para que el navegador ofrezca "instalar" la app.
// No cachea datos: cada carga de la página intenta red primero, y solo si no hay
// conexión regresa el último index.html guardado. Las llamadas al Apps Script (JSONP,
// vía <script src>) nunca pasan por aquí, así que jamás se sirven datos viejos.
const CACHE_NAME = "laguna-shell-v1";
const APP_SHELL = ["./", "./index.html"];

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(function () {
      return caches.match("./index.html");
    })
  );
});
