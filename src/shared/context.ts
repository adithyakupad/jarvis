import { z } from "zod";

const optionalText = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);
const optionalList = z.preprocess(
  (value) => Array.isArray(value) ? value.map((item) => typeof item === "string" ? item.trim() : item).filter((item) => item !== "") : value,
  z.array(z.string().trim().min(1)).min(1).optional(),
);

export const ContextPacketFieldsSchema = z.object({
  context: optionalText,
  problem: optionalText,
  expectedBehavior: optionalText,
  actualBehavior: optionalText,
  reproductionSteps: optionalList,
  evidence: optionalText,
  constraints: optionalList,
}).strict();

export const ContextPacketSchema = ContextPacketFieldsSchema.refine(
  (packet) => Object.values(packet).some((value) => value !== undefined),
  { message: "At least one context field is required." },
);

export type ContextPacket = z.infer<typeof ContextPacketSchema>;
