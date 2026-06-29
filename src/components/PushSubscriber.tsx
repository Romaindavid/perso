"use client";

import { useEffect } from "react";

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

export default function PushSubscriber() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }

      if (Notification.permission === "granted") {
        scheduleJournalReminder(reg);
      }

      if (!("PushManager" in window)) return;
      const existing = await reg.pushManager.getSubscription();
      if (existing) return;

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) return;

      try {
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        });

        await fetch("/api/push-subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
      } catch {
        // User denied notifications
      }
    });
  }, []);

  return null;
}
