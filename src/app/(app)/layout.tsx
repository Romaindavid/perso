import BottomNav from "@/components/BottomNav";
import PushSubscriber from "@/components/PushSubscriber";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-24">
      <PushSubscriber />
      <main className="max-w-lg mx-auto px-5 py-6">{children}</main>
      <BottomNav />
    </div>
  );
}
