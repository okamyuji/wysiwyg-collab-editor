export const CSRF_HEADER_NAME = "x-csrf-token";
export const CSRF_COOKIE_NAME = "__Host-csrf";
export const CSRF_EXEMPT_PATHS = ["/api/csp-report"] as const;

export function isCsrfExemptPath(path: string): boolean {
  return CSRF_EXEMPT_PATHS.includes(path as (typeof CSRF_EXEMPT_PATHS)[number]);
}
