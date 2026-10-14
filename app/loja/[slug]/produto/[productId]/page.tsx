import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProdutoPage({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  const { slug, productId } = await params;
  const listed = await prisma.product.findFirst({
    where: {
      id: productId,
      active: true,
      store: { slug, published: true },
    },
    select: { id: true },
  });
  if (!listed) notFound();
  redirect(`/checkout/${listed.id}`);
}
