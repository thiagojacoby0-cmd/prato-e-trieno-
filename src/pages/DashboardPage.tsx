import React, { useCallback, useEffect, useState } from 'react';
import { Droplets, Flame, Plus, Scale, Sparkles, Utensils } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { apiRequest } from '../services/apiClient';
import { DashboardSummary, MealEntry } from '../types';
import { formatWaterLiters, GOAL_LABELS, MEAL_CATEGORY_LABELS } from '../utils/nutrition';
import { useAppSettings } from '../utils/appSettings';
import { CalorieProgressRing, WeeklyCaloriesChart, WeightEvolutionChart } from '../components/InteractiveCharts';
import { AppRoute } from '../components/AppLayout';

export function DashboardPage({ onNavigate }: { onNavigate: (route: AppRoute) => void }) {
  const { profile, refreshProfile } = useAuth();
  const { settings } = useAppSettings();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [todayMeals, setTodayMeals] = useState<MealEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [quickWeight, setQuickWeight] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);

  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      const [sumData, mealsData] = await Promise.all([
        apiRequest<DashboardSummary>('/api/dashboard'),
        apiRequest<{ meals: MealEntry[] }>('/api/meals'),
      ]);
      setSummary(sumData);
      setTodayMeals(mealsData.meals.filter((m) => m.date === sumData.date));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar o resumo diário.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleWaterDelta = async (deltaMl: number) => {
    setActionError(null);
    try {
      const res = await apiRequest<{ water: { amount_ml: number } }>('/api/water', {
        method: 'POST',
        body: JSON.stringify({ delta_ml: deltaMl }),
      });
      setSummary((prev) => (prev ? { ...prev, water_ml: res.water.amount_ml } : prev));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao atualizar hidratação.');
    }
  };

  const handleQuickWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(quickWeight.replace(',', '.'));
    if (!Number.isFinite(val) || val < 30 || val > 250) {
      setActionError('Informe um peso válido entre 30 kg e 250 kg.');
      return;
    }
    setSavingWeight(true);
    setActionError(null);
    try {
      await apiRequest('/api/weight', {
        method: 'POST',
        body: JSON.stringify({ weight_kg: val }),
      });
      setQuickWeight('');
      await Promise.all([loadData(), refreshProfile()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao salvar peso.');
    } finally {
      setSavingWeight(false);
    }
  };

  if (loadError && !summary) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm font-medium text-red-800">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadData();
          }}
          className="mt-4 min-h-[40px] rounded-xl bg-[#12BFA3] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0EA88F]"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (loading || !profile || !summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-[#E1EEE9] bg-white" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-2xl border border-[#E1EEE9] bg-white" />
          <div className="h-72 animate-pulse rounded-2xl border border-[#E1EEE9] bg-white" />
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
      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {actionError}
        </div>
      )}
      {/* Greeting & Goal Strip */}
      <section className="flex flex-col justify-between gap-4 rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.09)] sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-medium text-[#0C947E]">
            {GOAL_LABELS[profile.goal]} · Sequência de {summary.streak_days} dia{summary.streak_days === 1 ? '' : 's'}
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold text-[#0F2A2A]">
            Olá, {profile.full_name.split(' ')[0]}
          </h2>
          <p className="mt-1 text-sm text-[#5C7B79]">
            Sua evolução começa aqui. Acompanhe suas calorias, hidratação e treinos de hoje.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <button
            type="button"
            onClick={() => onNavigate('nutrition')}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#12BFA3] px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-[#12BFA3]/25 transition-colors hover:bg-[#0EA88F] whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Registrar refeição
          </button>
          <button
            type="button"
            onClick={() => onNavigate('coach')}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#DCECE6] bg-[#F4FAF7] px-4 py-2.5 text-xs font-medium text-[#0F2A2A] transition-colors hover:bg-[#E7F4EF] whitespace-nowrap"
          >
            <Sparkles className="h-4 w-4 text-[#0C947E]" />
            Falar com Personal IA
          </button>
        </div>
      </section>

      {/* Top 4 KPI Row */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#E1EEE9] bg-white p-5 shadow-[0_8px_24px_-14px_rgba(15,42,42,0.08)]">
          <div className="flex items-center justify-between text-xs font-medium text-[#648482]">
            <span>Calorias consumidas</span>
            <Utensils className="h-4 w-4 text-[#0C947E]" />
          </div>
          <p className="mt-3 font-mono text-2xl font-bold text-[#0F2A2A] tabular-nums">
            {summary.calories_consumed.toLocaleString('pt-BR')} <span className="text-xs font-normal text-[#648482]">kcal</span>
          </p>
          <p className="mt-1 text-xs text-[#648482] tabular-nums">
            Meta: {profile.daily_calorie_target.toLocaleString('pt-BR')} kcal
          </p>
        </div>

        <div className="rounded-2xl border border-[#F7E3C4] bg-[#FFF9F0] p-5 shadow-[0_8px_24px_-14px_rgba(245,158,45,0.14)]">
          <div className="flex items-center justify-between text-xs font-medium text-[#9A5B13]">
            <span>Gasto em treinos hoje</span>
            <Flame className="h-4 w-4 text-[#F59E2D]" />
          </div>
          <p className="mt-3 font-mono text-2xl font-bold text-[#0F2A2A] tabular-nums">
            {summary.calories_burned.toLocaleString('pt-BR')} <span className="text-xs font-normal text-[#7A6245]">kcal</span>
          </p>
          <p className="mt-1 text-xs text-[#7A6245] tabular-nums">
            {summary.workouts_today} treino{summary.workouts_today === 1 ? '' : 's'} concluído{summary.workouts_today === 1 ? '' : 's'}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E1EEE9] bg-white p-5 shadow-[0_8px_24px_-14px_rgba(15,42,42,0.08)]">
          <div className="flex items-center justify-between text-xs font-medium text-[#648482]">
            <span>Hidratação hoje</span>
            <Droplets className="h-4 w-4 text-sky-500" />
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <p className="font-mono text-2xl font-bold text-[#0F2A2A] tabular-nums">
              {summary.water_ml.toLocaleString('pt-BR')} <span className="text-xs font-normal text-[#648482]">ml</span>
            </p>
            <span className="font-mono text-xs font-semibold text-sky-600 tabular-nums">{waterPct}%</span>
          </div>
          <p className="mt-1 text-xs text-[#648482] tabular-nums">
            Meta: {formatWaterLiters(profile.water_target_ml)} ({profile.water_target_ml.toLocaleString('pt-BR')} ml)
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-sky-100">
            <div className="h-full bg-sky-500 transition-all" style={{ width: `${waterPct}%` }} />
          </div>

          <div className="mt-2.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleWaterDelta(settings.waterQuickStepMl)}
              className="min-h-[36px] flex-1 rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1.5 font-mono text-xs font-semibold text-sky-700 hover:bg-sky-100"
            >
              +{settings.waterQuickStepMl} ml
            </button>
            <button
              type="button"
              onClick={() => handleWaterDelta(settings.waterQuickStepMl * 2)}
              className="min-h-[36px] flex-1 rounded-xl border border-[#DCECE6] bg-[#F4FAF7] px-2.5 py-1.5 font-mono text-xs font-medium text-[#2E4A48] hover:bg-[#E7F4EF]"
            >
              +{(settings.waterQuickStepMl * 2).toLocaleString('pt-BR')} ml
            </button>
            {summary.water_ml > 0 && (
              <button
                type="button"
                onClick={() => handleWaterDelta(-settings.waterQuickStepMl)}
                className="min-h-[36px] rounded-xl border border-[#DCECE6] bg-white px-2.5 py-1.5 font-mono text-xs text-[#648482] hover:bg-[#F2F9F6] hover:text-[#0F2A2A]"
                title={`Subtrair ${settings.waterQuickStepMl} ml`}
                aria-label={`Subtrair ${settings.waterQuickStepMl} ml`}
              >
                -{settings.waterQuickStepMl}
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E1EEE9] bg-white p-5 shadow-[0_8px_24px_-14px_rgba(15,42,42,0.08)]">
          <div className="flex items-center justify-between text-xs font-medium text-[#648482]">
            <span>Peso corporal</span>
            <Scale className="h-4 w-4 text-[#0C947E]" />
          </div>
          <p className="mt-3 font-mono text-2xl font-bold text-[#0F2A2A] tabular-nums">
            {profile.current_weight_kg.toFixed(1)} <span className="text-xs font-normal text-[#648482]">kg</span>
          </p>
          <p className="mt-1 text-xs text-[#648482] tabular-nums">
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
        <div className="rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] lg:col-span-7">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-[#0F2A2A]">Balanço nutricional do dia</h3>
            <button
              type="button"
              onClick={() => onNavigate('nutrition')}
              className="text-xs font-semibold text-[#0C947E] hover:underline"
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

          <div className="mt-6 grid grid-cols-1 gap-4 border-t border-[#E5F1EC] pt-5 sm:grid-cols-3">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#5C7B79]">Proteínas</span>
                <span className="font-mono font-medium text-[#0F2A2A] tabular-nums">
                  {summary.protein_g} / {profile.protein_target_g}g
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#E5F1EC]">
                <div className="h-full bg-[#12BFA3]" style={{ width: `${proteinPct}%` }} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#5C7B79]">Carboidratos</span>
                <span className="font-mono font-medium text-[#0F2A2A] tabular-nums">
                  {summary.carbs_g} / {profile.carbs_target_g}g
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#E5F1EC]">
                <div className="h-full bg-[#38BDF8]" style={{ width: `${carbsPct}%` }} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#5C7B79]">Gorduras</span>
                <span className="font-mono font-medium text-[#0F2A2A] tabular-nums">
                  {summary.fat_g} / {profile.fat_target_g}g
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#FEF0D9]">
                <div className="h-full bg-[#FF9F2E]" style={{ width: `${fatPct}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] lg:col-span-5">
          <div>
            <h3 className="font-display text-lg font-semibold text-[#0F2A2A]">Refeições de hoje</h3>
            <p className="mt-1 text-xs text-[#648482]">Resumo rápido do seu diário alimentar</p>

            {todayMeals.length === 0 ? (
              <div className="mt-5 rounded-xl border border-[#DCECE6] bg-[#F4FAF7] p-4 text-sm text-[#648482]">
                Nenhuma refeição registrada hoje ainda.
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-[#E5F1EC]">
                {todayMeals.slice(0, 3).map((meal) => (
                  <li key={meal.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div className="min-w-0 pr-3">
                      <p className="truncate font-medium text-[#0F2A2A]">{meal.title}</p>
                      <p className="text-xs text-[#648482]">
                        {MEAL_CATEGORY_LABELS[meal.category]} · {meal.protein_g}g prot
                      </p>
                    </div>
                    <span className="font-mono text-xs font-semibold text-[#0C947E] tabular-nums whitespace-nowrap">
                      {meal.calories} kcal
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={handleQuickWeight} className="mt-5 border-t border-[#E5F1EC] pt-4">
            <label htmlFor="quick-weight" className="mb-1.5 block text-xs font-medium text-[#2E4A48]">
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
                className="min-h-[44px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2 font-mono text-base text-[#0F2A2A] placeholder-[#7C9A98] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
              />
              <button
                type="submit"
                disabled={savingWeight || !quickWeight}
                className="min-h-[44px] rounded-xl bg-[#12BFA3] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0EA88F] disabled:opacity-50 whitespace-nowrap"
              >
                {savingWeight ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Interactive Charts Row */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-[#0F2A2A]">Calorias nos últimos 7 dias</h3>
            <span className="text-xs text-[#648482]">Ingerido vs. Queimado</span>
          </div>
          <WeeklyCaloriesChart data={summary.weekly_calories} />
        </div>

        <div className="rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-[#0F2A2A]">Curva de evolução do peso</h3>
            <button
              type="button"
              onClick={() => onNavigate('progress')}
              className="text-xs font-semibold text-[#0C947E] hover:underline"
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
