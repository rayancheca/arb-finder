import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { OpportunityDetail } from "@/components/opportunity/OpportunityDetail";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const opp = await prisma.arbOpp.findUnique({
    where: { id },
    include: {
      event: { include: { sport: true } },
      bookA: true,
      bookB: true,
      boost: true,
      market: true,
    },
  });

  if (!opp) notFound();

  return <OpportunityDetail opp={opp} />;
}
