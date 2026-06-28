import { z } from "zod";

export const locale = z.enum(["ja", "en"]);
export const userRole = z.enum(["standard", "operations_admin", "security_admin", "cs_admin"]);
export const colorHex = z.string().regex(/^#[0-9a-f]{6}$/i);

export const registerReq = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(256),
  display_name: z.string().min(1).max(64),
});

export const registerRes = z.object({ user_id: z.string().uuid() });

export const loginReq = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const loginRes = z.object({
  user_id: z.string().uuid(),
  display_name: z.string(),
});

export const passwordResetRequestReq = z.object({ email: z.string().email() });

export const passwordResetConfirmReq = z.object({
  token: z.string().min(32),
  new_password: z.string().min(12).max(256),
});

export const meRes = z.object({
  user_id: z.string().uuid(),
  email: z.string().email(),
  display_name: z.string(),
  color_hex: colorHex,
  avatar_url: z.string().url().nullable(),
  locale,
  roles: z.array(userRole),
});

export const updateMeReq = z.object({
  display_name: z.string().min(1).max(64).optional(),
  color_hex: colorHex.optional(),
  locale: locale.optional(),
});
