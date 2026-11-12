"use client";

import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { formatDateTime } from "@/src/i18n/format";
import { tLive } from "@/src/i18n/live-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import type { BroadcastListItem } from "@/src/lib/live/types";
import { Button } from "@/src/studio/ui/Button";
import { Badge } from "@/src/studio/ui/Controls";
import { roundIdForItem, useBroadcastList } from "./use-broadcast-list";

const LICHESS_BROADCAST_URL = "https://lichess.org/broadcast";

function BroadcastCard({
  item,
  locale,
  onOpen,
}: {
  item: BroadcastListItem;
  locale: SiteLocale;
  onOpen: (roundId: string) => void;
}) {
  const { tour, round } = item;
  const roundId = roundIdForItem(item);
  const ongoing = round?.ongoing === true;
  const meta = [tour.format, tour.timeControl, tour.location].filter(Boolean).join(" · ");
  const when = !ongoing && round?.startsAt != null ? formatDateTime(locale, round.startsAt) : null;
  const body: ReactNode = (
    <>
      {tour.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote host without next/image config
        <img
          src={tour.imageUrl}
          alt={tLive(locale, "live.item.imageAlt", { name: tour.name })}
          loading="lazy"
          className="aspect-[2/1] w-full rounded-md bg-studio-hover-subtle object-cover"
        />
      ) : (
        <div className="aspect-[2/1] w-full rounded-md bg-studio-hover-subtle" aria-hidden="true" />
      )}
      <div className="mt-2 min-w-0">
        <div className="truncate text-sm font-medium text-studio-fg">{tour.name}</div>
        {item.group ? <div className="truncate text-caption text-studio-muted">{item.group}</div> : null}
        {meta ? <div className="truncate text-caption text-studio-muted">{meta}</div> : null}
        {round ? (
          <div className="mt-1 flex items-center gap-1.5 text-caption text-studio-fg">
            {ongoing ? (
              <Badge tone="accent">
                <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-studio-success" aria-hidden="true" />
                {tLive(locale, "live.item.live")}
              </Badge>
            ) : null}
            <span className="truncate">
              {when ? tLive(locale, "live.item.nextRound", { round: round.name, date: when }) : round.name}
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
  const cls = "block w-full rounded-lg border border-studio-border bg-studio-panel p-2 text-left";
  return roundId ? (
    <button type="button" onClick={() => onOpen(roundId)} className={`${cls} hover:bg-studio-hover-subtle`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Section({
  title,
  items,
  locale,
  onOpen,
  footer,
}: {
  title: string;
  items: BroadcastListItem[];
  locale: SiteLocale;
  onOpen: (roundId: string) => void;
  footer?: ReactNode;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <section aria-label={title} className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-studio-fg">{title}</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.tour.id}>
            <BroadcastCard item={item} locale={locale} onOpen={onOpen} />
          </li>
        ))}
      </ul>
      {footer}
    </section>
  );
}

function Skeletons({ label }: { label: string }) {
  return (
    <ul aria-busy="true" aria-label={label} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="rounded-lg border border-studio-border p-2">
          <div className="aspect-[2/1] animate-pulse rounded-md bg-studio-hover-strong" />
          <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-studio-hover-strong" />
          <div className="mt-1.5 h-2.5 w-1/2 animate-pulse rounded bg-studio-hover-strong" />
        </li>
      ))}
    </ul>
  );
}

export function BroadcastList({ locale, onOpen }: { locale: SiteLocale; onOpen: (roundId: string) => void }) {
  const list = useBroadcastList();
  const { data } = list;
  return (
    <div className="h-full overflow-y-auto bg-studio-bg p-4">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold text-studio-fg">{tLive(locale, "live.title")}</h1>
        <a
          href={LICHESS_BROADCAST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-caption text-studio-muted hover:text-studio-fg"
        >
          {tLive(locale, "live.poweredBy")}
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </header>
      {list.loading && !data ? <Skeletons label={tLive(locale, "live.loading")} /> : null}
      {list.error && !data ? (
        <div role="alert" className="grid place-items-center gap-3 py-12 text-center text-sm text-studio-muted">
          <p>{tLive(locale, "live.error.title")}</p>
          <Button onClick={list.retry}>{tLive(locale, "live.error.retry")}</Button>
        </div>
      ) : null}
      {data ? (
        <>
          {data.active.length === 0 ? (
            <p className="mb-6 text-sm text-studio-muted">{tLive(locale, "live.empty")}</p>
          ) : null}
          <Section title={tLive(locale, "live.section.active")} items={data.active} locale={locale} onOpen={onOpen} />
          <Section title={tLive(locale, "live.section.upcoming")} items={data.upcoming} locale={locale} onOpen={onOpen} />
          <Section
            title={tLive(locale, "live.section.past")}
            items={data.past}
            locale={locale}
            onOpen={onOpen}
            footer={
              data.nextPage !== null ? (
                <div className="mt-3 flex items-center gap-3">
                  <Button onClick={list.loadMore} disabled={list.loadingMore}>
                    {tLive(locale, list.loadingMore ? "live.loadingMore" : "live.loadMore")}
                  </Button>
                  {list.loadMoreError ? (
                    <span role="alert" className="text-caption text-studio-muted">
                      {tLive(locale, "live.loadMoreError")}
                    </span>
                  ) : null}
                </div>
              ) : null
            }
          />
        </>
      ) : null}
    </div>
  );
}
