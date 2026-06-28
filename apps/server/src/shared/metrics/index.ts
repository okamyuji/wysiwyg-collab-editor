import client from "prom-client";

client.collectDefaultMetrics();

export const otAckLatency = new client.Histogram({
  name: "ot_ack_latency_seconds",
  help: "OT ACK latency",
  buckets: [0.05, 0.1, 0.2, 0.4, 0.8, 1.6, 3.2],
});

export const restResponse = new client.Histogram({
  name: "rest_response_seconds",
  help: "REST response time",
  buckets: [0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
  labelNames: ["method", "route", "status"] as const,
});

export const wsConnectionsActive = new client.Gauge({
  name: "websocket_connections_active",
  help: "active WebSocket connections",
});

export const capacityRejectSubscribe = new client.Counter({
  name: "capacity_reject_subscribe_total",
  help: "subscribe rejects",
});

export const capacityRejectConnect = new client.Counter({
  name: "capacity_reject_connect_total",
  help: "connect rejects",
});

export const capacityRejectProxy = new client.Counter({
  name: "capacity_reject_proxy_total",
  help: "proxy-layer rejects",
});

export const cspViolation = new client.Counter({
  name: "csp_violation_total",
  help: "CSP violation reports",
});

export const revisionReachabilityViolation = new client.Counter({
  name: "revision_reachability_violation_total",
  help: "reachability invariant violations",
});

export const logDropCount = new client.Counter({
  name: "log_drop_count",
  help: "fluent-bit ring buffer drops",
});

export function getMetrics(): Promise<string> {
  return client.register.metrics();
}

export function getMetricsContentType(): string {
  return client.register.contentType;
}
