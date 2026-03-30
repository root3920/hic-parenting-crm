'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface DonutChartProps {
  data: { name: string; value: number; color: string }[]
  innerRadius?: number
  outerRadius?: number
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-md px-3 py-2">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{payload[0].name}</p>
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {payload[0].value.toLocaleString()}
        </p>
      </div>
    )
  }
  return null
}

export function DonutChart({
  data,
  innerRadius = 55,
  outerRadius = 85,
}: DonutChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => (
            <span className="text-xs text-zinc-600 dark:text-zinc-400">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
