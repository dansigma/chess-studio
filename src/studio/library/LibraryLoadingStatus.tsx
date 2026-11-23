import { tLibrary } from "@/src/i18n/library-strings";
import { useStudioStore } from "@/src/store/studio-store";

export function LibraryLoadingStatus({ className = "px-3 py-4 text-dense text-studio-faint" }: { className?: string }) {
  const locale = useStudioStore((state) => state.settings.locale);
  return <p role="status" className={className}>{tLibrary(locale, "library.sync.loading")}</p>;
}
