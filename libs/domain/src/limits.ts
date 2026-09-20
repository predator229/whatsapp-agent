import { z } from 'zod'

export const LimitsSchema = z.object({
  maxRepliesPerMonth: z.number().int().positive().default(1000),
  maxReplyChars: z.number().int().min(80).max(1000).default(320),
})

export type Limits = z.infer<typeof LimitsSchema>
