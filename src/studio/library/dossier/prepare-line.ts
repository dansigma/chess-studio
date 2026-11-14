// SIG-1341: "Prepare line" from the Library player dossier. Opens the line on
// a fresh Studio board oriented to the USER's side (the opposite of the
// dossier player's colour), reveals the Explorer on that position and leaves
// the Library. Same grain as `prepareAgainst` in OpponentPrepPanel.
// SIG-1345: "Train" reuses the same import but starts training from the first
// move instead of revealing the Explorer.
import { prepareAgainstLine } from "@/src/lib/prep/prep-rows";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel, openExplorerPanel } from "../../dock-api";

/**
 * Imports the line on a fresh board oriented to the USER's side and reveals
 * the Studio. Returns false when the line has no moves.
 */
function openLine(path: string[], opponentColor: "white" | "black", explore: boolean): boolean {
  if (path.length === 0) {
    return false;
  }
  const { game, orientation } = prepareAgainstLine(path, opponentColor);
  const state = useStudioStore.getState();
  state.importPlayerGame(game, { openInNewBoard: true });
  // A fresh import is white-oriented (`emptyBoard`); flip when the user's
  // side is black, then reveal the board panel (and the Explorer).
  if (orientation === "black" && selectActiveBoard(useStudioStore.getState()).orientation !== "black") {
    useStudioStore.getState().flip();
  }
  // `importPlayerGame` can land on the position of the previously active
  // board (its FEN matches a node of this line). A dossier action always
  // starts the line from move 1, so training begins there too.
  if (selectActiveBoard(useStudioStore.getState()).path.length > 0) {
    useStudioStore.getState().goPath([]);
  }
  const active = selectActiveBoard(useStudioStore.getState());
  openBoardPanel(active.id, active.title);
  if (explore) {
    openExplorerPanel();
  }
  useStudioStore.getState().setWorkspaceView("studio");
  return true;
}

export function prepareLine(path: string[], opponentColor: "white" | "black"): void {
  openLine(path, opponentColor, true);
}

/** SIG-1345: "Train" opens the line from the first move and starts training. */
export function trainLine(path: string[], opponentColor: "white" | "black"): void {
  if (!openLine(path, opponentColor, false)) {
    return;
  }
  useStudioStore.getState().startTraining();
}
