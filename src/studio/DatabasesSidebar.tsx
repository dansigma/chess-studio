"use client";

import { useMemo, useState } from "react";
import { Cloud, Database, Folder, Globe } from "lucide-react";
import { fileExplorerSource, type ExplorerSource } from "@/src/lib/explorer-types";
import { tSidebar, type StudioSidebarStringKey } from "@/src/i18n/studio-sidebar-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { SearchInput, SectionHeader } from "./ui/Controls";
import { SidebarHint, SidebarItem, SidebarPanel } from "./ui/Sidebar";

const PUBLIC_SOURCES: Array<{
  source: ExplorerSource;
  // SIG-1074: brand titles ("Ultra Database", "Chess.com") stay literal EN;
  // every other user-visible string goes through `tSidebar` at render time.
  titleKey: StudioSidebarStringKey | null;
  title: string;
  descriptionKey: StudioSidebarStringKey;
  icon: typeof Database;
}> = [
  {
    source: "curated",
    titleKey: "sidebar.databases.curatedTitle",
    title: "",
    descriptionKey: "sidebar.databases.curatedDesc",
    icon: Database,
  },
  {
    source: "masters",
    titleKey: null,
    title: "Ultra Database",
    descriptionKey: "sidebar.databases.ultraDesc",
    icon: Database,
  },
  {
    source: "lichess",
    titleKey: "sidebar.databases.onlineTitle",
    title: "",
    descriptionKey: "sidebar.databases.onlineDesc",
    icon: Globe,
  },
  {
    source: "chesscom",
    titleKey: null,
    title: "Chess.com",
    descriptionKey: "sidebar.databases.chesscomDesc",
    icon: Cloud,
  },
];

export function DatabasesSidebar() {
  const locale = useStudioStore((state) => state.settings.locale);
  const source = useStudioStore((state) => state.databaseSource);
  const files = useStudioStore((state) => state.files);
  const setDatabaseSource = useStudioStore((state) => state.setDatabaseSource);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const publicSources = useMemo(
    () =>
      PUBLIC_SOURCES.filter((item) => {
        if (!needle) {
          return true;
        }
        const title = item.titleKey ? tSidebar(locale, item.titleKey) : item.title;
        return `${title} ${tSidebar(locale, item.descriptionKey)}`.toLowerCase().includes(needle);
      }),
    [locale, needle],
  );

  const personal = useMemo(() => {
    if (!needle) {
      return files.databases;
    }
    return files.databases.filter((database) => database.name.toLowerCase().includes(needle));
  }, [files.databases, needle]);

  const total = PUBLIC_SOURCES.length + files.databases.length;

  return (
    <SidebarPanel
      title={tSidebar(locale, "sidebar.databases.title")}
      meta={tSidebar(locale, total === 1 ? "sidebar.databases.sources.one" : "sidebar.databases.sources.other", { count: total })}
      header={<SearchInput value={query} onChange={setQuery} placeholder={tSidebar(locale, "sidebar.databases.searchPlaceholder")} />}
    >
      {publicSources.length > 0 ? <SectionHeader>{tSidebar(locale, "sidebar.databases.public")}</SectionHeader> : null}
      {publicSources.map((item) => {
        const Icon = item.icon;
        return (
          <SidebarItem
            key={item.source}
            selected={source === item.source}
            icon={<Icon size={16} />}
            title={item.titleKey ? tSidebar(locale, item.titleKey) : item.title}
            description={tSidebar(locale, item.descriptionKey)}
            onClick={() => setDatabaseSource(item.source)}
          />
        );
      })}
      {files.databases.length > 0 && personal.length > 0 ? (
        <SectionHeader trailing={personal.length}>{tSidebar(locale, "sidebar.databases.personal")}</SectionHeader>
      ) : null}
      {personal.map((database) => {
        const count = database.games.length;
        return (
          <SidebarItem
            key={database.id}
            selected={source === fileExplorerSource(database.id)}
            icon={<Folder size={16} />}
            title={database.name}
            trailing={count}
            onClick={() => setDatabaseSource(fileExplorerSource(database.id))}
          />
        );
      })}
      {needle && publicSources.length === 0 && personal.length === 0 ? (
        <SidebarHint>{tSidebar(locale, "sidebar.databases.noMatch")}</SidebarHint>
      ) : null}
    </SidebarPanel>
  );
}
