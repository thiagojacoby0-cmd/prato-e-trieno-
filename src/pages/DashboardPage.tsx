import React, { useCallback, useEffect, useState } from 'react';
import { Droplets, Flame, Plus, Scale, Sparkles, Utensils } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { apiRequest } from '../services/apiClient';
import { DashboardSummary, MealEntry } from '../types';
import { GOAL_LABELS, MEAL_CATEGORY_LABELS } from '../utils/nutrition';
import { CalorieProgressRing, WeeklyCaloriesChart, WeightEvolutionChart } from '../components/InteractiveCharts';
import { AppRoute } from '../components/AppLayout';

export function DashboardPage({ onNavigate }: { onNavigate: (route: AppRoute) => void }) {
  const { profile, refreshProfile } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [todayMeals, setTodayMeals] = useState<MealEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickWeight, setQuickWeight] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [sumData, mealsData] = await Promise.all([
        apiRequest<DashboardSummary>('/api/dashboard'),
        apiRequest<{ meals: MealEntry[] }>('/api/meals'),
      ]);
      setSummary(sumData);
      setTodayMeals(mealsData.meals.filter((m) => m.date === sumData.date));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleWaterDelta = async (deltaMl: number) => {
    const res = await apiRequest<{ water: { amount_ml: number } }>('/api/water', {
      method: 'POST',
      body: JSON.stringify({ delta_ml: deltaMl }),
    });
    setSummary((prev) => (prev ? { ...prev, water_ml: res.water.amount_ml } : prev));
  };

  const handleQuickWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(quickWeight.replace(',', '.'));
    if (!val || val < 30 || val > 250) return;
    setSavingWeight(true);
    try {
      await apiRequest('/api/weight', {
        method: 'POST',
        body: JSON.stringify({ weight_kg: val }),
      });
      setQuickWeight('');
      await Promise.all([loadData(), refreshProfile()]);
    } finally {
      setSavingWeight(false);
    }
  };

  if (loading || !profile || !summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-white/8 bg-[#111613]" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-2xl border border-white/8 bg-[#111613]" />
          <div className="h-72 animate-pulse rounded-2xl border border-white/8 bg-[#111613]" />
        </div>
      </div>
    );
  }

  const proteinPct = Math.min(100, Math.round((summary.protein_g / Math.max(1, profile.protein_target_g)) * 100));
  const carbsPct = Math.min(100, Math.round((summary.carbs_g / Math.max(1, profile.carbs_target_g)) * 100));
  const fatPct = Math.min(100, Math.round((summary.fat_g / Math.max(1, profile.fat_target_g)) * 100));
  const waterPct = Math.min(100, Math.round((summary.water_ml / Math.max(1, profile.water_target_ml)) * 100));
  const weightDiff = Number((profile.current_weight_kg - profile.target_weight_kg).toFixed(1));

  return (
    <div className="space-y-6">
      {/* Greeting & Goal Strip */}
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-white/8 bg-[#111613] p-6 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs text-[#22C55E]">
            {GOAL_LABELS[profile.goal]} · Sequência de {summary.streak_days} dia{summary.streak_days === 1 ? '' : 's'}
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-[#F4F7F5]">
            Olá, {profile.full_name.split(' ')[0]}
          </h2>
          <p className="mt-1 text-sm text-[#9AA8A0]">
            Sua evolução começa aqui. Acompanhe suas calorias, hidratação e treinos de hoje.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('nutrition')}
            className="inline-flex items-center gap-2 rounded-xl bg-[#22C55E] px-4 py-2.5 text-xs font-semibold text-[#06120A] transition-colors hover:bg-[#16A34A] whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Registrar refeição
          </button>
          <button
            type="button"
            onClick={() => onNavigate('coach')}
            className="inline-flex items-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-xs font-medium text-[#F4F7F5] transition-colors hover:bg-white/5 whitespace-nowrap"
          >
            <Sparkles className="h-4 w-4 text-[#22C55E]" />
            Falar com Personal IA
          </button>
        </div>
      </section>

      {/* Top 4 KPI Row */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/8 bg-[#111613] p-5">
          <div className="flex items-center justify-between text-xs text-[#8F9E95]">
            <span>Calorias consumidas</span>
            <Utensils className="h-4 w-4 text-[#22C55E]" />
          </div>
          <p className="mt-3 font-mono text-2xl font-semibold text-[#F4F7F5] tabular-nums">
            {summary.calories_consumed.toLocaleString('pt-BR')} <span className="text-xs font-normal text-[#7D8C84]">kcal</span>
          </p>
          <p className="mt-1 text-xs text-[#8F9E95] tabular-nums">
            Meta: {profile.daily_calorie_target.toLocaleString('pt-BR')} kcal
          </p>
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#111613] p-5">
          <div className="flex items-center justify-between text-xs text-[#8F9E95]">
            <span>Gasto em treinos hoje</span>
            <Flame className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-3 font-mono text-2xl font-semibold text-[#F4F7F5] tabular-nums">
            {summary.calories_burned.toLocaleString('pt-BR')} <span className="text-xs font-normal text-[#7D8C84]">kcal</span>
          </p>
          <p className="mt-1 text-xs text-[#8F9E95] tabular-nums">
            {summary.workouts_today} treino{summary.workouts_today === 1 ? '' : 's'} concluído{summary.workouts_today === 1 ? '' : 's'}
          </p>
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#111613] p-5">
          <div className="flex items-center justify-between text-xs text-[#8F9E95]">
            <span>Hidratação hoje</span>
            <Droplets className="h-4 w-4 text-sky-400" />
          </div>
          <p className="mt-3 font-mono text-2xl font-semibold text-[#F4F7F5] tabular-nums">
            {summary.water_ml.toLocaleString('pt-BR')} <span className="text-xs font-normal text-[#7D8C84]">ml</span>
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleWaterDelta(250)}
              className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 font-mono text-[11px] font-medium text-sky-300 hover:bg-sky-400/20"
            >
              +250 ml
            </button>
            <button
              type="button"
              onClick={() => handleWaterDelta(500)}
              className="rounded-lg border border-white/10 px-2.5 py-1 font-mono text-[11px] text-[#C2CCC6] hover:bg-white/5"
            >
              +500 ml
            </button>
            <span className="ml-auto font-mono text-[11px] text-[#8F9E95] tabular-nums">{waterPct}%</span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#111613] p-5">
          <div className="flex items-center justify-between text-xs text-[#8F9E95]">
            <span>Peso corporal</span>
            <Scale className="h-4 w-4 text-[#22C55E]" />
          </div>
          <p className="mt-3 font-mono text-2xl font-semibold text-[#F4F7F5] tabular-nums">
            {profile.current_weight_kg.toFixed(1)} <span className="text-xs font-normal text-[#7D8C84]">kg</span>
          </p>
          <p className="mt-1 text-xs text-[#8F9E95] tabular-nums">
            {weightDiff > 0
              ? `Faltam ${weightDiff} kg para a meta`
              : weightDiff < 0
              ? `${Math.abs(weightDiff)} kg abaixo da meta`
              : 'Meta atingida'}
          </p>
        </div>
      </section>

      {/* Calorie Ring + Macros + Quick Weight */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-white/8 bg-[#111613] p-6 lg:col-span-7">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-[#F4F7F5]">Balanço nutricional do dia</h3>
            <button
              type="button"
              onClick={() => onNavigate('nutrition')}
              className="text-xs font-medium text-[#22C55E] hover:underline"
            >
              Abrir diário
            </button>
          </div>

          <div className="mt-5">
            <CalorieProgressRing
              consumed={summary.calories_consumed}
              target={profile.daily_calorie_target}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 border-t border-white/8 pt-5 sm:grid-cols-3">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#9AA8A0]">Proteínas</span>
                <span className="font-mono text-[#F4F7F5] tabular-nums">
                  {summary.protein_g} / {profile.protein_target_g}g
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/8">
                <div className="h-full bg-[#22C55E]" style={{ width: `${proteinPct}%` }} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#9AA8A0]">Carboidratos</span>
                <span className="font-mono text-[#F4F7F5] tabular-nums">
                  {summary.carbs_g} / {profile.carbs_target_g}g
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/8">
                <div className="h-full bg-sky-400" style={{ width: `${carbsPct}%` }} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#9AA8A0]">Gorduras</span>
                <span className="font-mono text-[#F4F7F5] tabular-nums">
                  {summary.fat_g} / {profile.fat_target_g}g
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/8">
                <div className="h-full bg-amber-400" style={{ width: `${fatPct}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-white/8 bg-[#111613] p-6 lg:col-span-5">
          <div>
            <h3 className="font-display text-lg font-semibold text-[#F4F7F5]">Refeições de hoje</h3>
            <p className="mt-1 text-xs text-[#8F9E95]">Resumo rápido do seu diário alimentar</p>

            {todayMeals.length === 0 ? (
              <div className="mt-5 rounded-xl border border-white/8 bg-[#0C100E] p-4 text-sm text-[#8F9E95]">
                Nenhuma refeição registrada hoje ainda.
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-white/8">
                {todayMeals.slice(0, 3).map((meal) => (
                  <li key={meal.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div className="min-w-0 pr-3">
                      <p className="truncate font-medium text-[#F4F7F5]">{meal.title}</p>
                      <p className="text-xs text-[#8F9E95]">
                        {MEAL_CATEGORY_LABELS[meal.category]} · {meal.protein_g}g prot
                      </p>
                    </div>
                    <span className="font-mono text-xs font-medium text-[#22C55E] tabular-nums whitespace-nowrap">
                      {meal.calories} kcal
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={handleQuickWeight} className="mt-5 border-t border-white/8 pt-4">
            <label htmlFor="quick-weight" className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">
              Atualizar peso de hoje (kg)
            </label>
            <div className="flex gap-2">
              <input
                id="quick-weight"
                type="number"
                step="0.1"
                placeholder={profile.current_weight_kg.toFixed(1)}
                value={quickWeight}
                onChange={(e) => setQuickWeight(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2 font-mono text-sm text-[#F4F7F5] placeholder-[#5F6E65] focus:border-[#22C55E] focus:outline-none"
              />
              <button
                type="submit"
                disabled={savingWeight || !quickWeight}
                className="rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-[#F4F7F5] transition-colors hover:bg-white/15 disabled:opacity-50 whitespace-nowrap"
              >
                {savingWeight ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Interactive Charts Row */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-[#111613] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-[#F4F7F5]">Calorias nos últimos 7 dias</h3>
            <span className="text-xs text-[#8F9E95]">Ingerido vs. Queimado</span>
          </div>
          <WeeklyCaloriesChart data={summary.weekly_calories} />
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#111613] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-[#F4F7F5]">Curva de evolução do peso</h3>
            <button
              type="button"
              onClick={() => onNavigate('progress')}
              className="text-xs font-medium text-[#22C55E] hover:underline"
            >
              Ver medidas
            </button>
          </div>
          <WeightEvolutionChart
            data={summary.weight_history}
            targetWeight={profile.target_weight_kg}
          />
        </div>
      </section>
    </div>
  );
}
