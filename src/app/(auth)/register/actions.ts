"use server";

import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { registerSchema, registerUser } from "@/modules/auth/service";

export async function registerAction(formData: FormData) {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect(`/register?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }

  try {
    await registerUser(parsed.data);
  } catch (err) {
    if (err instanceof AppError) {
      redirect(`/register?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
  redirect("/login?registered=1");
}
