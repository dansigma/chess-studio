import { Suspense } from "react";
import type { Metadata } from "next";
import { PuzzleTrainer } from "@/src/puzzles/Trainer";
import { SITE_NAME } from "@/src/site/sections";

export const metadata: Metadata = {
  title: `Puzzles · ${SITE_NAME}`,
};

export default function PuzzlePlayPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-studio-bg" />}>
      <PuzzleTrainer />
    </Suspense>
  );
}
