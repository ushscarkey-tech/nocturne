import type { CarriageId } from "@/core/types";

/** The four carriages of the night train. Boarding itself happens at the ticket machine. */
export const CARRIAGES: { id: CarriageId; name?: string; detail?: string; nameKey: string; detailKey: string }[] = [
  { id: "quiet", name: "Quiet Car", detail: "Very subtle cabin ambience", nameKey: "journey.quietCar", detailKey: "journey.quietCarDetail" },
  { id: "rain", name: "Rain Car", detail: "Rain against the windows, rail ambience", nameKey: "journey.rainCar", detailKey: "journey.rainCarDetail" },
  { id: "tunnel", name: "Tunnel Car", detail: "Low mechanical hum and brown noise", nameKey: "journey.tunnelCar", detailKey: "journey.tunnelCarDetail" },
  { id: "moon", name: "Moon Car", detail: "Soft, distant night ambience", nameKey: "journey.moonCar", detailKey: "journey.moonCarDetail" },
];
