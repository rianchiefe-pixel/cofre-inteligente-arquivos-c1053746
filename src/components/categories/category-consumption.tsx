import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, PieChart as PieIcon, Trophy } from "lucide-react";

const PALETTE = [
  "#2563eb",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#6366f1",
  "#14b8a6",
  "#a855f7",
];

const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

type CategoryRow = {
  id: string;
  name: string;
  total_amount?: number | null;
  count?: number | null;
};

export function CategoryConsumption({ categories }: { categories: CategoryRow[] }) {
  const [topN, setTopN] = useState(10);

  const ranked = useMemo(
    () =>
      [...categories]
        .map((c) => ({
          id: c.id,
          name: c.name,
          total: Number(c.total_amount || 0),
          count: Number(c.count || 0),
        }))
        .filter((c) => c.total > 0)
        .sort((a, b) => b.total - a.total),
    [categories],
  );

  const grandTotal = useMemo(() => ranked.reduce((sum, c) => sum + c.total, 0), [ranked]);

  const chartData = useMemo(() => {
    const top = ranked.slice(0, topN).map((c, i) => ({
      ...c,
      color: PALETTE[i % PALETTE.length],
    }));
    const rest = ranked.slice(topN);
    if (rest.length) {
      top.push({
        id: "__others__",
        name: `Outras (${rest.length})`,
        total: rest.reduce((sum, c) => sum + c.total, 0),
        count: rest.reduce((sum, c) => sum + c.count, 0),
        color: "#94a3b8",
      });
    }
    return top;
  }, [ranked, topN]);

  if (!ranked.length) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Ainda não há lançamentos com valor para calcular o consumo por categoria.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <Trophy className="h-4 w-4 text-accent" /> Consumo por categoria
            </h3>
            <p className="text-sm text-muted-foreground">
              Total analisado: <span className="font-medium text-foreground">{brl(grandTotal)}</span> em{" "}
              {ranked.length} categorias com movimentação.
            </p>
          </div>
          <div className="flex gap-1">
            {[5, 10, 20].map((n) => (
              <Button
                key={n}
                size="sm"
                variant={topN === n ? "default" : "outline"}
                onClick={() => setTopN(n)}
              >
                Top {n}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-4 lg:col-span-3">
          <h4 className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <BarChart3 className="h-4 w-4" /> Ranking (maior para menor)
          </h4>
          <div style={{ height: Math.max(240, chartData.length * 38) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
                <XAxis type="number" tickFormatter={(v) => brl(Number(v))} hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  tick={{ fontSize: 12 }}
                  interval={0}
                />
                <Tooltip
                  formatter={(v: number) => brl(Number(v))}
                  labelFormatter={(l) => String(l)}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.id} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h4 className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <PieIcon className="h-4 w-4" /> Participação no total
          </h4>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="total" nameKey="name" innerRadius={55} outerRadius={95}>
                  {chartData.map((entry) => (
                    <Cell key={entry.id} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => brl(Number(v))} contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="divide-y">
        {chartData.map((item, index) => {
          const share = grandTotal ? (item.total / grandTotal) * 100 : 0;
          return (
            <div key={item.id} className="flex items-center gap-3 p-3">
              <span className="w-6 text-center text-xs font-bold text-muted-foreground">
                {item.id === "__others__" ? "—" : index + 1}
              </span>
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  <span className="font-mono text-xs">{brl(item.total)}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${share}%`, backgroundColor: item.color }}
                  />
                </div>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {share.toFixed(1)}% · {item.count} lanç.
              </Badge>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
