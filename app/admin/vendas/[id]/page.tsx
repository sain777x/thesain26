import { notFound } from "next/navigation";
import { SaleDetailView } from "@/components/sale-detail-view";
import { requireOwner } from "@/lib/guards";
import { loadSaleDetail } from "@/lib/sale-detail";

export const dynamic = "force-dynamic";

export default async function AdminSalePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  const { id } = await params;
  const detail = await loadSaleDetail(id, user);
  if (!detail) notFound();
  return <SaleDetailView detail={detail} backHref="/admin" />;
}
