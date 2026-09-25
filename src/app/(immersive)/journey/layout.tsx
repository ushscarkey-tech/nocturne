import { DataGate } from "@/components/shell/DataGate";
import { NoticeToast } from "@/components/shell/NoticeToast";
import { GlossarySheet } from "@/components/help/Glossary";

export const metadata = { title: "Journey" };

export default function JourneyLayout({ children }: LayoutProps<"/journey">) {
  return (
    <DataGate>
      {children}
      <NoticeToast placement="immersive" />
      <GlossarySheet />
    </DataGate>
  );
}
