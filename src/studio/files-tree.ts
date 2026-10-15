import {
  type FileDatabase,
  type FileFolder,
} from "@/src/lib/user-files";

export interface FolderNode {
  folder: FileFolder;
  children: FolderNode[];
  databases: FileDatabase[];
}

export interface FolderOption {
  id: string;
  name: string;
  depth: number;
}

export function matchesDatabase(db: FileDatabase, query: string): boolean {
  const hay = `${db.name} ${db.games
    .map((game) => `${game.white} ${game.black} ${game.event}`)
    .join(" ")}`.toLowerCase();
  return hay.includes(query);
}

export function buildFolderTree(
  folders: FileFolder[],
  databases: FileDatabase[],
  query: string,
): { rootFolders: FolderNode[]; rootDatabases: FileDatabase[]; folderOptions: FolderOption[] } {
  const q = query.trim().toLowerCase();

  const nodeMap = new Map<string, FolderNode>();
  for (const folder of folders) {
    nodeMap.set(folder.id, { folder, children: [], databases: [] });
  }

  const rawRootDatabases: FileDatabase[] = [];
  for (const database of databases) {
    if (database.folderId && nodeMap.has(database.folderId)) {
      nodeMap.get(database.folderId)!.databases.push(database);
    } else {
      rawRootDatabases.push(database);
    }
  }

  const rawRootFolders: FolderNode[] = [];
  for (const folder of folders) {
    const node = nodeMap.get(folder.id)!;
    if (folder.parentId && nodeMap.has(folder.parentId)) {
      nodeMap.get(folder.parentId)!.children.push(node);
    } else {
      rawRootFolders.push(node);
    }
  }

  // Ensure any detached cycles or orphan nodes are also reachable
  const visited = new Set<string>();
  function markVisited(node: FolderNode) {
    visited.add(node.folder.id);
    for (const child of node.children) {
      markVisited(child);
    }
  }
  for (const root of rawRootFolders) {
    markVisited(root);
  }
  for (const folder of folders) {
    if (!visited.has(folder.id)) {
      const node = nodeMap.get(folder.id)!;
      rawRootFolders.push(node);
      markVisited(node);
    }
  }

  function collectOptions(nodes: FolderNode[], depth = 0): FolderOption[] {
    const options: FolderOption[] = [];
    for (const node of nodes) {
      options.push({ id: node.folder.id, name: node.folder.name, depth });
      options.push(...collectOptions(node.children, depth + 1));
    }
    return options;
  }
  const folderOptions = collectOptions(rawRootFolders);

  if (!q) {
    return {
      rootFolders: rawRootFolders,
      rootDatabases: rawRootDatabases,
      folderOptions,
    };
  }

  function filterFolderNode(node: FolderNode): FolderNode | null {
    const nameMatches = node.folder.name.toLowerCase().includes(q);
    const matchingDatabases = node.databases.filter(
      (db) => nameMatches || matchesDatabase(db, q),
    );
    const matchingChildren = node.children
      .map(filterFolderNode)
      .filter((child): child is FolderNode => child !== null);

    if (nameMatches || matchingDatabases.length > 0 || matchingChildren.length > 0) {
      return {
        folder: node.folder,
        children: matchingChildren,
        databases: nameMatches ? node.databases : matchingDatabases,
      };
    }
    return null;
  }

  const filteredRootFolders = rawRootFolders
    .map(filterFolderNode)
    .filter((node): node is FolderNode => node !== null);
  const filteredRootDatabases = rawRootDatabases.filter((db) => matchesDatabase(db, q));

  return {
    rootFolders: filteredRootFolders,
    rootDatabases: filteredRootDatabases,
    folderOptions,
  };
}
