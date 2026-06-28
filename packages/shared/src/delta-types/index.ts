import { z } from "zod";

export const quillDeltaOp = z
  .object({
    insert: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    delete: z.number().int().positive().optional(),
    retain: z.number().int().positive().optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (value) =>
      Number(value.insert !== undefined) +
        Number(value.delete !== undefined) +
        Number(value.retain !== undefined) ===
      1,
    { message: "Delta op must contain exactly one of insert, delete, or retain" },
  );

export const quillDelta = z.object({
  ops: z.array(quillDeltaOp),
});

export type QuillDeltaOp = z.infer<typeof quillDeltaOp>;
export type QuillDelta = z.infer<typeof quillDelta>;
