"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useStudioStore, type SettingsDialogSection } from "@/src/store/studio-store";
import { BOARD_THEME_IDS, BOARD_THEMES, type BoardTheme } from "@/src/chess/board-themes";
import { PIECE_SET_IDS, PIECE_SETS } from "@/src/chess/piece-sets";
import { MOVE_NOTATION_IDS } from "@/src/chess/move-notation";
import { SITE_LOCALES, SITE_LOCALE_LABELS } from "@/src/i18n/locale";
import { NOTATION_DENSITY_IDS } from "./notation-density";
import { TEXT_SIZE_IDS } from "./text-size";
import { ENGINE_BUILDS, ENGINE_BUILD_INFO } from "@/src/engine/stockfish-client";
import { COLOR_SCHEME_IDS } from "./color-scheme";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { clearReviewCache } from "./review/review-cache";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { AccountSection } from "./AccountSection";
import { LinkedAccountsSection } from "./LinkedAccountsSection";

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-body text-studio-fg">
          {label}
        </label>
      ) : (
        <span className="text-body text-studio-fg">{label}</span>
      )}
      {children}
    </div>
  );
}

function Select<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id?: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <select
      id={id}
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

function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <Row label={label} htmlFor={id}>
      <Select id={id} value={value} options={options} onChange={onChange} />
    </Row>
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

