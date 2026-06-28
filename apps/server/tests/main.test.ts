import { createServer } from "node:http";
import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/main.js";

let server: ReturnType<typeof createServer> | undefined;

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    server.close((error) => (error ? reject(error) : resolve()));
    server = undefined;
  });
});

describe("server scaffold", () => {
  test("responds to health checks", async () => {
    server = createServer(createApp());
    await new Promise<void>((resolve) => server!.listen(0, resolve));

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Server did not bind to a TCP port");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  test("sets baseline security headers", async () => {
    server = createServer(createApp());
    await new Promise<void>((resolve) => server!.listen(0, resolve));

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Server did not bind to a TCP port");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);

    expect(response.headers.get("x-powered-by")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
  });
});
