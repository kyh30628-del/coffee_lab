"use client";
// ⚡ recharts 차트 묶음 — owner 화면에서 next/dynamic(ssr:false)로 지연 로드되는 청크.
//   차트 JSX/스타일은 원본(app/owner/page.tsx)에서 그대로 옮긴 것 — 출력 100% 동일. 데이터는 props로 받는다.
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
  PieChart, Pie, Tooltip, AreaChart, Area, CartesianGrid } from "recharts";

const PIE_COLORS = ["#9c6b3f", "#5f7355", "#c8893f", "#6f4e37", "#c97a6d", "#a8927a"];

// 레이더 축 라벨: 길면 두 줄로 쪼개 잘림 방지
function RadarTick({ x, y, textAnchor, payload }: any) {
  const v = String(payload?.value ?? "");
  let lines = [v];
  if (v.includes(" ")) lines = v.split(" ");
  else if (v.length > 4) { const h = Math.ceil(v.length / 2); lines = [v.slice(0, h), v.slice(h)]; }
  return (
    <text x={x} y={y} textAnchor={textAnchor} fill="#52402e" fontSize={11} fontWeight={600}>
      {lines.map((ln, i) => <tspan key={i} x={x} dy={i === 0 ? (lines.length > 1 ? -2 : 4) : 12}>{ln}</tspan>)}
    </text>
  );
}

export function RankChart({ data }: { data: { name: string; count: number; isMe: boolean }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(data.length * 34, 200)}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
        <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "#52402e" }} />
        <Tooltip cursor={{ fill: "#f4ece0" }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>{data.map((e, i) => <Cell key={i} fill={e.isMe ? "#9c6b3f" : "#d8c3a0"} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RadarChartBox({ data }: { data: { axis: string; 우리카페: number; 동네평균: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <RadarChart data={data} margin={{ top: 16, right: 36, bottom: 16, left: 36 }} outerRadius="66%">
        <PolarGrid stroke="#e3d6c2" />
        <PolarAngleAxis dataKey="axis" tick={<RadarTick />} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tickCount={3} tick={{ fontSize: 9, fill: "#bcab92" }} axisLine={false} />
        <Radar name="동네평균" dataKey="동네평균" stroke="#a8927a" strokeWidth={2} fill="#a8927a" fillOpacity={0.2} dot={{ r: 2.5, fill: "#a8927a" }} />
        <Radar name="우리카페" dataKey="우리카페" stroke="#9c6b3f" strokeWidth={2} fill="#9c6b3f" fillOpacity={0.4} dot={{ r: 2.5, fill: "#9c6b3f" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export function CompPie({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2}>
          {data.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CadenceChart({ months }: { months: { ym: string; label: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={170}>
      <AreaChart data={months} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
        <defs><linearGradient id="cad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9c6b3f" stopOpacity={0.5} /><stop offset="100%" stopColor="#9c6b3f" stopOpacity={0.05} /></linearGradient></defs>
        <CartesianGrid stroke="#f0e6d4" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8a7458" }} interval={1} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#a8927a" }} axisLine={false} tickLine={false} width={28} />
        <Tooltip cursor={{ stroke: "#cbb89f" }} formatter={(v: any) => [`${v}건`, "리뷰"]} />
        <Area type="monotone" dataKey="count" stroke="#9c6b3f" strokeWidth={2} fill="url(#cad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
