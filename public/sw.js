self.addEventListener("push", (event) => {
  const fallback = {
    title: "Nueva venta en Pilchería Gloria",
    body: "Hay un pedido nuevo para revisar.",
    url: "/dashboard/orders",
    tag: "nueva-venta",
  };

  let data = fallback;
  try {
    data = { ...fallback, ...(event.data ? event.data.json() : {}) };
  } catch {}

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icon",
        badge: "/icon",
        tag: data.tag,
        renotify: true,
        data: { url: data.url },
      }),
      "setAppBadge" in self.navigator ? self.navigator.setAppBadge() : Promise.resolve(),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/dashboard/orders", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
