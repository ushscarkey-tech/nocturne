import { DataGate } from "@/components/shell/DataGate";

export const metadata = { title: "Welcome" };

export default function WelcomeLayout({ children }: LayoutProps<"/welcome">) {
  return <DataGate onboarding>{children}</DataGate>;
}
