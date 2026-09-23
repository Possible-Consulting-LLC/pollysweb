import { z } from "zod";
import { newPasswordSchema } from "./password-policy";

export const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().optional(),
});

const registrationSchema = authSchema.extend({
  password: newPasswordSchema,
  confirmPassword: z.string().min(1, "Confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don’t match.",
  path: ["confirmPassword"],
});

export function parseRegistration(input: unknown) {
  return registrationSchema.safeParse(input);
}
