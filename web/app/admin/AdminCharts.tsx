"use client";
// ⚡ admin 관제 차트 — next/dynamic(ssr:false)로 지연 로드되는 recharts 청크. 출력은 원본과 100% 동일.
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

const GRADE_COLOR: Record<string, string> = { 검증: "#5f7355", 참고: "#9c6b3f", 후보: "#7a6750", 미합성: "#cbd5e1" };
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

// 📈 접속자 현황 전용 차트(2026-10-16, CEO "차트를 제대로") — 손으로 그린 div 막대를 recharts로 교체.
//   ssr:false 지연 로드라 초기 번들에 안 들어간다(기존 GradePie·RegionBar과 같은 청크 재사용).
import { LineChart, Line, Legend, CartesianGrid, AreaChart, Area } from "recharts";

const AXIS = { fontSize: 10, fill: "#57534e" };

/** 월별 사람 vs 봇 — 두 선을 겹쳐 "봇만 느는지"가 한눈에 보이게. */
export function MonthlyHumanBot({ data }: { data: { m: string; people: number; bots: number; repeat: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <LineChart data={data} margin={{ left: -14, right: 8, top: 6 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
        <XAxis dataKey="m" tick={AXIS} tickFormatter={(v: string) => v.slice(5) + "월"} />
        <YAxis tick={AXIS} />
        <Tooltip formatter={(v: any, k: any) => [Number(v).toLocaleString(), k]} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="people" name="사람" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="bots" name="봇" stroke="#a8a29e" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} />
        <Line type="monotone" dataKey="repeat" name="재방문" stroke="#15803d" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** 요일별 — 주말/평일 색을 갈라 패턴이 바로 읽히게. */
export function DowBar({ data }: { data: { label: string; people: number; weekend: boolean }[] }) {
  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={data} margin={{ left: -18, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} /><YAxis tick={AXIS} />
        <Tooltip formatter={(v: any) => [Number(v).toLocaleString(), "사람"]} />
        <Bar dataKey="people" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.weekend ? "#f59e0b" : "#0284c7"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** 시간대별 — 면적으로 피크 구간을 보이게. */
export function HourArea({ data }: { data: { h: number; people: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={150}>
      <AreaChart data={data} margin={{ left: -18, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
        <XAxis dataKey="h" tick={AXIS} tickFormatter={(v: number) => `${v}시`} interval={2} />
        <YAxis tick={AXIS} />
        <Tooltip labelFormatter={(v: any) => `${v}시`} formatter={(v: any) => [Number(v).toLocaleString(), "사람"]} />
        <Area type="monotone" dataKey="people" stroke="#44403c" fill="#d6d3d1" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** 지역 상위 N — 사람/봇을 나란히 두어 "봇만 긁는 지역"이 보이게. */
export function RegionHumanBot({ data }: { data: { region: string; people: number; bots: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 26)}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 14 }}>
        <XAxis type="number" tick={AXIS} />
        <YAxis type="category" dataKey="region" width={82} tick={{ fontSize: 10, fill: "#57534e" }} />
        <Tooltip formatter={(v: any, k: any) => [Number(v).toLocaleString(), k]} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="people" name="사람" fill="#0284c7" radius={[0, 4, 4, 0]} />
        <Bar dataKey="bots" name="봇" fill="#d6d3d1" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
