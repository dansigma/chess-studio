import type { Metadata } from "next";
import { PuzzleDashboard } from "@/src/puzzles/Dashboard";

export const metadata: Metadata = {
  title: "Puzzles · Xadrez Digital",
  description: "Rated tactics, a daily puzzle, streaks, and a 3-minute rush.",
};

export default function PuzzlesPage() {
  return <PuzzleDashboard />;
}
