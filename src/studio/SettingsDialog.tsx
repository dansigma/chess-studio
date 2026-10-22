"use client";

import type { ReactNode } from "react";
import { useStudioStore } from "@/src/store/studio-store";
import { BOARD_THEME_IDS, BOARD_THEMES, type BoardTheme } from "@/src/chess/board-themes";
import { PIECE_SET_IDS, PIECE_SETS } from "@/src/chess/piece-sets";
import { MOVE_NOTATION_IDS, MOVE_NOTATIONS } from "@/src/chess/move-notation";
import { SITE_LOCALES, SITE_LOCALE_LABELS } from "@/src/i18n/locale";
import { NOTATION_DENSITY_IDS, NOTATION_DENSITIES } from "./notation-density";
import { ENGINE_BUILDS, ENGINE_BUILD_INFO } from "@/src/engine/stockfish-client";
import { COLOR_SCHEME_IDS, COLOR_SCHEMES } from "./color-scheme";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { clearReviewCache } from "./review/review-cache";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-body text-studio-fg">{label}</span>
      {children}
    </div>
  );
}

function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="h-7 min-w-40 rounded-md border border-studio-border-strong bg-studio-panel px-2 text-dense text-studio-fg"
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full ${checked ? "bg-studio-accent" : "bg-studio-hover-strong"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white ${checked ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-studio-border pt-2 first:border-t-0 first:pt-0">
      <h3 className="pb-1 text-caption uppercase tracking-wider text-studio-faint">{title}</h3>
      {children}
    </section>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const settings = useStudioStore((state) => state.settings);
  const setColorScheme = useStudioStore((state) => state.setColorScheme);
  const setBoardTheme = useStudioStore((state) => state.setBoardTheme);
  const setPieceSet = useStudioStore((state) => state.setPieceSet);
  const setMoveNotation = useStudioStore((state) => state.setMoveNotation);
  const setNotationDensity = useStudioStore((state) => state.setNotationDensity);
  const setLocale = useStudioStore((state) => state.setLocale);
  const toggleCoordinates = useStudioStore((state) => state.toggleCoordinates);
  const toggleEvalBar = useStudioStore((state) => state.toggleEvalBar);
  const toggleMoveSound = useStudioStore((state) => state.toggleMoveSound);
  const toggleGamePreview = useStudioStore((state) => state.toggleGamePreview);
  const setEngineBuild = useStudioStore((state) => state.setEngineBuild);

  return (
    <Dialog
      title={tStudioChrome(locale, "chrome.settings.title")}
      onClose={onClose}
      width="w-[30rem]"
      footer={
        <Button variant="primary" onClick={onClose}>
          {tStudioChrome(locale, "chrome.settings.done")}
        </Button>
      }
    >
      <div className="grid gap-3">
        <Section title={tStudioChrome(locale, "chrome.settings.appearance")}>
          <Row label={tStudioChrome(locale, "chrome.settings.colorScheme")}>
            <Select
              value={settings.colorScheme}
              options={COLOR_SCHEME_IDS.map((id) => ({ id, label: COLOR_SCHEMES[id].label }))}
              onChange={setColorScheme}
            />
          </Row>
          <Row label={tStudioChrome(locale, "chrome.settings.boardTheme")}>
            <Select<BoardTheme>
              value={settings.boardTheme}
              options={BOARD_THEME_IDS.map((id) => ({ id, label: BOARD_THEMES[id].label }))}
              onChange={setBoardTheme}
            />
          </Row>
          <Row label={tStudioChrome(locale, "chrome.settings.pieceSet")}>
            <Select
              value={settings.pieceSet}
              options={PIECE_SET_IDS.map((id) => ({ id, label: PIECE_SETS[id].label }))}
              onChange={setPieceSet}
            />
          </Row>
        </Section>
        <Section title={tStudioChrome(locale, "chrome.settings.board")}>
          <Row label={tStudioChrome(locale, "chrome.settings.showCoordinates")}>
            <Toggle label={tStudioChrome(locale, "chrome.settings.showCoordinates")} checked={settings.showCoordinates} onChange={toggleCoordinates} />
          </Row>
          <Row label={tStudioChrome(locale, "chrome.settings.showEvalBar")}>
            <Toggle label={tStudioChrome(locale, "chrome.settings.showEvalBar")} checked={settings.showEvalBar} onChange={toggleEvalBar} />
          </Row>
          <Row label={tStudioChrome(locale, "chrome.settings.moveSound")}>
            <Toggle label={tStudioChrome(locale, "chrome.settings.moveSound")} checked={settings.moveSound} onChange={toggleMoveSound} />
          </Row>
          <Row label={tStudioChrome(locale, "chrome.settings.gamePreview")}>
            <Toggle
              label={tStudioChrome(locale, "chrome.settings.gamePreview")}
              checked={settings.gamePreviewEnabled}
              onChange={toggleGamePreview}
            />
          </Row>
        </Section>
        <Section title={tStudioChrome(locale, "chrome.settings.engine")}>
          <Row label="Stockfish">
            <Select
              value={settings.engineBuild}
              options={ENGINE_BUILDS.map((id) => ({ id, label: ENGINE_BUILD_INFO[id].label }))}
              onChange={setEngineBuild}
            />
          </Row>
        </Section>
        <Section title={tStudioChrome(locale, "chrome.settings.notation")}>
          <Row label={tStudioChrome(locale, "chrome.settings.moveNotation")}>
            <Select
              value={settings.moveNotation}
              options={MOVE_NOTATION_IDS.map((id) => ({ id, label: MOVE_NOTATIONS[id].label }))}
              onChange={setMoveNotation}
            />
          </Row>
          <Row label={tStudioChrome(locale, "chrome.settings.notationDensity")}>
            <Select
              value={settings.notationDensity}
              options={NOTATION_DENSITY_IDS.map((id) => ({ id, label: NOTATION_DENSITIES[id].label }))}
              onChange={setNotationDensity}
            />
          </Row>
        </Section>
        <Section title={tStudioChrome(locale, "chrome.settings.gameReview")}>
          <Row label={tStudioChrome(locale, "chrome.settings.savedReviews")}>
            <Button variant="secondary" size="sm" onClick={() => clearReviewCache()}>
              {tStudioChrome(locale, "chrome.settings.clearReviews")}
            </Button>
          </Row>
        </Section>
        <Section title={tStudioChrome(locale, "chrome.settings.language")}>
          <Row label={tStudioChrome(locale, "chrome.settings.siteLanguage")}>
            <Select
              value={settings.locale}
              options={SITE_LOCALES.map((id) => ({ id, label: SITE_LOCALE_LABELS[id] }))}
              onChange={setLocale}
            />
          </Row>
        </Section>
      </div>
    </Dialog>
  );
}
