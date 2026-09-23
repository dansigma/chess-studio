import { boardImageElement } from "@/src/chess/copy-board";
import { boardPngBlob } from "@/src/chess/copy-board-image";
import { blobToDataUrl, PRINT_SHEET_ID, printSheetMarkup, printTokens } from "@/src/chess/print-sheet";
import { useStudioStore } from "@/src/store/studio-store";

let sheetIsImage = false;

function printRoot(): HTMLElement | null {
  return document.getElementById(PRINT_SHEET_ID);
}

function notationForActiveBoard() {
  const board = useStudioStore.getState().active();
  const notation = useStudioStore.getState().settings.moveNotation;
  return {
    title: board.title,
    tokens: printTokens(board.tree, board.path, notation),
  };
}

export async function printActiveBoard(): Promise<void> {
  const setStatus = useStudioStore.getState().setStatus;
  const element = boardImageElement();
  const root = printRoot();
  if (!element || !root) {
    setStatus("Board is not open");
    return;
  }
  try {
    const blob = await boardPngBlob(element);
    const imageDataUrl = await blobToDataUrl(blob);
    root.innerHTML = printSheetMarkup({ ...notationForActiveBoard(), imageDataUrl });
    sheetIsImage = true;
    const image = root.querySelector("img");
    if (image) {
      await image.decode().catch(() => undefined);
    }
    window.print();
  } catch {
    setStatus("Could not print");
  }
}

export function preparePrintFallback(): void {
  if (sheetIsImage) {
    sheetIsImage = false;
    return;
  }
  const element = boardImageElement();
  const root = printRoot();
  if (!element || !root) {
    return;
  }
  const board = element.cloneNode(true) as HTMLElement;
  board.style.width = "480px";
  board.style.height = "480px";
  root.innerHTML = printSheetMarkup({
    ...notationForActiveBoard(),
    imageDataUrl: "",
  });
  root.querySelector("img")?.replaceWith(board);
}