export function SettingsDialog({
  onClose,
  initialSection,
}: {
  onClose: () => void;
  initialSection?: SettingsDialogSection;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const settings = useStudioStore((state) => state.settings);
  const setColorScheme = useStudioStore((state) => state.setColorScheme);
  const setBoardTheme = useStudioStore((state) => state.setBoardTheme);
  const setPieceSet = useStudioStore((state) => state.setPieceSet);
  const setMoveNotation = useStudioStore((state) => state.setMoveNotation);
  const setNotationDensity = useStudioStore((state) => state.setNotationDensity);
  const setTextSize = useStudioStore((state) => state.setTextSize);
  const toggleClockTimes = useStudioStore((state) => state.toggleClockTimes);
  const setLocale = useStudioStore((state) => state.setLocale);
  const toggleCoordinates = useStudioStore((state) => state.toggleCoordinates);
  const toggleMaterialBalance = useStudioStore((state) => state.toggleMaterialBalance);
  const toggleAutoQueen = useStudioStore((state) => state.toggleAutoQueen);
  const toggleEvalBar = useStudioStore((state) => state.toggleEvalBar);
  const toggleMoveSound = useStudioStore((state) => state.toggleMoveSound);
  const togglePuzzleSound = useStudioStore((state) => state.togglePuzzleSound);
  const toggleGamePreview = useStudioStore((state) => state.toggleGamePreview);
  const setEngineBuild = useStudioStore((state) => state.setEngineBuild);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const confirmClearRef = useRef<HTMLButtonElement>(null);
  const wasConfirmingRef = useRef(false);
  const linkedAccountsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (initialSection !== "linkedAccounts") {
      return;
    }
    const el = linkedAccountsRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "start" });
    }
  }, [initialSection]);

  useEffect(() => {
    if (confirmingClear) {
      confirmClearRef.current?.focus();
    } else if (wasConfirmingRef.current) {
      clearButtonRef.current?.focus();
    }
    wasConfirmingRef.current = confirmingClear;
  }, [confirmingClear]);

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
        <AccountSection />
        <Section title={tStudioChrome(locale, "chrome.settings.appearance")}>
          <SelectRow
            label={tStudioChrome(locale, "chrome.settings.colorScheme")}
            value={settings.colorScheme}
            options={COLOR_SCHEME_IDS.map((id) => ({
              id,
              label: tStudioChrome(locale, `chrome.settings.colorScheme.${id}`),
            }))}
            onChange={setColorScheme}
          />
          <SelectRow<BoardTheme>
            label={tStudioChrome(locale, "chrome.settings.boardTheme")}
            value={settings.boardTheme}
            options={BOARD_THEME_IDS.map((id) => ({ id, label: BOARD_THEMES[id].label }))}
            onChange={setBoardTheme}
          />
          <SelectRow
            label={tStudioChrome(locale, "chrome.settings.pieceSet")}
            value={settings.pieceSet}
            options={PIECE_SET_IDS.map((id) => ({ id, label: PIECE_SETS[id].label }))}
            onChange={setPieceSet}
          />
          <SelectRow
            label={tStudioChrome(locale, "chrome.settings.textSize")}
            value={settings.textSize}
            options={TEXT_SIZE_IDS.map((id) => ({
              id,
              label: tStudioChrome(locale, `chrome.settings.textSize.${id}`),
            }))}
            onChange={setTextSize}
          />
        </Section>
        <Section title={tStudioChrome(locale, "chrome.settings.board")}>
          <Row label={tStudioChrome(locale, "chrome.settings.showCoordinates")}>
            <Toggle label={tStudioChrome(locale, "chrome.settings.showCoordinates")} checked={settings.showCoordinates} onChange={toggleCoordinates} />
          </Row>
          <Row label={tStudioChrome(locale, "chrome.settings.showEvalBar")}>
            <Toggle label={tStudioChrome(locale, "chrome.settings.showEvalBar")} checked={settings.showEvalBar} onChange={toggleEvalBar} />
          </Row>
          <Row label={tStudioChrome(locale, "chrome.settings.showMaterialBalance")}>
            <Toggle
              label={tStudioChrome(locale, "chrome.settings.showMaterialBalance")}
              checked={settings.showMaterialBalance}
              onChange={toggleMaterialBalance}
            />
          </Row>
          <Row label={tStudioChrome(locale, "chrome.settings.autoQueen")}>
            <Toggle
              label={tStudioChrome(locale, "chrome.settings.autoQueen")}
              checked={settings.autoQueen}
              onChange={toggleAutoQueen}
            />
          </Row>
          <Row label={tStudioChrome(locale, "chrome.settings.moveSound")}>
            <Toggle label={tStudioChrome(locale, "chrome.settings.moveSound")} checked={settings.moveSound} onChange={toggleMoveSound} />
          </Row>
          <Row label={tStudioChrome(locale, "chrome.settings.puzzleSound")}>
            <Toggle label={tStudioChrome(locale, "chrome.settings.puzzleSound")} checked={settings.puzzleSound} onChange={togglePuzzleSound} />
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
          <SelectRow
            label="Stockfish"
            value={settings.engineBuild}
            options={ENGINE_BUILDS.map((id) => ({ id, label: ENGINE_BUILD_INFO[id].label }))}
            onChange={setEngineBuild}
          />
          <p className="pb-1 text-caption text-studio-faint">{tStudioChrome(locale, "chrome.settings.engineReviewNote")}</p>
        </Section>
        <Section title={tStudioChrome(locale, "chrome.settings.notation")}>
          <SelectRow
            label={tStudioChrome(locale, "chrome.settings.moveNotation")}
            value={settings.moveNotation}
            options={MOVE_NOTATION_IDS.map((id) => ({
              id,
              label: tStudioChrome(locale, `chrome.settings.moveNotation.${id}`),
            }))}
            onChange={setMoveNotation}
          />
          <SelectRow
            label={tStudioChrome(locale, "chrome.settings.notationDensity")}
            value={settings.notationDensity}
            options={NOTATION_DENSITY_IDS.map((id) => ({ id, label: tStudioChrome(locale, `chrome.settings.density.${id}`) }))}
            onChange={setNotationDensity}
          />
          <Row label={tStudioChrome(locale, "chrome.settings.showClockTimes")}>
            <Toggle
              label={tStudioChrome(locale, "chrome.settings.showClockTimes")}
              checked={settings.showClockTimes}
              onChange={toggleClockTimes}
            />
          </Row>
        </Section>
        <Section title={tStudioChrome(locale, "chrome.settings.gameReview")}>
          <Row label={tStudioChrome(locale, "chrome.settings.savedReviews")}>
            {confirmingClear ? (
              <div className="flex items-center gap-2">
                <Button
                  ref={confirmClearRef}
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    clearReviewCache();
                    setConfirmingClear(false);
                  }}
                >
                  {tStudioChrome(locale, "chrome.settings.clearReviewsConfirm")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingClear(false)}
                >
                  {tStudioChrome(locale, "chrome.settings.clearReviewsCancel")}
                </Button>
              </div>
            ) : (
              <Button
                ref={clearButtonRef}
                variant="secondary"
                size="sm"
                onClick={() => setConfirmingClear(true)}
              >
                {tStudioChrome(locale, "chrome.settings.clearReviews")}
              </Button>
            )}
          </Row>
        </Section>
        <Section title={tStudioChrome(locale, "chrome.settings.language")}>
          <SelectRow
            label={tStudioChrome(locale, "chrome.settings.siteLanguage")}
            value={settings.locale}
            options={SITE_LOCALES.map((id) => ({ id, label: SITE_LOCALE_LABELS[id] }))}
            onChange={setLocale}
          />
        </Section>
        <LinkedAccountsSection sectionRef={linkedAccountsRef} />
      </div>
    </Dialog>
  );
}
