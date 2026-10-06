export default function CoursesLoading() {
  return (
    <div className="min-h-full bg-studio-bg">
      <main className="mx-auto max-w-5xl px-6 py-8" aria-busy="true" aria-label="Loading courses">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-studio-fg">Courses</h1>
            <p className="mt-2 max-w-2xl text-body text-studio-muted">
              Pick a theme, open a course, and study move by move with the explanation beside the board.
            </p>
          </div>
        </div>
        <div className="mt-8 grid animate-pulse gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="overflow-hidden rounded-xl border border-studio-border bg-studio-chrome"
            >
              <div className="aspect-video bg-studio-hover" />
              <div className="space-y-3 p-5">
                <div className="h-3 w-24 rounded bg-studio-hover" />
                <div className="h-5 w-3/4 rounded bg-studio-hover" />
                <div className="h-4 w-full rounded bg-studio-hover" />
                <div className="h-4 w-2/3 rounded bg-studio-hover" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
