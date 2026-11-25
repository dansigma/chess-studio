import type { SiteLocale } from "@/src/i18n/locale";
import { countryName, fideToIso } from "@/src/lib/live/federation";

export function FederationFlag({ fed, locale }: { fed: string; locale: SiteLocale }) {
  const flag = fideToIso(fed);
  const name = countryName(fed, locale);

  if (!flag) {
    return (
      <span
        className="shrink-0 rounded border border-studio-border px-1 text-[10px] font-medium uppercase leading-[14px] tracking-wide text-studio-muted"
        title={fed.toUpperCase() === "FID" ? name : undefined}
      >
        {name}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- small SVG served directly from public/flags
    <img
      src={`/flags/${flag}.svg`}
      alt={name}
      title={name}
      width={20}
      height={15}
      loading="lazy"
      decoding="async"
      className="h-[15px] w-5 shrink-0 rounded-xs outline outline-studio-border -outline-offset-1"
    />
  );
}
