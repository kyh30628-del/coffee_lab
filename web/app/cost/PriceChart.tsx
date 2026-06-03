"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

type Point = { date: string; coffee_c: number; usd_krw: number };

export default function PriceChart({ points }: { points: Point[] }) {
  if (!points || points.length === 0) {
    return <p className="text-stone-600 text-sm">시계열 데이터가 아직 없습니다.</p>;
  }
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#292524" />
          <XAxis dataKey="date" stroke="#78716c" fontSize={11} tickMargin={8} />
          <YAxis yAxisId="left" stroke="#fbbf24" fontSize={11}
                 domain={["auto", "auto"]} width={48}
                 label={{ value: "Coffee C $/lb", angle: -90, position: "insideLeft", fill: "#78716c", fontSize: 10 }} />
          <YAxis yAxisId="right" orientation="right" stroke="#60a5fa" fontSize={11}
                 domain={["auto", "auto"]} width={56} />
          <Tooltip
            contentStyle={{ background: "#1c1917", border: "1px solid #44403c", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#e7e5e4" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line yAxisId="left" type="monotone" dataKey="coffee_c" name="Coffee C ($/lb)"
                stroke="#fbbf24" strokeWidth={2} dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="usd_krw" name="환율 (원/$)"
                stroke="#60a5fa" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
