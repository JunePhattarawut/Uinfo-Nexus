"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/welcome",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect("/login?error=1");
    }
    throw err;
  }
}

export async function googleSignInAction() {
  await signIn("google", { redirectTo: "/welcome" });
}
