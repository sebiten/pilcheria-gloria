import { z } from "zod";

export const productInterestSchema = z.object({
  visitorId: z.string().uuid(),
  choices: z.array(z.enum(["dress_pants", "skirts", "socks"]))
    .min(1).max(2)
    .refine((choices) => new Set(choices).size === choices.length),
  placement: z.enum(["home", "catalog", "product"]),
}).strict();
