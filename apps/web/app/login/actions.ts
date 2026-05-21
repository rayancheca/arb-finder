"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const ADMIN_COOKIE = "arb_admin";
const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

/**
 * Single-user admin login. Verifies the submitted token against
 * `process.env.ADMIN_TOKEN`. If `ADMIN_TOKEN` is not set, login always
 * fails — the app is fail-closed by design.
 *
 * On success, sets an httpOnly + sameSite=strict cookie and redirects
 * to the dashboard. On failure, redirects back to `/login?error=1`.
 */
export async function loginAction(formData: FormData): Promise<void> {
  const expected = process.env.ADMIN_TOKEN;
  const submitted = String(formData.get("token") ?? "");

  if (!expected || !submitted || submitted !== expected) {
    redirect("/login?error=1");
  }

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ONE_WEEK_SECONDS,
  });

  redirect("/");
}
