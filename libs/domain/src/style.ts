import { z } from 'zod'

export const StyleProfileSchema = z.object({
  tone: z.enum(['chaleureux', 'direct', 'formel']),
  greeting: z.string().min(1),
  signoff: z.string().min(1),
  languageMix: z.object({
    primary: z.literal('fr'),
    secondary: z.enum(['fon', 'yoruba', 'en']).optional(),
    ratio: z.number().min(0).max(1),
  }),
  emojiLevel: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  addressForm: z.enum(['tu', 'vous']),
  examples: z.array(z.object({ customer: z.string().min(1), merchant: z.string().min(1) })).min(3).max(10),
  fallbacks: z.array(z.string().min(1)).min(2),
})

export type StyleProfile = z.infer<typeof StyleProfileSchema>
