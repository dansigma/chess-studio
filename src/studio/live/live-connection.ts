import type { LiveConnection } from "@/src/lib/live/broadcast-manager";
import type { StudioChromeStringKey } from "@/src/i18n/studio-chrome-strings";

/** i18n key of the indicator label for each connection state. */
export const LIVE_CONNECTION_LABEL_KEYS: Record<LiveConnection, StudioChromeStringKey> = {
  idle: "chrome.live.connection.idle",
  connecting: "chrome.live.connection.connecting",
  live: "chrome.live.connection.live",
  polling: "chrome.live.connection.polling",
  paused: "chrome.live.connection.paused",
  "rate-limited": "chrome.live.connection.rate-limited",
  error: "chrome.live.connection.error",
};
