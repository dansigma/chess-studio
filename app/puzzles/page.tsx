import type { Metadata } from "next";
import { PuzzleDashboard } from "@/src/puzzles/Dashboard";
import { SITE_NAME } from "@/src/site/sections";

export const metadata: Metadata = {
  title: `Puzzles · ${SITE_NAME}`,
  description: "Rated tactics, a daily puzzle, streaks, and a 3-minute rush.",
};

export default function PuzzlesPage() {
  return <PuzzleDashboard />;
}
