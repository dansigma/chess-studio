// SIG-1341: "Prepare line" from the Library player dossier. Opens the line on
// a fresh Studio board oriented to the USER's side (the opposite of the
// dossier player's colour), reveals the Explorer on that position and leaves
// the Library. Same grain as the retired Opponent prep panel's "Prepare
// against" flow.
// SIG-1344: an empty path is a position too — a gap on the opponent's first
// move prepares the start position, so it must open the Studio as well.
// SIG-1345: "Train" reuses the same import but starts training from the first
// move instead of revealing the Explorer.
import { preparationLineTitle, prepareAgainstLine } from "@/src/lib/prep/prep-rows";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel, openExplorerPanel, openStudioPanel } from "../../dock-api";

/**
 * Imports the line on a fresh board oriented to the USER's side and reveals
 * the Studio. An empty line opens the start position.
 */
function openLine(path: string[], opponentColor: "white" | "black", explore: boolean): void {
  const state = useStudioStore.getState();
  const title = preparationLineTitle(state.settings.locale, path);
  const { game, orientation } = prepareAgainstLine(path, opponentColor, title);
  // The synthetic game carries "?" for both players and the line title in
  // `Opening`, so the notation header names the line instead of showing
  // "Opening line contra Opening line"; the tab uses the same title.
  state.importPlayerGame(game, { openInNewBoard: true, title });
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
}

export function prepareLine(path: string[], opponentColor: "white" | "black"): void {
  openLine(path, opponentColor, true);
}

/** SIG-1345: "Train" opens the line from the first move and starts training. */
export function trainLine(path: string[], opponentColor: "white" | "black"): void {
  openLine(path, opponentColor, false);
  useStudioStore.getState().startTraining();
  // The training UI lives in the Repertoire panel; bring it forward so the
  // user lands on the first move instead of only seeing the flipped board.
  openStudioPanel("repertoire");
}
