"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState, useTransition } from "react";
import { createBoost, updateBoost } from "@/app/boosts/actions";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface BookLite {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

interface BoostInitial {
  readonly id: string;
  readonly bookId: string;
  readonly type: string;
  readonly title: string;
  readonly description: string | null;
  readonly amount: number;
  readonly cashRate: number | null;
  readonly activeTo: string | null;
}

interface Props {
  readonly books: ReadonlyArray<BookLite>;
  readonly mode: "create" | "edit";
  readonly initial?: BoostInitial;
  readonly trigger: React.ReactNode;
}

const BOOST_TYPES: ReadonlyArray<{ value: string; label: string; hint: string }> = [
  { value: "free_bet", label: "Free bet", hint: "Stake not returned" },
  { value: "no_sweat", label: "No sweat", hint: "Refund if first bet loses" },
  { value: "site_credit", label: "Site credit", hint: "Dollar credit" },
  { value: "profit_boost", label: "Profit boost", hint: "% uplift" },
];

export function BoostFormDialog({ books, mode, initial, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result =
        mode === "edit" && initial
          ? await updateBoost(initial.id, formData)
          : await createBoost(formData);
      if (result.ok) {
        setOpen(false);
      } else {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        if (result.error) setFormError(result.error);
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-bg/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-border bg-surface shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="flex items-start justify-between border-b border-border p-5">
            <div>
              <Dialog.Title className="text-[18px] font-semibold tracking-tight">
                {mode === "edit" ? "Edit boost" : "New boost"}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-text-dim">
                Promos apply to the arb engine as a multiplier on the side you
                place them on.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="rounded-md p-1 text-text-faint hover:bg-surface-raised hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <form
            action={handleSubmit}
            className="flex flex-col gap-4 p-5"
            noValidate
          >
            <Field
              label="Book"
              error={errors.bookId}
              htmlFor="boost-book"
            >
              <select
                id="boost-book"
                name="bookId"
                defaultValue={initial?.bookId ?? books[0]?.id}
                className="rounded-md border border-border bg-surface-raised px-3 py-2 text-[13px] outline-none focus:border-accent"
              >
                {books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Type" error={errors.type} htmlFor="boost-type">
              <select
                id="boost-type"
                name="type"
                defaultValue={initial?.type ?? "free_bet"}
                className="rounded-md border border-border bg-surface-raised px-3 py-2 text-[13px] outline-none focus:border-accent"
              >
                {BOOST_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} — {t.hint}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Title" error={errors.title} htmlFor="boost-title">
              <input
                id="boost-title"
                name="title"
                type="text"
                defaultValue={initial?.title}
                placeholder="$100 no-sweat first bet"
                className="rounded-md border border-border bg-surface-raised px-3 py-2 text-[13px] outline-none focus:border-accent"
              />
            </Field>

            <Field
              label="Description"
              error={errors.description}
              htmlFor="boost-desc"
            >
              <textarea
                id="boost-desc"
                name="description"
                defaultValue={initial?.description ?? ""}
                rows={2}
                placeholder="Optional — terms, restrictions, fine print"
                className="rounded-md border border-border bg-surface-raised px-3 py-2 text-[13px] outline-none focus:border-accent resize-none"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Amount ($)"
                error={errors.amount}
                htmlFor="boost-amount"
              >
                <input
                  id="boost-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  defaultValue={initial?.amount ?? 100}
                  className="mono-num rounded-md border border-border bg-surface-raised px-3 py-2 text-[13px] outline-none focus:border-accent"
                />
              </Field>

              <Field
                label="Cash rate (0–1)"
                error={errors.cashRate}
                hint="Only needed for no-sweat"
                htmlFor="boost-rate"
              >
                <input
                  id="boost-rate"
                  name="cashRate"
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  defaultValue={initial?.cashRate ?? ""}
                  placeholder="0.65"
                  className="mono-num rounded-md border border-border bg-surface-raised px-3 py-2 text-[13px] outline-none focus:border-accent"
                />
              </Field>
            </div>

            <Field
              label="Expires"
              error={errors.activeTo}
              hint="Optional — leave blank for no expiration"
              htmlFor="boost-expires"
            >
              <input
                id="boost-expires"
                name="activeTo"
                type="datetime-local"
                defaultValue={
                  initial?.activeTo
                    ? new Date(initial.activeTo).toISOString().slice(0, 16)
                    : ""
                }
                className="mono-num rounded-md border border-border bg-surface-raised px-3 py-2 text-[13px] outline-none focus:border-accent"
              />
            </Field>

            {formError && (
              <p className="text-[12px] text-loss" role="alert">
                {formError}
              </p>
            )}

            <div className="mt-2 flex items-center justify-end gap-2 border-t border-border pt-4">
              <Dialog.Close asChild>
                <Button size="sm" variant="ghost" type="button">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                size="sm"
                variant="primary"
                type="submit"
                disabled={isPending}
              >
                {isPending
                  ? "Saving…"
                  : mode === "edit"
                    ? "Save changes"
                    : "Create boost"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface FieldProps {
  readonly label: string;
  readonly htmlFor: string;
  readonly hint?: string;
  readonly error?: string;
  readonly children: React.ReactNode;
}

function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-dim"
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-[11px] text-text-faint">{hint}</p>
      )}
      {error && (
        <p className="text-[11px] text-loss" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
