import { formatMoney } from "@/lib/format";

export type SalesPoint = {
  key: string;
  label: string;
  total: number;
};

export function buildSalesSeries(
  sales: { createdAt: Date; amount: number }[],
  days: number,
): SalesPoint[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const points: SalesPoint[] = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    const label =
      days <= 7
        ? new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date)
        : String(date.getDate());
    return { key, label, total: 0 };
  });
  const byKey = new Map(points.map((point) => [point.key, point]));
  for (const sale of sales) {
    const key = sale.createdAt.toISOString().slice(0, 10);
    const point = byKey.get(key);
    if (point) point.total += sale.amount;
  }
  return points;
}

export function SalesChart({
  points,
  currency,
}: {
  points: SalesPoint[];
  currency: string;
}) {
  const max = Math.max(...points.map((point) => point.total), 1);
  return (
    <div className="flex h-36 items-end gap-1">
      {points.map((point) => (
        <div key={point.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div className="flex h-28 w-full items-end">
            <div
              title={`${point.label}: ${formatMoney(point.total, currency)}`}
              className="w-full rounded-sm bg-primary/80"
              style={{
                height: `${Math.max(4, (point.total / max) * 100)}%`,
                opacity: point.total > 0 ? 1 : 0.35,
              }}
            />
          </div>
          <span className="truncate text-[10px] text-muted-foreground">{point.label}</span>
        </div>
      ))}
    </div>
  );
}
