export function BrandLockup({ size = "sm" }: { size?: "sm" | "lg" }) {
  const large = size === "lg";
  return (
    <span className={`inline-flex items-center gap-2 ${large ? "text-title" : "text-body"}`}>
      <span
        aria-hidden
        className={`grid grid-cols-2 overflow-hidden ${large ? "h-5 w-5 rounded-[5px]" : "h-4 w-4 rounded"}`}
      >
        <i className="bg-studio-accent" />
        <i className="bg-studio-accent-soft" />
        <i className="bg-studio-accent-soft" />
        <i className="bg-studio-accent" />
      </span>
      <span className="font-semibold tracking-tight text-studio-fg">
        Xadrez <span className="font-normal text-studio-accent-text">Digital</span>
      </span>
    </span>
  );
}
