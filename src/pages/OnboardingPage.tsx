import React, { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ActivityLevel, BiologicalSex, GoalType, WorkoutLevel } from '../types';
import {
  ACTIVITY_LABELS,
  calculateNutritionTargets,
  formatWaterLiters,
  GOAL_LABELS,
  WORKOUT_LEVEL_LABELS,
} from '../utils/nutrition';

const RESTRICTION_OPTIONS = [
  'Sem lactose',
  'Sem glúten',
  'Vegetariano',
  'Vegano',
  'Sem açúcar refinado',
  'Low carb',
];

const EQUIPMENT_OPTIONS = [
  'Peso corporal',
  'Tapete',
  'Halteres leves',
  'Elástico de resistência',
  'Corda',
  'Cadeira ou sofá',
];

export function OnboardingPage() {
  const { profile, updateProfile, logout } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [age, setAge] = useState(profile?.age || 28);
  const [sex, setSex] = useState<BiologicalSex>(profile?.sex || 'masculino');
  const [heightCm, setHeightCm] = useState(profile?.height_cm || 175);
  const [currentWeight, setCurrentWeight] = useState(profile?.current_weight_kg || 78);
  const [targetWeight, setTargetWeight] = useState(profile?.target_weight_kg || 72);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(profile?.activity_level || 'moderado');
  const [goal, setGoal] = useState<GoalType>(profile?.goal || 'emagrecimento');
  const [workoutLevel, setWorkoutLevel] = useState<WorkoutLevel>(profile?.workout_level || 'intermediario');
  const [restrictions, setRestrictions] = useState<string[]>(profile?.dietary_restrictions || []);
  const [equipment, setEquipment] = useState<string[]>(profile?.home_equipment || ['Peso corporal']);
  const [waterTargetMl, setWaterTargetMl] = useState<number>(profile?.water_target_ml || 2000);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewTargets = useMemo(
    () =>
      calculateNutritionTargets({
        age,
        sex,
        height_cm: heightCm,
        current_weight_kg: currentWeight,
        activity_level: activityLevel,
        goal,
      }),
    [age, sex, heightCm, currentWeight, activityLevel, goal]
  );

  const toggleItem = (list: string[], setList: (v: string[]) => void, item: string) => {
    if (list.includes(item)) {
      setList(list.filter((i) => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  const handleFieldFocus = (e: React.FocusEvent<HTMLElement>) => {
    const target = e.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 220);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        full_name: fullName.trim(),
        email: email.trim() || profile?.email,
        age,
        sex,
        height_cm: heightCm,
        current_weight_kg: currentWeight,
        target_weight_kg: targetWeight,
        activity_level: activityLevel,
        goal,
        workout_level: workoutLevel,
        dietary_restrictions: restrictions,
        home_equipment: equipment.length ? equipment : ['Peso corporal'],
        daily_calorie_target: previewTargets.daily_calorie_target,
        protein_target_g: previewTargets.protein_target_g,
        carbs_target_g: previewTargets.carbs_target_g,
        fat_target_g: previewTargets.fat_target_g,
        water_target_ml: Math.min(10000, Math.max(500, Math.round(waterTargetMl || previewTargets.water_target_ml))),
        onboarding_completed: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar perfil.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onFocusCapture={handleFieldFocus}
      className="pt-safe pb-safe min-h-[100dvh] bg-gradient-to-br from-[#EBF8F2] via-[#F4FBF8] to-[#FAFDFC] px-4 py-6 pb-16 text-[#0F2A2A] dark:from-[#051011] dark:via-[#071618] dark:to-[#0A1E20] dark:text-[#F2FAFA] sm:px-8 sm:py-10"
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/app-logo.png"
              alt="PRATO & TREINO"
              className="h-10 w-10 shrink-0 rounded-xl object-cover shadow-md shadow-[#12BFA3]/25"
            />
            <span className="font-display text-lg font-bold text-[#0F2A2A]">PRATO &amp; TREINO</span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="min-h-[40px] rounded-xl border border-[#DCECE6] bg-white px-3 py-1.5 text-xs font-medium text-[#5C7B79] hover:text-[#0F2A2A]"
          >
            Login / Outra conta
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_14px_34px_-16px_rgba(15,42,42,0.1)] sm:p-8 lg:col-span-8"
          >
            <div>
              <h1 className="font-display text-xl font-bold text-[#0F2A2A] sm:text-2xl">
                Faça seu cadastro e defina suas metas
              </h1>
              <p className="mt-1 text-xs leading-relaxed text-[#5C7B79] sm:text-sm">
                Preencha suas informações para calcular suas calorias, macronutrientes e intensidade ideal de treino.
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Nome completo</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Digite seu nome"
                  className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">E-mail</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seuemail@exemplo.com"
                  className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Sexo biológico</label>
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value as BiologicalSex)}
                  className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                >
                  <option value="masculino">Masculino</option>
                  <option value="feminino">Feminino</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Idade (anos)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={14}
                  max={95}
                  required
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 font-mono text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Altura (cm)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={120}
                  max={230}
                  required
                  value={heightCm}
                  onChange={(e) => setHeightCm(Number(e.target.value))}
                  className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 font-mono text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Peso atual (kg)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={35}
                  max={250}
                  required
                  value={currentWeight}
                  onChange={(e) => setCurrentWeight(Number(e.target.value))}
                  className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 font-mono text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Peso meta (kg)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={35}
                  max={250}
                  required
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(Number(e.target.value))}
                  className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 font-mono text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Objetivo principal</label>
                <select
                  value={goal}
                  onChange={(e) => setGoal(e.target.value as GoalType)}
                  className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                >
                  {Object.entries(GOAL_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Nível de atividade</label>
                <select
                  value={activityLevel}
                  onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
                  className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                >
                  {Object.entries(ACTIVITY_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Experiência em treinos em casa</label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(WORKOUT_LEVEL_LABELS) as Array<[WorkoutLevel, string]>).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setWorkoutLevel(k)}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                      workoutLevel === k
                        ? 'border-[#12BFA3] bg-[#EBF9F6] text-[#0C947E]'
                        : 'border-[#DCECE6] bg-[#F4FAF7] text-[#5C7B79] hover:text-[#0F2A2A]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-[#2E4A48]">Restrições alimentares</label>
              <div className="flex flex-wrap gap-2">
                {RESTRICTION_OPTIONS.map((item) => {
                  const selected = restrictions.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleItem(restrictions, setRestrictions, item)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        selected
                          ? 'border-[#12BFA3] bg-[#EBF9F6] text-[#0C947E]'
                          : 'border-[#DCECE6] bg-[#F4FAF7] text-[#5C7B79] hover:text-[#0F2A2A]'
                      }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-[#2E4A48]">Equipamentos disponíveis em casa</label>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_OPTIONS.map((item) => {
                  const selected = equipment.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleItem(equipment, setEquipment, item)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        selected
                          ? 'border-[#12BFA3] bg-[#EBF9F6] text-[#0C947E]'
                          : 'border-[#DCECE6] bg-[#F4FAF7] text-[#5C7B79] hover:text-[#0F2A2A]'
                      }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#12BFA3] px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-[#12BFA3]/25 transition-colors hover:bg-[#0EA88F] disabled:opacity-60"
            >
              <span>{saving ? 'Calculando e salvando...' : 'Salvar plano e entrar no painel'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Live Calculation Preview */}
          <aside className="rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_14px_34px_-16px_rgba(15,42,42,0.1)] lg:col-span-4 lg:self-start">
            <p className="text-xs font-semibold text-[#0C947E]">Prévia do cálculo diário</p>
            <h2 className="mt-1 font-display text-xl font-bold text-[#0F2A2A]">Suas metas recomendadas</h2>

            <div className="mt-6 space-y-4">
              <div className="border-b border-[#E5F1EC] pb-4">
                <p className="text-xs text-[#648482]">Meta calórica diária</p>
                <p className="mt-1 font-mono text-3xl font-bold text-[#0F2A2A] tabular-nums">
                  {previewTargets.daily_calorie_target.toLocaleString('pt-BR')} kcal
                </p>
                <p className="mt-1 text-xs text-[#648482] tabular-nums">
                  TMB {previewTargets.bmr} kcal · Gasto total {previewTargets.tdee} kcal
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 border-b border-[#E5F1EC] pb-4">
                <div>
                  <p className="text-xs text-[#648482]">Proteína</p>
                  <p className="mt-1 font-mono text-lg font-bold text-[#0C947E] tabular-nums">
                    {previewTargets.protein_target_g}g
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#648482]">Carboidrato</p>
                  <p className="mt-1 font-mono text-lg font-bold text-[#0F2A2A] tabular-nums">
                    {previewTargets.carbs_target_g}g
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#648482]">Gordura</p>
                  <p className="mt-1 font-mono text-lg font-bold text-[#D97706] tabular-nums">
                    {previewTargets.fat_target_g}g
                  </p>
                </div>
              </div>

              <div className="space-y-2 border-b border-[#E5F1EC] pb-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#648482]">Meta de hidratação</span>
                  <span className="font-mono text-sm font-semibold text-sky-600 tabular-nums">
                    {formatWaterLiters(waterTargetMl)} ({waterTargetMl.toLocaleString('pt-BR')} ml/dia)
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1500, 2000, 2500, 3000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setWaterTargetMl(preset)}
                      className={`min-h-[30px] rounded-lg font-mono text-[11px] font-semibold transition-colors ${
                        waterTargetMl === preset
                          ? 'bg-sky-500 text-white'
                          : 'border border-[#D3E5DF] bg-[#F4FAF7] text-[#5C7B79] hover:text-[#0F2A2A]'
                      }`}
                    >
                      {formatWaterLiters(preset)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-[#648482]">IMC atual estimado</span>
                <span className="font-mono text-sm font-semibold text-[#0F2A2A] tabular-nums">
                  {previewTargets.bmi}
                </span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
