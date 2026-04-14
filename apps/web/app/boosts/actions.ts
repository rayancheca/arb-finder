"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";

const BoostTypeEnum = z.enum([
  "free_bet",
  "no_sweat",
  "site_credit",
  "profit_boost",
]);

export const BoostInputSchema = z.object({
  bookId: z.string().min(1, "Pick a book"),
  type: BoostTypeEnum,
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(120, "Title too long"),
  description: z.string().max(500).optional().nullable(),
  amount: z
    .number()
    .positive("Amount must be > 0")
    .max(100_000, "Amount too large"),
  cashRate: z
    .number()
    .min(0, "Cash rate must be ≥ 0")
    .max(1, "Cash rate must be ≤ 1")
    .optional()
    .nullable(),
  activeTo: z.string().datetime().optional().nullable(),
  eventId: z.string().optional().nullable(),
});

export type BoostInput = z.infer<typeof BoostInputSchema>;

interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function parseFormToInput(formData: FormData): BoostInput {
  const rawCashRate = formData.get("cashRate");
  const rawActiveTo = formData.get("activeTo");
  return {
    bookId: String(formData.get("bookId") ?? ""),
    type: String(formData.get("type") ?? "") as BoostInput["type"],
    title: String(formData.get("title") ?? ""),
    description: (formData.get("description") as string | null) || null,
    amount: Number(formData.get("amount") ?? 0),
    cashRate:
      rawCashRate && rawCashRate !== ""
        ? Number(rawCashRate)
        : null,
    activeTo:
      rawActiveTo && rawActiveTo !== ""
        ? new Date(String(rawActiveTo)).toISOString()
        : null,
    eventId: (formData.get("eventId") as string | null) || null,
  };
}

function flattenErrors(
  error: z.ZodError,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function newBoostId(): string {
  return `boost_${Math.random().toString(36).slice(2, 14)}`;
}

export async function createBoost(formData: FormData): Promise<ActionResult> {
  const parsed = BoostInputSchema.safeParse(parseFormToInput(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: flattenErrors(parsed.error) };
  }
  const data = parsed.data;

  try {
    await prisma.boost.create({
      data: {
        id: newBoostId(),
        bookId: data.bookId,
        type: data.type,
        title: data.title,
        description: data.description ?? null,
        amount: data.amount,
        cashRate: data.cashRate ?? null,
        activeTo: data.activeTo ? new Date(data.activeTo) : null,
        eventId: data.eventId ?? null,
        active: true,
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error creating boost",
    };
  }

  revalidatePath("/boosts");
  revalidatePath("/");
  return { ok: true };
}

export async function updateBoost(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing boost id" };
  const parsed = BoostInputSchema.safeParse(parseFormToInput(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: flattenErrors(parsed.error) };
  }
  const data = parsed.data;

  try {
    await prisma.boost.update({
      where: { id },
      data: {
        bookId: data.bookId,
        type: data.type,
        title: data.title,
        description: data.description ?? null,
        amount: data.amount,
        cashRate: data.cashRate ?? null,
        activeTo: data.activeTo ? new Date(data.activeTo) : null,
        eventId: data.eventId ?? null,
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error updating boost",
    };
  }

  revalidatePath("/boosts");
  revalidatePath("/");
  return { ok: true };
}

export async function toggleBoostActive(
  id: string,
  nextActive: boolean,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing boost id" };
  try {
    await prisma.boost.update({
      where: { id },
      data: { active: nextActive },
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
  revalidatePath("/boosts");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteBoost(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing boost id" };
  try {
    // Null-out any arb opps that reference this boost before delete so FK
    // relations don't block us. (The Prisma relation is optional already.)
    await prisma.arbOpp.updateMany({
      where: { boostId: id },
      data: { boostId: null, boostType: "standard" },
    });
    await prisma.boost.delete({ where: { id } });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
  revalidatePath("/boosts");
  revalidatePath("/");
  return { ok: true };
}
