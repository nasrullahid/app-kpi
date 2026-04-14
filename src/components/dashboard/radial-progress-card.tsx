"use client"

import {
  Label,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
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
}

export function RadialProgressCard({
  title,
  percentage,
  displayValue,
  displayTarget,
  unitLabel,
  color,
  className
}: RadialProgressCardProps) {
  
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
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[180px]"
        >
          <RadialBarChart
            data={chartData}
            startAngle={90}
            endAngle={90 - (3.6 * Math.min(percentage, 100))}
            innerRadius={70}
            outerRadius={100}
          >
            <PolarGrid
              gridType="circle"
              radialLines={false}
              stroke="none"
              className="first:fill-slate-100 last:fill-white"
              polarRadius={[70, 100]}
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
                          className="fill-slate-800 text-3xl font-black"
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
        </ChartContainer>
      </CardContent>
      <div className="px-5 pb-5 pt-0 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-sm font-black text-slate-700">{displayValue}</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
            Target: {displayTarget} {unitLabel}
          </span>
        </div>
      </div>
    </Card>
  )
}
