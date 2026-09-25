import { DataGate } from "@/components/shell/DataGate";
import { NoticeToast } from "@/components/shell/NoticeToast";
import { SyncStatus } from "@/components/shell/SyncStatus";
import { TabBar } from "@/components/shell/TabBar";

export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <DataGate>
      <TabBar />
      <div className="md:pl-56">
        <main className="mx-auto min-h-dvh w-full max-w-2xl px-6 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] md:px-10 md:pb-16 md:pt-14">
          {children}
        </main>
      </div>
      <SyncStatus />
      <NoticeToast />
    </DataGate>
  );
}
