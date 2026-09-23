"use client";

import { useMemo, useState } from "react";
import { Cloud, Database, Globe } from "lucide-react";
import { fileExplorerSource } from "@/src/lib/explorer-types";
import { useStudioStore } from "@/src/store/studio-store";

export function DatabasesSidebar() {
  const source = useStudioStore((state) => state.databaseSource);
  const files = useStudioStore((state) => state.files);
  const setDatabaseSource = useStudioStore((state) => state.setDatabaseSource);
  const [query, setQuery] = useState("");

  const personal = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return files.databases;
    }
    return files.databases.filter((database) => database.name.toLowerCase().includes(needle));
  }, [files.databases, query]);

  return (
    <div className="flex h-full w-64 flex-col overflow-hidden rounded-lg bg-studio-panel">
      <div className="px-3 py-3">
        <h2 className="text-sm font-medium text-studio-fg">Databases</h2>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search..."
          className="mt-3 w-full rounded border border-studio-border bg-studio-selected px-2 py-1.5 text-sm text-studio-fg outline-none"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
        <button
          className={`mb-1 flex w-full items-start gap-3 rounded-md px-3 py-2 text-left ${
            source === "masters" ? "bg-studio-selected" : "hover:bg-studio-hover-subtle"
          }`}
          onClick={() => setDatabaseSource("masters")}
        >
          <Database size={16} className="mt-0.5 text-studio-muted" />
          <span>
            <span className="block text-sm text-studio-fg">Ultra Database</span>
            <span className="block text-[11px] text-studio-faint">
              Over-the-board master games (Lichess Masters)
            </span>
          </span>
        </button>
        <button
          className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left ${
            source === "lichess" ? "bg-studio-selected" : "hover:bg-studio-hover-subtle"
          }`}
          onClick={() => setDatabaseSource("lichess")}
        >
          <Globe size={16} className="mt-0.5 text-studio-muted" />
          <span>
            <span className="block text-sm text-studio-fg">Online Database</span>
            <span className="block text-[11px] text-studio-faint">
              Online games from Lichess
            </span>
          </span>
        </button>
        <button
          className={`mt-1 flex w-full items-start gap-3 rounded-md px-3 py-2 text-left ${
            source === "chesscom" ? "bg-studio-selected" : "hover:bg-studio-hover-subtle"
          }`}
          onClick={() => setDatabaseSource("chesscom")}
        >
          <Cloud size={16} className="mt-0.5 text-studio-muted" />
          <span>
            <span className="block text-sm text-studio-fg">Chess.com</span>
            <span className="block text-[11px] text-studio-faint">
              Published games of the open Chess.com player
            </span>
          </span>
        </button>
        {files.databases.length > 0 ? (
          <div className="px-3 pb-1 pt-3 text-[11px] uppercase tracking-wide text-studio-faint">
            Personal
          </div>
        ) : null}
        {personal.map((database) => {
          const selected = source === fileExplorerSource(database.id);
          const count = database.games.length;
          return (
            <button
              key={database.id}
              className={`mb-1 flex w-full items-start gap-3 rounded-md px-3 py-2 text-left ${
                selected ? "bg-studio-selected" : "hover:bg-studio-hover-subtle"
              }`}
              onClick={() => setDatabaseSource(fileExplorerSource(database.id))}
            >
              <Database size={16} className="mt-0.5 text-sky-400/80" />
              <span>
                <span className="block text-sm text-studio-fg">{database.name}</span>
                <span className="block whitespace-nowrap text-[11px] text-studio-faint">
                  {count === 1 ? "1 game" : `${count} games`}
                </span>
              </span>
            </button>
          );
        })}
        {files.databases.length > 0 && personal.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-studio-faint">No matching databases.</div>
        ) : null}
      </div>
    </div>
  );
}
