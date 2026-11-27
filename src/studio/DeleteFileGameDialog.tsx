import { createPortal } from "react-dom";
import { tPanels } from "@/src/i18n/studio-panel-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";

export type FileGameDeleteTarget = { databaseId: string; gameId: string; title: string };

export function DeleteFileGameDialog({ target, onClose }: { target: FileGameDeleteTarget; onClose: () => void }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const deleteFileGame = useStudioStore((state) => state.deleteFileGame);
  return createPortal(
    <Dialog
      title={tPanels(locale, "files.deleteGameTitle")}
      width="w-[24rem]"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tPanels(locale, "dialog.cancel")}
          </Button>
          <Button variant="danger" onClick={() => {
            deleteFileGame(target.databaseId, target.gameId);
            onClose();
          }}>
            {tPanels(locale, "files.deleteGame")}
          </Button>
        </>
      }
    >
      {tPanels(locale, "files.deleteGameBody", { game: target.title })}
    </Dialog>,
    document.body,
  );
}
