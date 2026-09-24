"use client";

import { useMemo, useState } from "react";
import { Cloud, Database, Folder, Globe } from "lucide-react";
import { fileExplorerSource, type ExplorerSource } from "@/src/lib/explorer-types";
import { useStudioStore } from "@/src/store/studio-store";
import { SearchInput, SectionHeader } from "./ui/Controls";
import { SidebarHint, SidebarItem, SidebarPanel } from "./ui/Sidebar";

const PUBLIC_SOURCES: Array<{
  source: ExplorerSource;
  title: string;
  description: string;
  icon: typeof Database;
}> = [
  {
    source: "masters",
    title: "Ultra Database",
    description: "Over-the-board master games · Lichess Masters",
    icon: Database,
  },
  { source: "lichess", title: "Online Database", description: "Online games from Lichess", icon: Globe },
  {
    source: "chesscom",
    title: "Chess.com",
    description: "Published games of the open player",
    icon: Cloud,
  },
];

export function DatabasesSidebar() {
  const source = useStudioStore((state) => state.databaseSource);
  const files = useStudioStore((state) => state.files);
  const setDatabaseSource = useStudioStore((state) => state.setDatabaseSource);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const publicSources = useMemo(
    () =>
      PUBLIC_SOURCES.filter(
        (item) => !needle || `${item.title} ${item.description}`.toLowerCase().includes(needle),
      ),
    [needle],
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
      title="Databases"
      meta={`${total} sources`}
      header={<SearchInput value={query} onChange={setQuery} placeholder="Search databases" />}
    >
      {publicSources.length > 0 ? <SectionHeader>Public</SectionHeader> : null}
      {publicSources.map((item) => {
        const Icon = item.icon;
        return (
          <SidebarItem
            key={item.source}
            selected={source === item.source}
            icon={<Icon size={16} />}
            title={item.title}
            description={item.description}
            onClick={() => setDatabaseSource(item.source)}
          />
        );
      })}
      {files.databases.length > 0 && personal.length > 0 ? (
        <SectionHeader trailing={personal.length}>Personal</SectionHeader>
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
        <SidebarHint>No matching databases.</SidebarHint>
      ) : null}
    </SidebarPanel>
  );
}
