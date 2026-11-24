import { useEffect, useState } from "react";
import { tAskMaster } from "@/src/i18n/ask-master-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import type { AskMasterIntent } from "@/src/lib/ask-master/intent";
import { indexCatalogOpenings, resolveLineOpening } from "@/src/lib/line-opening";
import { localizeOpeningName } from "@/src/lib/opening-names";
import { loadCatalog } from "@/src/lib/openings-catalog";
import { Button } from "../ui/Button";

export function AskMasterStarters({
  fen,
  lineFens,
  locale,
  disabled,
  onAsk,
}: {
  fen: string;
  lineFens: readonly string[];
  locale: SiteLocale;
  disabled: boolean;
  onAsk: (question: string, intent: AskMasterIntent) => void;
}) {
  const [openingIndex, setOpeningIndex] = useState<ReturnType<typeof indexCatalogOpenings>>();
  useEffect(() => {
    let active = true;
    void loadCatalog().then((catalog) => {
      if (active) setOpeningIndex(indexCatalogOpenings(catalog));
    }).catch(() => {
      // The position and model-game starters are available without the catalog.
    });
    return () => { active = false; };
  }, []);

  const opening = openingIndex && resolveLineOpening(lineFens, openingIndex);
  const starters: { intent: AskMasterIntent; question: string }[] = [
    {
      intent: "explain",
      question: tAskMaster(locale, fen.split(" ")[1] === "b" ? "starterExplainBlack" : "starterExplainWhite"),
    },
    { intent: "model-games", question: tAskMaster(locale, "starterModelGames") },
  ];
  if (opening) {
    starters.push({
      intent: "study-opening",
      question: tAskMaster(locale, "starterStudyOpening", {
        opening: localizeOpeningName(opening.name, locale, opening.eco),
      }),
    });
  }

  return (
    <ul className="ml-9 flex flex-wrap gap-1.5">
      {starters.map(({ intent, question }) => (
        <li key={intent}>
          <Button size="sm" className="h-auto min-h-7 !rounded-full border border-studio-border-subtle py-1 text-left" disabled={disabled} onClick={() => onAsk(question, intent)}>
            {question}
          </Button>
        </li>
      ))}
    </ul>
  );
}
