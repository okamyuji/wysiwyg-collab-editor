import express from "express";
import helmet from "helmet";
import { pathToFileURL } from "node:url";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/metrics", (_req, res) => {
    res.type("text/plain").send("# metrics scaffold\n");
  });

  return app;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  createApp().listen(port, () => {
    console.info(`app-server listening on ${port}`);
  });
}
