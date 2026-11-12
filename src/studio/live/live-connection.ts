import type { LiveConnection } from "@/src/lib/live/broadcast-manager";
import type { LiveStringKey } from "@/src/i18n/live-strings";

/** i18n key of the indicator label for each connection state. */
export const LIVE_CONNECTION_LABEL_KEYS: Record<LiveConnection, LiveStringKey> = {
  idle: "live.connection.idle",
  connecting: "live.connection.connecting",
  live: "live.connection.live",
  polling: "live.connection.polling",
  paused: "live.connection.paused",
  "rate-limited": "live.connection.rate-limited",
  error: "live.connection.error",
};
