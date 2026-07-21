import { z } from "zod";

const optionalText = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);
const optionalList = z.preprocess(
  (value) => {
    if (!Array.isArray(value)) return value;
    const normalized = value.map((item) => typeof item === "string" ? item.trim() : item).filter((item) => item !== "");
    return normalized.length === 0 ? undefined : normalized;
  },
  z.array(z.string().trim().min(1)).min(1).optional(),
);

export function hasMeaningfulContext(packet: Record<string, unknown>): boolean {
  return Object.values(packet).some((value) =>
    typeof value === "string"
      ? value.trim().length > 0
      : Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim().length > 0),
  );
}

export const ContextPacketFieldsSchema = z.object({
  summary: optionalText,
  /** Legacy freeform field retained so persisted Gate 2.6 packets remain readable. */
  context: optionalText,
  /** Legacy structured field retained for persisted packet compatibility. */
  problem: optionalText,
  expectedBehavior: optionalText,
  actualBehavior: optionalText,
  reproductionSteps: optionalList,
  evidence: optionalText,
  constraints: optionalList,
}).strict();

export const ContextPacketSchema = ContextPacketFieldsSchema.refine(
  hasMeaningfulContext,
  { message: "At least one context field is required." },
);

export type ContextPacket = z.infer<typeof ContextPacketSchema>;
