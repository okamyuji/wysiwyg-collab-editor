import crypto from "node:crypto";
import type { Response } from "express";

import { ApiError } from "../error/api-error.js";

export interface EnvelopeMeta {
  request_id: string;
  trace_id: string;
  next_cursor?: string | null;
}

export interface SuccessEnvelope<T> {
  data: T;
  error: null;
  meta: EnvelopeMeta;
}

export interface ErrorEnvelope {
  data: null;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: EnvelopeMeta;
}

type RequestWithTrace = Response["req"] & { trace_id?: string };

function metadata(res: Response, nextCursor?: string | null): EnvelopeMeta {
  const req = res.req as RequestWithTrace;
  const requestIdHeader = req.headers["x-request-id"];
  const requestId = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;

  return {
    request_id: requestId ?? crypto.randomUUID(),
    trace_id: req.trace_id ?? crypto.randomUUID(),
    ...(nextCursor !== undefined ? { next_cursor: nextCursor } : {}),
  };
}

export function buildSuccessEnvelope<T>(
  res: Response,
  data: T,
  nextCursor: string | null = null,
): SuccessEnvelope<T> {
  return { data, error: null, meta: metadata(res, nextCursor) };
}

export function buildErrorEnvelope(res: Response, err: ApiError): ErrorEnvelope {
  return {
    data: null,
    error: {
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    },
    meta: metadata(res),
  };
}

export function sendSuccess<T>(res: Response, data: T, nextCursor: string | null = null): void {
  res.json(buildSuccessEnvelope(res, data, nextCursor));
}

export function sendError(res: Response, err: ApiError): void {
  res.status(err.httpStatus).json(buildErrorEnvelope(res, err));
}
