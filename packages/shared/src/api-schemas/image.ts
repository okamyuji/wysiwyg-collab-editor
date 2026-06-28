import { z } from "zod";

export const imageMimeType = z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export const imageRes = z.object({
  image_id: z.string().uuid(),
  storage_key: z.string(),
  mime_type: imageMimeType,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  thumbnails: z.object({
    size_1280: z.string(),
    size_640: z.string(),
    size_320: z.string(),
  }),
  signed_url: z.string().url(),
});
