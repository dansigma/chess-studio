"use client";

import { useCallback, useEffect, useState } from "react";
import type { Path } from "@/src/chess/tree";
import { pathKey } from "./notation-format";
import { notationDraftSyncKey, selectDraftCommit, selectEditedComment, type NotationEditor } from "./notation-draft";

type NotationCommentDraftOptions = {
  editor: NotationEditor;
  boardId: string;
  path: Path;
  currentComment: string;
  currentBefore: string;
  setComment: (value: string) => void;
  setCommentBefore: (value: string) => void;
};

// Owns the comment textarea draft: it re-seeds the draft whenever the open
// editor target changes (render-phase reset, keyed on editor + board + path)
// and commits edits on a 300ms debounce so typing never writes to the store
// on every keystroke.
export function useNotationCommentDraft({
  editor,
  boardId,
  path,
  currentComment,
  currentBefore,
  setComment,
  setCommentBefore,
}: NotationCommentDraftOptions) {
  const [draftComment, setDraftComment] = useState("");

  const editedComment = selectEditedComment(editor, currentComment, currentBefore);
  const draftSource = notationDraftSyncKey(editor, boardId, pathKey(path), editedComment);
  const [syncedDraftSource, setSyncedDraftSource] = useState<string | null>(null);
  if (syncedDraftSource !== draftSource) {
    setSyncedDraftSource(draftSource);
    if (editedComment !== null) {
      setDraftComment(editedComment);
    }
  }

  const commitDraftComment = useCallback(() => {
    const commit = selectDraftCommit(editor, draftComment, currentComment, currentBefore);
    if (!commit) {
      return;
    }
    if (commit.target === "before") {
      setCommentBefore(commit.value);
    } else {
      setComment(commit.value);
    }
  }, [editor, currentBefore, currentComment, draftComment, setComment, setCommentBefore]);

  useEffect(() => {
    if (editor !== "comment" && editor !== "commentBefore") {
      return;
    }
    const handle = window.setTimeout(commitDraftComment, 300);
    return () => window.clearTimeout(handle);
  }, [commitDraftComment, editor]);

  return { draftComment, setDraftComment, commitDraftComment };
}
