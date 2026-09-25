import { DataGate } from "@/components/shell/DataGate";
import { MainFrame } from "@/components/shell/MainFrame";
import { NoticeToast } from "@/components/shell/NoticeToast";
import { SyncStatus } from "@/components/shell/SyncStatus";
import { TabBar } from "@/components/shell/TabBar";
import { QuickAddButton, QuickAddSheet } from "@/components/quickadd/QuickAdd";
import { GlossarySheet } from "@/components/help/Glossary";
import { FeelSheet } from "@/components/quickadd/FeelSheet";

export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <DataGate>
      <TabBar />
      <MainFrame>{children}</MainFrame>
      <QuickAddButton />
      <QuickAddSheet />
      <SyncStatus />
      <NoticeToast />
      <GlossarySheet />
      <FeelSheet />
    </DataGate>
  );
}
