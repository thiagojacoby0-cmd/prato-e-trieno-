import React, { useMemo, useState } from 'react';
import { Activity, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ActivityLevel, BiologicalSex, GoalType, WorkoutLevel } from '../types';
import { ACTIVITY_LABELS, calculateNutritionTargets, GOAL_LABELS, WORKOUT_LEVEL_LABELS } from '../utils/nutrition';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        full_name: fullName,
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
        water_target_ml: previewTargets.water_target_ml,
        onboarding_completed: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar perfil.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0D0B] px-4 py-10 text-[#F4F7F5] sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#22C55E] text-[#06120A]">
              <Activity className="h-4 w-4 stroke-[2.5]" />
            </span>
            <span className="font-display text-lg font-bold">PRATO &amp; TREINO</span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="text-xs font-medium text-[#8F9E95] hover:text-white"
          >
            Sair
          </button>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <form
            onSubmit={handleSubmit}
            className="space-y-6 rounded-2xl border border-white/10 bg-[#111613] p-6 sm:p-8 lg:col-span-8"
          >
            <div>
              <h1 className="font-display text-2xl font-bold text-[#F4F7F5]">
                Configure seu plano metabólico e físico
              </h1>
              <p className="mt-1 text-sm text-[#9AA8A0]">
                Esses dados permitem calcular suas calorias, macronutrientes e intensidade ideal de treino.
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Nome completo</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2.5 text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Sexo biológico</label>
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value as BiologicalSex)}
                  className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2.5 text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                >
                  <option value="masculino">Masculino</option>
                  <option value="feminino">Feminino</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Idade (anos)</label>
                <input
                  type="number"
                  min={14}
                  max={95}
                  required
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2.5 font-mono text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Altura (cm)</label>
                <input
                  type="number"
                  min={120}
                  max={230}
                  required
                  value={heightCm}
                  onChange={(e) => setHeightCm(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2.5 font-mono text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Peso atual (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min={35}
                  max={250}
                  required
                  value={currentWeight}
                  onChange={(e) => setCurrentWeight(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2.5 font-mono text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Peso meta (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min={35}
                  max={250}
                  required
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2.5 font-mono text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Objetivo principal</label>
                <select
                  value={goal}
                  onChange={(e) => setGoal(e.target.value as GoalType)}
                  className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2.5 text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                >
                  {Object.entries(GOAL_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Nível de atividade</label>
                <select
                  value={activityLevel}
                  onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
                  className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2.5 text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
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
              <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Experiência em treinos em casa</label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(WORKOUT_LEVEL_LABELS) as Array<[WorkoutLevel, string]>).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setWorkoutLevel(k)}
                    className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                      workoutLevel === k
                        ? 'border-[#22C55E] bg-[#22C55E]/15 text-[#22C55E]'
                        : 'border-white/10 bg-[#0A0D0B] text-[#9AA8A0] hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-[#C2CCC6]">Restrições alimentares</label>
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
                          ? 'border-[#22C55E] bg-[#22C55E]/15 text-[#22C55E]'
                          : 'border-white/10 bg-[#0A0D0B] text-[#9AA8A0] hover:text-white'
                      }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-[#C2CCC6]">Equipamentos disponíveis em casa</label>
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
                          ? 'border-[#22C55E] bg-[#22C55E]/15 text-[#22C55E]'
                          : 'border-white/10 bg-[#0A0D0B] text-[#9AA8A0] hover:text-white'
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
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] px-5 py-3 text-sm font-semibold text-[#06120A] transition-colors hover:bg-[#16A34A] disabled:opacity-60"
            >
              <span>{saving ? 'Calculando e salvando...' : 'Salvar plano e entrar no painel'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Live Calculation Preview */}
          <aside className="rounded-2xl border border-white/10 bg-[#111613] p-6 lg:col-span-4 lg:self-start">
            <p className="text-xs font-medium text-[#22C55E]">Prévia do cálculo diário</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-[#F4F7F5]">Suas metas recomendadas</h2>

            <div className="mt-6 space-y-4">
              <div className="border-b border-white/8 pb-4">
                <p className="text-xs text-[#8F9E95]">Meta calórica diária</p>
                <p className="mt-1 font-mono text-3xl font-semibold text-[#F4F7F5] tabular-nums">
                  {previewTargets.daily_calorie_target.toLocaleString('pt-BR')} kcal
                </p>
                <p className="mt-1 text-xs text-[#7D8C84] tabular-nums">
                  TMB {previewTargets.bmr} kcal · Gasto total {previewTargets.tdee} kcal
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 border-b border-white/8 pb-4">
                <div>
                  <p className="text-xs text-[#8F9E95]">Proteína</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-[#22C55E] tabular-nums">
                    {previewTargets.protein_target_g}g
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#8F9E95]">Carboidrato</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-[#F4F7F5] tabular-nums">
                    {previewTargets.carbs_target_g}g
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#8F9E95]">Gordura</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-[#F4F7F5] tabular-nums">
                    {previewTargets.fat_target_g}g
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8F9E95]">Meta de hidratação</span>
                <span className="font-mono text-sm font-semibold text-sky-400 tabular-nums">
                  {previewTargets.water_target_ml.toLocaleString('pt-BR')} ml/dia
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8F9E95]">IMC atual estimado</span>
                <span className="font-mono text-sm font-semibold text-[#F4F7F5] tabular-nums">
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
