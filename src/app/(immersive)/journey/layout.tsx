import { DataGate } from "@/components/shell/DataGate";
import { NoticeToast } from "@/components/shell/NoticeToast";

export const metadata = { title: "Journey" };

export default function JourneyLayout({ children }: LayoutProps<"/journey">) {
  return (
    <DataGate>
      {children}
      <NoticeToast placement="immersive" />
    </DataGate>
  );
}
