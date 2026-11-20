import React, { useState } from 'react';
import { WeightLog } from '../types';
import { formatDateBR } from '../utils/nutrition';

export function WeightEvolutionChart({
  data,
  targetWeight,
}: {
  data: WeightLog[];
  targetWeight: number;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-[#DCECE6] bg-[#F4FAF7] text-sm text-[#648482]">
        Registre seu peso para visualizar a curva de evolução.
      </div>
    );
  }

  const width = 620;
  const height = 220;
  const padL = 44;
  const padR = 20;
  const padT = 20;
  const padB = 34;

  const weights = data.map((d) => Number(d.weight_kg));
  const minVal = Math.min(...weights, targetWeight) - 1.5;
  const maxVal = Math.max(...weights, targetWeight) + 1.5;
  const range = Math.max(2, maxVal - minVal);

  const getX = (idx: number) =>
    data.length === 1
      ? padL + (width - padL - padR) / 2
      : padL + (idx / (data.length - 1)) * (width - padL - padR);

  const getY = (val: number) =>
    padT + (1 - (val - minVal) / range) * (height - padT - padB);

  const points = data.map((d, idx) => ({
    x: getX(idx),
    y: getY(Number(d.weight_kg)),
    item: d,
  }));

  const polylineStr = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaStr = `M ${points[0].x},${height - padB} L ${points
    .map((p) => `${p.x},${p.y}`)
    .join(' L ')} L ${points[points.length - 1].x},${height - padB} Z`;

  const targetY = getY(targetWeight);
  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const val = minVal + (1 - t) * range;
    const y = padT + t * (height - padT - padB);
    return { val, y };
  });

  const activePoint = hoverIndex !== null ? points[hoverIndex] : points[points.length - 1];

  return (
    <div className="relative">
      <div className="mb-3 flex items-center justify-between text-xs text-[#5C7B79]">
        <span>
          Último registro:{' '}
          <strong className="font-mono text-[#0F2A2A] tabular-nums">
            {activePoint.item.weight_kg.toFixed(1)} kg
          </strong>{' '}
          ({formatDateBR(activePoint.item.date)})
        </span>
        <span className="font-mono font-medium tabular-nums text-[#0C947E]">
          Meta: {targetWeight.toFixed(1)} kg
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-56 w-full overflow-visible"
        role="img"
        aria-label="Gráfico de evolução do peso corporal"
      >
        <defs>
          <linearGradient id="weightAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#12BFA3" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#12BFA3" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {gridTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={padL}
              y1={tick.y}
              x2={width - padR}
              y2={tick.y}
              stroke="rgba(15,42,42,0.08)"
              strokeWidth="1"
            />
            <text
              x={padL - 8}
              y={tick.y + 4}
              textAnchor="end"
              className="fill-[#648482] font-mono text-[10px]"
            >
              {tick.val.toFixed(1)}
            </text>
          </g>
        ))}

        <line
          x1={padL}
          y1={targetY}
          x2={width - padR}
          y2={targetY}
          stroke="#12BFA3"
          strokeOpacity="0.6"
          strokeDasharray="4 4"
          strokeWidth="1.5"
        />

        {points.length > 1 && <path d={areaStr} fill="url(#weightAreaGrad)" />}
        {points.length > 1 && (
          <polyline
            fill="none"
            stroke="#12BFA3"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylineStr}
          />
        )}

        {points.map((p, idx) => {
          const isActive = hoverIndex === idx || (hoverIndex === null && idx === points.length - 1);
          return (
            <g
              key={p.item.id || idx}
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
              onClick={() => setHoverIndex((prev) => (prev === idx ? null : idx))}
              className="cursor-pointer"
            >
              <circle cx={p.x} cy={p.y} r="14" fill="transparent" />
              <circle
                cx={p.x}
                cy={p.y}
                r={isActive ? 5.5 : 3.5}
                fill={isActive ? '#12BFA3' : '#FFFFFF'}
                stroke="#12BFA3"
                strokeWidth="2"
              />
              {(idx === 0 || idx === points.length - 1 || points.length <= 8) && (
                <text
                  x={p.x}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-[#648482] font-mono text-[10px]"
                >
                  {formatDateBR(p.item.date).slice(0, 5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function WeeklyCaloriesChart({
  data,
}: {
  data: Array<{ date: string; label: string; consumed: number; burned: number; target: number }>;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return null;
  }

  const width = 620;
  const height = 220;
  const padL = 44;
  const padR = 16;
  const padT = 18;
  const padB = 34;

  const maxCal = Math.max(
    ...data.map((d) => Math.max(d.consumed, d.target)),
    2200
  );

  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const slotW = innerW / data.length;
  const barW = Math.min(28, slotW * 0.42);

  const targetVal = data[0]?.target || 2000;
  const targetY = padT + (1 - targetVal / maxCal) * innerH;
  const hovered = hoverIdx !== null ? data[hoverIdx] : data[data.length - 1];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#5C7B79]">
        <span>
          {hovered.label.toUpperCase()} ({formatDateBR(hovered.date).slice(0, 5)}):{' '}
          <strong className="font-mono text-[#0F2A2A] tabular-nums">{hovered.consumed} kcal</strong> ingeridas
          {hovered.burned > 0 ? ` · ${hovered.burned} kcal queimadas` : ''}
        </span>
        <span className="font-mono tabular-nums text-[#5C7B79]">Meta: {targetVal} kcal</span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-56 w-full overflow-visible"
        role="img"
        aria-label="Gráfico semanal de calorias ingeridas e queimadas"
      >
        {[0, 0.5, 1].map((t, idx) => {
          const val = Math.round(maxCal * (1 - t));
          const y = padT + t * innerH;
          return (
            <g key={idx}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke="rgba(15,42,42,0.08)"
                strokeWidth="1"
              />
              <text x={padL - 8} y={y + 4} textAnchor="end" className="fill-[#648482] font-mono text-[10px]">
                {val}
              </text>
            </g>
          );
        })}

        <line
          x1={padL}
          y1={targetY}
          x2={width - padR}
          y2={targetY}
          stroke="#12BFA3"
          strokeOpacity="0.55"
          strokeDasharray="4 4"
          strokeWidth="1.5"
        />

        {data.map((d, idx) => {
          const cx = padL + idx * slotW + slotW / 2;
          const barH = Math.max(3, (d.consumed / maxCal) * innerH);
          const barY = padT + innerH - barH;
          const burnedH = d.burned > 0 ? Math.max(3, (d.burned / maxCal) * innerH) : 0;
          const burnedY = padT + innerH - burnedH;
          const isHovered = hoverIdx === idx;
          const overTarget = d.consumed > d.target * 1.08;

          return (
            <g
              key={d.date}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
              onClick={() => setHoverIdx((prev) => (prev === idx ? null : idx))}
              className="cursor-pointer"
            >
              <rect x={cx - slotW / 2} y={padT} width={slotW} height={innerH} fill="transparent" />
              <rect
                x={cx - barW / 2 - (burnedH > 0 ? 5 : 0)}
                y={barY}
                width={barW}
                height={barH}
                rx="6"
                fill={overTarget ? '#F59E2D' : '#12BFA3'}
                fillOpacity={isHovered ? 1 : 0.9}
              />
              {burnedH > 0 && (
                <rect
                  x={cx + barW / 2 - 3}
                  y={burnedY}
                  width={8}
                  height={burnedH}
                  rx="4"
                  fill="#FF9F2E"
                  fillOpacity={isHovered ? 1 : 0.9}
                />
              )}
              <text
                x={cx}
                y={height - 10}
                textAnchor="middle"
                className={`font-mono text-[10px] ${isHovered ? 'fill-[#0F2A2A] font-semibold' : 'fill-[#648482]'}`}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function CalorieProgressRing({
  consumed,
  target,
}: {
  consumed: number;
  target: number;
}) {
  const rawPct = target > 0 ? Math.round((consumed / target) * 100) : 0;
  const pct = Math.min(100, rawPct);
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  const remaining = Math.max(0, target - consumed);

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-28 w-28 shrink-0">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="#E5F1EC"
            strokeWidth="10"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={consumed > target * 1.08 ? '#F59E2D' : '#12BFA3'}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-bold text-[#0F2A2A] tabular-nums">{rawPct}%</span>
          <span className="text-[11px] text-[#648482]">da meta</span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="font-mono text-2xl font-bold text-[#0F2A2A] tabular-nums">
          {consumed.toLocaleString('pt-BR')} <span className="text-sm font-normal text-[#648482]">/ {target.toLocaleString('pt-BR')} kcal</span>
        </div>
        <p className="text-sm text-[#4B6B68]">
          {consumed <= target
            ? `Restam ${remaining.toLocaleString('pt-BR')} kcal disponíveis hoje`
            : `${(consumed - target).toLocaleString('pt-BR')} kcal acima da meta diária`}
        </p>
      </div>
    </div>
  );
}

export function WeeklyWorkoutBarChart({
  data,
}: {
  data: Array<{ date: string; label: string; minutes: number; calories: number; sessions: number }>;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (!data.length) return null;

  const width = 560;
  const height = 190;
  const padL = 36;
  const padR = 14;
  const padT = 16;
  const padB = 30;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const maxMin = Math.max(...data.map((d) => d.minutes), 30);
  const slotW = innerW / data.length;
  const barW = Math.min(28, slotW * 0.48);
  const active = hoverIdx !== null ? data[hoverIdx] : data[data.length - 1];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#5C7B79]">
        <span>
          {active.label.toUpperCase()} ({formatDateBR(active.date).slice(0, 5)}):{' '}
          <strong className="font-mono text-[#0F2A2A] tabular-nums">{active.minutes} min</strong> ·{' '}
          <span className="font-mono font-medium text-[#D97706] tabular-nums">{active.calories} kcal</span>
        </span>
        <span className="font-mono text-[#648482] tabular-nums">
          {active.sessions} {active.sessions === 1 ? 'treino' : 'treinos'}
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full overflow-visible" role="img" aria-label="Gráfico semanal de treinos">
        {[0, 0.5, 1].map((t, i) => {
          const val = Math.round(maxMin * (1 - t));
          const y = padT + t * innerH;
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="rgba(15,42,42,0.08)" strokeWidth="1" />
              <text x={padL - 8} y={y + 4} textAnchor="end" className="fill-[#648482] font-mono text-[10px]">
                {val}m
              </text>
            </g>
          );
        })}

        {data.map((d, idx) => {
          const cx = padL + idx * slotW + slotW / 2;
          const barH = d.minutes > 0 ? Math.max(5, (d.minutes / maxMin) * innerH) : 3;
          const y = padT + innerH - barH;
          const isHovered = hoverIdx === idx;
          return (
            <g
              key={d.date}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
              onClick={() => setHoverIdx((prev) => (prev === idx ? null : idx))}
              className="cursor-pointer"
            >
              <rect x={cx - slotW / 2} y={padT} width={slotW} height={innerH} fill="transparent" />
              <rect
                x={cx - barW / 2}
                y={y}
                width={barW}
                height={barH}
                rx="6"
                fill={d.minutes > 0 ? '#12BFA3' : '#DCECE6'}
                fillOpacity={isHovered ? 1 : 0.9}
              />
              <text
                x={cx}
                y={height - 8}
                textAnchor="middle"
                className={`font-mono text-[10px] ${isHovered ? 'fill-[#0F2A2A] font-semibold' : 'fill-[#648482]'}`}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function MonthlyWorkoutChart({
  data,
}: {
  data: Array<{ label: string; minutes: number; calories: number; sessions: number }>;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (!data.length) return null;

  const width = 560;
  const height = 190;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const maxCal = Math.max(...data.map((d) => d.calories), 300);
  const slotW = innerW / data.length;
  const barW = Math.min(44, slotW * 0.45);
  const active = hoverIdx !== null ? data[hoverIdx] : data[data.length - 1];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#5C7B79]">
        <span>
          {active.label}:{' '}
          <strong className="font-mono text-[#0F2A2A] tabular-nums">{active.calories} kcal</strong> ·{' '}
          <span className="font-mono font-medium tabular-nums text-[#0C947E]">{active.minutes} min</span>
        </span>
        <span className="font-mono text-[#648482] tabular-nums">
          {active.sessions} sessões
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full overflow-visible" role="img" aria-label="Gráfico mensal de volume de treino">
        {[0, 0.5, 1].map((t, i) => {
          const val = Math.round(maxCal * (1 - t));
          const y = padT + t * innerH;
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="rgba(15,42,42,0.08)" strokeWidth="1" />
              <text x={padL - 8} y={y + 4} textAnchor="end" className="fill-[#648482] font-mono text-[10px]">
                {val}
              </text>
            </g>
          );
        })}

        {data.map((d, idx) => {
          const cx = padL + idx * slotW + slotW / 2;
          const barH = d.calories > 0 ? Math.max(5, (d.calories / maxCal) * innerH) : 3;
          const y = padT + innerH - barH;
          const isHovered = hoverIdx === idx;
          return (
            <g
              key={d.label}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
              onClick={() => setHoverIdx((prev) => (prev === idx ? null : idx))}
              className="cursor-pointer"
            >
              <rect x={cx - slotW / 2} y={padT} width={slotW} height={innerH} fill="transparent" />
              <rect
                x={cx - barW / 2}
                y={y}
                width={barW}
                height={barH}
                rx="6"
                fill={d.calories > 0 ? '#FF9F2E' : '#DCECE6'}
                fillOpacity={isHovered ? 1 : 0.9}
              />
              <text
                x={cx}
                y={height - 8}
                textAnchor="middle"
                className={`font-mono text-[10px] ${isHovered ? 'fill-[#0F2A2A] font-semibold' : 'fill-[#648482]'}`}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
