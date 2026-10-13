// Pure core of the notation comment-draft flow. The panel drives these from a
// render-phase sync and a debounced commit; keeping the decisions here means
// the ordering-sensitive behaviour is unit-testable without a DOM.
export type NotationEditor = "comment" | "commentBefore" | "headers" | null;

export type NotationDraftTarget = "before" | "after";

export function selectEditedComment(
  editor: NotationEditor,
  currentComment: string,
  currentBefore: string,
): string | null {
  if (editor === "comment") {
    return currentComment;
  }
  if (editor === "commentBefore") {
    return currentBefore;
  }
  return null;
}

export function notationDraftSyncKey(
  editor: NotationEditor,
  boardId: string,
  path: string,
  editedComment: string | null,
): string | null {
  if (editedComment === null) {
    return null;
  }
  return `${editor}|${boardId}|${path}|${editedComment}`;
}

export function selectDraftCommit(
  editor: NotationEditor,
  draftComment: string,
  currentComment: string,
  currentBefore: string,
): { target: NotationDraftTarget; value: string } | null {
  if (editor === "commentBefore") {
    return draftComment === currentBefore ? null : { target: "before", value: draftComment };
  }
  if (editor === "comment") {
    return draftComment === currentComment ? null : { target: "after", value: draftComment };
  }
  return null;
}
