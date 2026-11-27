"use client";

import { useRef, useState } from "react";
import { ClipboardPaste, FileUp, Plus, type LucideIcon } from "lucide-react";
import { tLibrary } from "@/src/i18n/library-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "../ui/Button";
import { FoldersMenu, PastePgnDialog } from "./LibraryFolders";
import { NewDatabaseDialog } from "./NewDatabaseDialog";
import { useLibraryImport } from "./use-library-import";

export function LibraryActions({ inSheet = false }: { inSheet?: boolean }) {
  const locale = useStudioStore((s) => s.settings.locale);
  const importFiles = useLibraryImport();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [newDatabaseOpen, setNewDatabaseOpen] = useState(false);

  return (
    <>
      <div className={`flex shrink-0 items-center gap-1.5 ${inSheet ? "flex-wrap pb-2 [&_button[role=menuitem]]:min-h-11" : ""}`}>
        <LibraryActionButton
          label={tLibrary(locale, "library.actions.import")}
          icon={FileUp}
          inSheet={inSheet}
          onClick={() => fileInputRef.current?.click()}
        />
        <FoldersMenu inSheet={inSheet} />
        <LibraryActionButton
          label={tLibrary(locale, "library.actions.paste")}
          icon={ClipboardPaste}
          inSheet={inSheet}
          onClick={() => setPasteOpen(true)}
        />
        <LibraryActionButton
          label={tLibrary(locale, "library.actions.newDatabase")}
          icon={Plus}
          inSheet={inSheet}
          onClick={() => setNewDatabaseOpen(true)}
          labelPrefix="+ "
        />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pgn"
        multiple
        hidden
        data-testid="library-import-input"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length > 0) {
            void importFiles(files);
          }
        }}
      />
      {newDatabaseOpen ? <NewDatabaseDialog onClose={() => setNewDatabaseOpen(false)} /> : null}
      {pasteOpen ? (
        <PastePgnDialog onImport={(file) => void importFiles([file])} onClose={() => setPasteOpen(false)} />
      ) : null}
    </>
  );
}

function LibraryActionButton({
  label,
  icon: Icon,
  inSheet,
  onClick,
  labelPrefix = "",
}: {
  label: string;
  icon: LucideIcon;
  inSheet: boolean;
  onClick: () => void;
  labelPrefix?: string;
}) {
  return (
    <Button
      size="sm"
      className={inSheet ? "min-h-11 min-w-11" : undefined}
      title={labelPrefix + label}
      aria-label={labelPrefix + label}
      onClick={onClick}
    >
      <Icon size={14} aria-hidden />
      <span className={inSheet ? undefined : "hidden @min-[54rem]:inline"}>{label}</span>
    </Button>
  );
}
