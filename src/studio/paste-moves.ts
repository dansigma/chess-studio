// SIG-1463: reads the clipboard and pastes its moves into the active game.
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { useStudioStore } from "@/src/store/studio-store";

export async function pasteMovesFromClipboard(): Promise<void> {
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    const locale = useStudioStore.getState().settings.locale;
    useStudioStore.setState({ statusMessage: tStudioChrome(locale, "chrome.paste.clipboardDenied") });
    return;
  }
  useStudioStore.getState().pasteMoves(text);
}
