import { courseVideo } from "@/src/courses/media";

/** Course video (YouTube, Vimeo or file) from a raw URL. Renders nothing when the URL is rejected. */
export function VideoEmbed({ url, title }: { url: string | null | undefined; title: string }) {
  const video = courseVideo(url);
  if (!video) {
    return null;
  }
  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-studio-border bg-studio-chrome">
      {video.kind === "file" ? (
        <video src={video.src} controls className="aspect-video w-full bg-black" />
      ) : (
        <iframe
          src={video.src}
          title={title}
          className="aspect-video w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
    </div>
  );
}
