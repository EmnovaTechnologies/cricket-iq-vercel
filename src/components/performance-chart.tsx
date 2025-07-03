
'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, LabelList } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { PlayerRating, RatingValue } from '@/types';
// RATING_VALUES can be removed if not directly used, ratingValueToNumber handles mapping

interface PerformanceChartProps {
  ratings: PlayerRating[];
  skill: 'batting' | 'bowling' | 'fielding' | 'wicketKeeping';
  title: string;
  description?: string;
}

const chartRatingValueToNumber = (value?: RatingValue): number | null => {
  if (value === undefined || value === 'Not Rated' || value === 'Not Applicable' || value === 'NR' /* Legacy */) return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
};

export function PerformanceChart({ ratings, skill, title, description }: PerformanceChartProps) {
  const chartData = ratings.map((rating, index) => ({
    game: `Game ${index + 1}`, 
    score: chartRatingValueToNumber(rating[skill]),
  })).filter(item => item.score !== null);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No data available for this skill.</p>
        </CardContent>
      </Card>
    );
  }
  
  const chartConfig = {
    score: {
      label: skill.charAt(0).toUpperCase() + skill.slice(1) + " Score",
      color: 'hsl(var(--accent))',
    },
  } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="game" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dot" hideLabel />}
              />
              <Bar dataKey="score" fill="var(--color-score)" radius={4}>
                 <LabelList dataKey="score" position="top" offset={5} fontSize={12} fill="hsl(var(--foreground))" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
