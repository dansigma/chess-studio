import { Suspense } from "react";
import type { Metadata } from "next";
import { PuzzleTrainer } from "@/src/puzzles/Trainer";

export const metadata: Metadata = {
  title: "Puzzles · Xadrez Digital",
};

export default function PuzzlePlayPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-studio-bg" />}>
      <PuzzleTrainer />
    </Suspense>
  );
}
