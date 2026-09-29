export type CourseVideo =
  | { kind: "youtube" | "vimeo"; src: string }
  | { kind: "file"; src: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function httpsUrl(value: string | null | undefined): URL | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed.length > 2000) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || !url.hostname) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function courseImageUrl(value: string | null | undefined): string | null {
  return httpsUrl(value)?.toString() ?? null;
}

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return YOUTUBE_ID.test(id) ? id : null;
  }
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") {
    return null;
  }
  const fromQuery = url.searchParams.get("v");
  if (fromQuery && YOUTUBE_ID.test(fromQuery)) {
    return fromQuery;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const marker = parts[0];
  const id = parts[1] ?? "";
  if ((marker === "embed" || marker === "shorts") && YOUTUBE_ID.test(id)) {
    return id;
  }
  return null;
}

export function courseVideo(value: string | null | undefined): CourseVideo | null {
  const url = httpsUrl(value);
  if (!url) {
    return null;
  }
  const youtube = youtubeId(url);
  if (youtube) {
    return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${youtube}` };
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean).find((part) => /^\d+$/.test(part));
    if (id) {
      return { kind: "vimeo", src: `https://player.vimeo.com/video/${id}` };
    }
  }
  if (/\.(mp4|webm)$/i.test(url.pathname)) {
    return { kind: "file", src: url.toString() };
  }
  return null;
}
