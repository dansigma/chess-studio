"use client";

export default function CoursesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-full bg-studio-bg">
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-studio-fg">Courses could not be loaded.</h1>
        <p className="mt-2 text-body text-studio-muted">
          {error.message || "Something went wrong while loading the courses."}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 rounded-lg border border-studio-border bg-studio-chrome px-4 py-2 text-body text-studio-fg hover:border-studio-border-strong"
        >
          Try again
        </button>
      </main>
    </div>
  );
}
