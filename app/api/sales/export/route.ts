import { requireSeller, toErrorResponse } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { formatDate, saleStatusLabel } from "@/lib/format";
import { saleFilters, saleWhere } from "@/lib/sales-query";

function cell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

/** CSV das vendas do vendedor logado, com os mesmos filtros da tela. */
export async function GET(request: Request) {
  try {
    const user = await requireSeller();
    const url = new URL(request.url);
    const filters = saleFilters({
      periodo: url.searchParams.get("periodo") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    const sales = await prisma.sale.findMany({
      where: saleWhere(user.id, filters),
      orderBy: { createdAt: "desc" },
      include: { product: true },
    });

    const lines = [
      ["Data", "Produto", "Comprador", "Valor", "Comissão da plataforma", "Status"].join(","),
      ...sales.map((sale) =>
        [
          formatDate(sale.createdAt),
          sale.product?.name ?? "",
          sale.buyerEmail ?? "",
          sale.amount.toFixed(2),
          sale.applicationFee.toFixed(2),
          saleStatusLabel(sale.status),
        ]
          .map((value) => cell(value))
          .join(","),
      ),
    ];

    return new Response(`\uFEFF${lines.join("\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"vendas-thesain26.csv\"",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
