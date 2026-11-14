// SIG-1341: "Prepare line" from the Library player dossier. Opens the line on
// a fresh Studio board oriented to the USER's side (the opposite of the
// dossier player's colour), reveals the Explorer on that position and leaves
// the Library. Same grain as the retired Opponent prep panel's "Prepare
// against" flow.
import { prepareAgainstLine } from "@/src/lib/prep/prep-rows";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel, openExplorerPanel } from "../../dock-api";

export function prepareLine(path: string[], opponentColor: "white" | "black"): void {
  // SIG-1344: an empty path is a position too — a gap on the opponent's first
  // move prepares the start position, so it must open the Studio as well.
  const { game, orientation } = prepareAgainstLine(path, opponentColor);
  const state = useStudioStore.getState();
  state.importPlayerGame(game, { openInNewBoard: true });
  // A fresh import is white-oriented (`emptyBoard`); flip when the user's
  // side is black, then reveal the board panel and the Explorer.
  if (orientation === "black" && selectActiveBoard(useStudioStore.getState()).orientation !== "black") {
    useStudioStore.getState().flip();
  }
  const active = selectActiveBoard(useStudioStore.getState());
  openBoardPanel(active.id, active.title);
  openExplorerPanel();
  useStudioStore.getState().setWorkspaceView("studio");
}
