import { pathToFileURL } from "node:url";

export function parsePollIntervalMs(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "5000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const pollIntervalMs = parsePollIntervalMs(process.env.EXPORT_WORKER_POLL_MS);
  console.info("export-worker scaffold started", { pollIntervalMs });
}
