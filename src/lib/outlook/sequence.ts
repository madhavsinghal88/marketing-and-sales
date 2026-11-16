import { SEQUENCE_DAYS, type Participant, type SequenceDay } from "@/lib/types";

/** Next day that is Pending or Failed (for Send now / retry). */
export function nextSendableDay(
  participant: Participant,
): SequenceDay | null {
  for (const day of SEQUENCE_DAYS) {
    const touch = participant.touches.find((t) => t.day === day.key);
    if (!touch || touch.status === "Pending" || touch.status === "Failed") {
      return day.key;
    }
  }
  return null;
}

export function formatTouchTime(date = new Date()): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
