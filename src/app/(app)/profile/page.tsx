"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { enableNotifications, notificationStatus } from "@/components/PushSubscriber";

export default function ProfilePage() {
  const [notifStatus, setNotifStatus] = useState<"granted" | "denied" | "default" | "unsupported">("default");
  const router = useRouter();

  useEffect(() => {
    setNotifStatus(notificationStatus());
  }, []);

  async function handleEnableNotifications() {
    const result = await enableNotifications();
    setNotifStatus(result === "granted" ? "granted" : "denied");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Profil</h1>

      {notifStatus !== "granted" && notifStatus !== "unsupported" && (
        <button
          onClick={handleEnableNotifications}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-full font-medium text-base border border-primary text-primary"
        >
          🔔 Activer les notifications
        </button>
      )}
      {notifStatus === "granted" && (
        <>
          <p className="text-center text-xs text-on-surface-variant">🔔 Notifications activées</p>
          <button
            onClick={async () => {
              const reg = await navigator.serviceWorker.ready;
              reg.showNotification("Perso", {
                body: "Test de notification 🎉",
                icon: "/icon-192.png",
              });
            }}
            className="w-full py-2.5 rounded-full font-medium text-sm text-on-surface-variant bg-surface-container"
          >
            Tester la notification
          </button>
        </>
      )}

      <button
        onClick={async () => {
          const supabase = createClient();
          await supabase.auth.signOut();
          router.push("/login");
        }}
        className="w-full py-3 rounded-full font-medium text-base text-error border border-error/30"
      >
        Se déconnecter
      </button>
    </div>
  );
}
