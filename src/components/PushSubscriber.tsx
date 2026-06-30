"use client";

function scheduleJournalReminder(reg: ServiceWorkerRegistration) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(21, 0, 0, 0);
  if (now >= target) target.setDate(target.getDate() + 1);
  const delay = target.getTime() - now.getTime();

  setTimeout(() => {
    reg.showNotification("Perso", {
      body: "N'oublie pas ton journal du soir 📝",
      icon: "/icon-192.png",
      tag: "journal-reminder",
      data: { url: "/journal" },
    });
    scheduleJournalReminder(reg);
  }, delay);
}

export async function enableNotifications(): Promise<"granted" | "denied" | "unsupported"> {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return "unsupported";

  const reg = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  scheduleJournalReminder(reg);

  if ("PushManager" in window) {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (vapidKey) {
      try {
        const existing = await reg.pushManager.getSubscription();
        const sub = existing || (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        }));

        await fetch("/api/push-subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
      } catch {
        // Push subscription failed, local notifications still work
      }
    }
  }

  return "granted";
}

export function notificationStatus(): "granted" | "denied" | "default" | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}
