// Next-build-only stub for the workerd-only `cloudflare:workers` module.
// Active only when NEXT_ALIAS_WORKERD_STUB=1 (see next.config.ts, set by the
// `build` script): the Next build cannot load the real module. Everywhere else
// (dev, vinext/vite production pipeline) the genuine workerd module resolves,
// with the real `env` carrying the ENGINE binding. Never imported directly.
export const env: Record<string, unknown> = {};
