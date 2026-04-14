"use client";

import { useTransition } from "react";
import { deleteBoost, toggleBoostActive } from "@/app/boosts/actions";
import { Button } from "@/components/ui/Button";

interface Props {
  readonly id: string;
  readonly active: boolean;
}

export function BoostRowActions({ id, active }: Props) {
  const [isPending, start] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={active ? "ghost" : "primary"}
        disabled={isPending}
        onClick={() =>
          start(async () => {
            await toggleBoostActive(id, !active);
          })
        }
      >
        {active ? "Disable" : "Enable"}
      </Button>
      <Button
        size="sm"
        variant="danger"
        disabled={isPending}
        onClick={() =>
          start(async () => {
            if (confirm("Delete this boost permanently?")) {
              await deleteBoost(id);
            }
          })
        }
      >
        Delete
      </Button>
    </div>
  );
}
