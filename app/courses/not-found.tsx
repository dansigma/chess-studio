import Link from "next/link";

export default function CoursesNotFound() {
  return (
    <div className="min-h-full bg-studio-bg">
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-studio-fg">Course not found.</h1>
        <p className="mt-2 text-body text-studio-muted">
          This course or line does not exist or is no longer published.
        </p>
        <Link href="/courses" className="mt-3 inline-block text-body text-studio-accent-text">
          Back to courses
        </Link>
      </main>
    </div>
  );
}
