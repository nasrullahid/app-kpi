"use client"

import {
  Label,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
  PieChart,
  Pie,
  Cell,
} from "recharts"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"

interface BreakdownItem {
  name: string
  value: number
  color: string
}

interface RadialProgressCardProps {
  title: string
  value: number
  target: number
  percentage: number
  displayValue: string
  displayTarget: string
  unitLabel: string
  color: string
  className?: string
  breakdown?: BreakdownItem[]
}

export function RadialProgressCard({
  title,
  value,
  target,
  percentage,
  displayValue,
  displayTarget,
  unitLabel,
  color,
  className,
  breakdown
}: RadialProgressCardProps) {
  
  // Data for the Donut Chart (Breakdown)
  // We include a "Remaining" segment if target is not reached
  const remaining = Math.max(0, target - value)
  
  const pieData = breakdown && breakdown.length > 0 
    ? [
        ...breakdown,
        ...(remaining > 0 ? [{ name: "Sisa Target", value: remaining, color: "#f1f5f9", isRemaining: true }] : [])
      ]
    : []

  const chartData = [
    { name: "progress", value: Math.min(percentage, 100), fill: color },
  ]

  const chartConfig = {
    value: {
      label: title,
    },
    progress: {
      label: "Progress",
      color: color,
    },
  } satisfies ChartConfig

  return (
    <Card className={cn("flex flex-col shadow-sm border-slate-200", className)}>
      <CardHeader className="items-center pb-0">
        <CardTitle className="text-xs font-black text-slate-400 uppercase tracking-widest">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col items-center justify-center pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square w-full max-w-[250px] min-h-[240px]"
        >
          {breakdown && breakdown.length > 0 ? (
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={65}
                outerRadius={95}
                strokeWidth={2}
                stroke="#fff"
                paddingAngle={2}
                startAngle={90}
                endAngle={-270}
              >
                {pieData.map((entry, index) => (
                   <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="fill-slate-800 text-2xl sm:text-3xl font-black"
                          >
                            {percentage.toFixed(0)}%
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 20}
                            className="fill-slate-400 text-[10px] font-bold uppercase tracking-widest"
                          >
                            Tercapai
                          </tspan>
                        </text>
                      )
                    }
                  }}
                />
              </Pie>
            </PieChart>
          ) : (
            <RadialBarChart
              data={chartData}
              startAngle={90}
              endAngle={-270}
              innerRadius={65}
              outerRadius={95}
            >
              <PolarAngleAxis
                type="number"
                domain={[0, 100]}
                angleAxisId={0}
                tick={false}
              />
              <PolarGrid
                gridType="circle"
                radialLines={false}
                stroke="none"
                className="first:fill-slate-100 last:fill-slate-50"
                polarRadius={[65, 95]}
              />
              <RadialBar 
                dataKey="value" 
                background={{ fill: '#f1f5f9' }} 
                cornerRadius={10} 
              />
              <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="fill-slate-800 text-2xl sm:text-3xl font-black"
                          >
                            {percentage.toFixed(0)}%
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 20}
                            className="fill-slate-400 text-[10px] font-bold uppercase tracking-widest"
                          >
                            Tercapai
                          </tspan>
                        </text>
                      )
                    }
                  }}
                />
              </PolarRadiusAxis>
            </RadialBarChart>
          )}
        </ChartContainer>
      </CardContent>

      <div className="px-5 pb-5 pt-0">
        <div className="flex flex-col items-center gap-0.5 border-b border-slate-100 pb-4 mb-4">
          <span className="text-sm font-black text-slate-800">{displayValue}</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter text-center">
            Target: {displayTarget} {unitLabel}
          </span>
        </div>

        {breakdown && breakdown.length > 0 && (
          <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
            {breakdown.map((item, i) => {
              const itemPct = target > 0 ? (item.value / target) * 100 : 0
              return (
                <div key={i} className="flex items-center justify-between gap-3 group/item">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-[10px] font-bold text-slate-600 truncate group-hover/item:text-slate-900 transition-colors">
                      {item.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-black text-slate-700">
                      {item.value >= 1000000 ? `${(item.value/1000000).toFixed(1)}jt` : item.value.toLocaleString()}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 w-7 text-right">
                      {itemPct.toFixed(0)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}
