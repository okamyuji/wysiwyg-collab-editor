import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export interface RequestWithTrace extends Request {
  trace_id?: string;
}

export function requestId(req: RequestWithTrace, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  const id = Array.isArray(incoming) ? incoming[0] : incoming;
  const requestIdValue = id ?? crypto.randomUUID();

  req.headers["x-request-id"] = requestIdValue;
  req.trace_id = crypto.randomUUID();
  res.setHeader("x-request-id", requestIdValue);
  next();
}
