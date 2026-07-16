"use client";
// ⚡ admin 관제 차트 — next/dynamic(ssr:false)로 지연 로드되는 recharts 청크. 출력은 원본과 100% 동일.
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

const GRADE_COLOR: Record<string, string> = { 검증: "#5f7355", 참고: "#9c6b3f", 후보: "#a8927a", 미합성: "#cbd5e1" };
const BAR = "#9c6b3f";

export function GradePie({ data }: { data: { grade: string; n: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={data} dataKey="n" nameKey="grade" cx="50%" cy="50%" innerRadius={42} outerRadius={70} paddingAngle={2}
          label={(e: any) => `${e.grade} ${e.n}`} labelLine={false} fontSize={11}>
          {data.map((g) => <Cell key={g.grade} fill={GRADE_COLOR[g.grade] ?? "#cbd5e1"} />)}
        </Pie><Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function RegionBar({ data }: { data: { region: string; n: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12 }}>
        <XAxis type="number" hide /><YAxis type="category" dataKey="region" width={70} tick={{ fontSize: 10, fill: "#57534e" }} />
        <Tooltip /><Bar dataKey="n" fill={BAR} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
