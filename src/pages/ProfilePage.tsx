import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Check, LogOut, RefreshCw, Save } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ActivityLevel, BiologicalSex, GoalType, WorkoutLevel } from '../types';
import {
  ACTIVITY_LABELS,
  calculateNutritionTargets,
  formatWaterLiters,
  GOAL_LABELS,
  WORKOUT_LEVEL_LABELS,
} from '../utils/nutrition';
import { PWAInstallButton } from '../components/PWAInstallButton';

export function ProfilePage() {
  const { profile, updateProfile, configInfo, logout } = useAuth();
  const isNativeApp = typeof window !== 'undefined' && Capacitor.isNativePlatform();

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
  const [restrictionsText, setRestrictionsText] = useState((profile?.dietary_restrictions || []).join(', '));
  const [equipmentText, setEquipmentText] = useState((profile?.home_equipment || []).join(', '));
  const [calorieTarget, setCalorieTarget] = useState(profile?.daily_calorie_target || 2000);
  const [proteinTarget, setProteinTarget] = useState(profile?.protein_target_g || 150);
  const [carbsTarget, setCarbsTarget] = useState(profile?.carbs_target_g || 200);
  const [fatTarget, setFatTarget] = useState(profile?.fat_target_g || 60);
  const [waterTargetMl, setWaterTargetMl] = useState(profile?.water_target_ml || 2000);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name);
    setEmail(profile.email);
    setAge(profile.age);
    setSex(profile.sex);
    setHeightCm(profile.height_cm);
    setCurrentWeight(profile.current_weight_kg);
    setTargetWeight(profile.target_weight_kg);
    setActivityLevel(profile.activity_level);
    setGoal(profile.goal);
    setWorkoutLevel(profile.workout_level);
    setRestrictionsText((profile.dietary_restrictions || []).join(', '));
    setEquipmentText((profile.home_equipment || []).join(', '));
    setCalorieTarget(profile.daily_calorie_target);
    setProteinTarget(profile.protein_target_g);
    setCarbsTarget(profile.carbs_target_g);
    setFatTarget(profile.fat_target_g);
    setWaterTargetMl(profile.water_target_ml);
  }, [profile]);

  if (!profile) return null;

  const handleRecalculateTargets = () => {
    const rec = calculateNutritionTargets({
      age: Number.isFinite(age) ? age : 28,
      sex,
      height_cm: Number.isFinite(heightCm) ? heightCm : 175,
      current_weight_kg: Number.isFinite(currentWeight) ? currentWeight : 78,
      activity_level: activityLevel,
      goal,
    });
    setCalorieTarget(rec.daily_calorie_target);
    setProteinTarget(rec.protein_target_g);
    setCarbsTarget(rec.carbs_target_g);
    setFatTarget(rec.fat_target_g);
    setWaterTargetMl(rec.water_target_ml);
    setSaveError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSavedNotice(false);
    if (!Number.isFinite(age) || age < 12 || age > 105) {
      setSaveError('Informe uma idade válida entre 12 e 105 anos.');
      return;
    }
    if (!Number.isFinite(heightCm) || heightCm < 110 || heightCm > 240) {
      setSaveError('Informe uma altura válida em cm (110 a 240).');
      return;
    }
    if (!Number.isFinite(currentWeight) || currentWeight < 25 || currentWeight > 300) {
      setSaveError('Informe um peso atual válido em kg.');
      return;
    }
    if (!Number.isFinite(targetWeight) || targetWeight < 25 || targetWeight > 300) {
      setSaveError('Informe um peso meta válido em kg.');
      return;
    }
    if (!Number.isFinite(calorieTarget) || calorieTarget < 800 || calorieTarget > 8000) {
      setSaveError('Informe uma meta calórica válida entre 800 e 8.000 kcal.');
      return;
    }
    if (!Number.isFinite(waterTargetMl) || waterTargetMl < 500 || waterTargetMl > 10000) {
      setSaveError('Informe uma meta de água válida entre 500 ml e 10.000 ml.');
      return;
    }
    if (!Number.isFinite(proteinTarget) || proteinTarget < 20 || proteinTarget > 500) {
      setSaveError('Informe uma meta de proteína válida entre 20 g e 500 g.');
      return;
    }
    if (!Number.isFinite(carbsTarget) || carbsTarget < 0 || carbsTarget > 1000) {
      setSaveError('Informe uma meta de carboidratos válida entre 0 g e 1.000 g.');
      return;
    }
    if (!Number.isFinite(fatTarget) || fatTarget < 15 || fatTarget > 350) {
      setSaveError('Informe uma meta de gordura válida entre 15 g e 350 g.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        full_name: fullName.trim() || profile.full_name,
        email: email.trim() || profile.email,
        age,
        sex,
        height_cm: heightCm,
        current_weight_kg: currentWeight,
        target_weight_kg: targetWeight,
        activity_level: activityLevel,
        goal,
        workout_level: workoutLevel,
        daily_calorie_target: Math.round(calorieTarget),
        protein_target_g: Math.round(proteinTarget),
        carbs_target_g: Math.round(carbsTarget),
        fat_target_g: Math.round(fatTarget),
        water_target_ml: Math.round(waterTargetMl),
        dietary_restrictions: restrictionsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        home_equipment: equipmentText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        onboarding_completed: true,
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao atualizar o perfil.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 pb-8 lg:grid-cols-12">
      <form
        onSubmit={handleSave}
        className="space-y-5 rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] sm:p-6 lg:col-span-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5F1EC] pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#0F2A2A]">Meu Cadastro &amp; Metas</h2>
            <p className="text-xs text-[#648482]">
              Atualize seus dados físicos ou ajuste manualmente suas metas diárias de água, calorias e macronutrientes.
            </p>
          </div>
          {savedNotice && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0C947E]">
              <Check className="h-4 w-4" /> Salvo
            </span>
          )}
        </div>

        {saveError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {saveError}
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
              placeholder="Seu nome"
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
            <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Idade</label>
            <input
              type="number"
              inputMode="numeric"
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
              value={targetWeight}
              onChange={(e) => setTargetWeight(Number(e.target.value))}
              className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 font-mono text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Objetivo</label>
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value as GoalType)}
              className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
            >
              {Object.entries(GOAL_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Atividade física</label>
            <select
              value={activityLevel}
              onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
              className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
            >
              {Object.entries(ACTIVITY_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Nível de treino</label>
            <select
              value={workoutLevel}
              onChange={(e) => setWorkoutLevel(e.target.value as WorkoutLevel)}
              className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
            >
              {Object.entries(WORKOUT_LEVEL_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Restrições alimentares</label>
            <input
              type="text"
              value={restrictionsText}
              onChange={(e) => setRestrictionsText(e.target.value)}
              placeholder="Separadas por vírgula"
              className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Equipamentos em casa</label>
          <input
            type="text"
            value={equipmentText}
            onChange={(e) => setEquipmentText(e.target.value)}
            placeholder="Ex: Peso corporal, Tapete, Halteres"
            className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
          />
        </div>

        {/* Seção editável de metas diárias (água, calorias e macros) */}
        <div className="space-y-4 rounded-2xl border border-[#DCECE6] bg-[#F4FAF7] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-semibold text-[#0F2A2A]">Metas diárias (personalizáveis)</h3>
              <p className="text-[11px] text-[#648482]">
                Edite os valores abaixo ou clique em recalcular para gerar com base nos seus dados.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRecalculateTargets}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#DCECE6] bg-white px-3 py-1.5 text-xs font-medium text-[#0C947E] hover:bg-[#EBF9F6]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Recalcular pelo perfil
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-3">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium text-[#2E4A48]">
                  Meta de água diária (ml) · <span className="font-mono font-semibold text-sky-600">{formatWaterLiters(waterTargetMl)}</span>
                </label>
                <div className="flex items-center gap-1.5">
                  {[1500, 2000, 2500, 3000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setWaterTargetMl(preset)}
                      className={`min-h-[28px] rounded-lg px-2 font-mono text-[11px] font-semibold transition-colors ${
                        waterTargetMl === preset
                          ? 'bg-sky-500 text-white'
                          : 'border border-[#D3E5DF] bg-white text-[#4B6B68] hover:text-[#0F2A2A]'
                      }`}
                    >
                      {formatWaterLiters(preset)}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                inputMode="numeric"
                min={500}
                max={10000}
                step={100}
                value={waterTargetMl}
                onChange={(e) => setWaterTargetMl(Number(e.target.value))}
                className="min-h-[44px] w-full rounded-xl border border-[#D3E5DF] bg-white px-3.5 py-2 font-mono text-base text-[#0F2A2A] focus:border-sky-500 focus:outline-none sm:text-sm"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Calorias diárias (kcal)</label>
              <input
                type="number"
                inputMode="numeric"
                min={800}
                max={8000}
                value={calorieTarget}
                onChange={(e) => setCalorieTarget(Number(e.target.value))}
                className="min-h-[44px] w-full rounded-xl border border-[#D3E5DF] bg-white px-3.5 py-2 font-mono text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Proteína (g)</label>
              <input
                type="number"
                inputMode="numeric"
                min={20}
                max={500}
                value={proteinTarget}
                onChange={(e) => setProteinTarget(Number(e.target.value))}
                className="min-h-[44px] w-full rounded-xl border border-[#D3E5DF] bg-white px-3.5 py-2 font-mono text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Carboidrato (g)</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={1000}
                value={carbsTarget}
                onChange={(e) => setCarbsTarget(Number(e.target.value))}
                className="min-h-[44px] w-full rounded-xl border border-[#D3E5DF] bg-white px-3.5 py-2 font-mono text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Gordura (g)</label>
              <input
                type="number"
                inputMode="numeric"
                min={15}
                max={350}
                value={fatTarget}
                onChange={(e) => setFatTarget(Number(e.target.value))}
                className="min-h-[44px] w-full rounded-xl border border-[#D3E5DF] bg-white px-3.5 py-2 font-mono text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#12BFA3] px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#12BFA3]/25 hover:bg-[#0EA88F] disabled:opacity-60 sm:w-auto"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar informações'}
          </button>
          <button
            type="button"
            onClick={logout}
            className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-[#DCECE6] bg-[#F4FAF7] px-4 py-2.5 text-sm font-medium text-[#2E4A48] hover:bg-[#E7F4EF] hover:text-[#0F2A2A] sm:w-auto"
          >
            <LogOut className="h-4 w-4" />
            <span>Criar novo cadastro / Trocar conta</span>
          </button>
        </div>
      </form>

      {/* Summary & Integrations */}
      <aside className="space-y-4 lg:col-span-4">
        <div className="rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] sm:p-6">
          <h3 className="font-display text-base font-semibold text-[#0F2A2A]">Metas diárias ativas</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#648482]">Calorias diárias</dt>
              <dd className="font-mono font-semibold text-[#0C947E] tabular-nums">
                {calorieTarget} kcal
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#648482]">Proteína</dt>
              <dd className="font-mono font-medium text-[#0F2A2A] tabular-nums">{proteinTarget} g</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#648482]">Carboidrato</dt>
              <dd className="font-mono font-medium text-[#0F2A2A] tabular-nums">{carbsTarget} g</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#648482]">Gordura</dt>
              <dd className="font-mono font-medium text-[#D97706] tabular-nums">{fatTarget} g</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#648482]">Hidratação</dt>
              <dd className="font-mono font-semibold text-sky-600 tabular-nums">
                {formatWaterLiters(waterTargetMl)} ({waterTargetMl} ml)
              </dd>
            </div>
          </dl>
        </div>

        {!isNativeApp && (
          <div className="rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] sm:p-6">
            <h3 className="font-display text-base font-semibold text-[#0F2A2A]">App no celular (PWA)</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-[#5C7B79]">
              Instale diretamente na tela inicial do Android ou iPhone para abrir em tela cheia sem passar pela Play Store.
            </p>
            <div className="mt-4">
              <PWAInstallButton />
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)]">
          <h3 className="font-display text-base font-semibold text-[#0F2A2A]">Recursos do aplicativo</h3>
          <dl className="mt-4 space-y-2.5 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-[#648482]">Armazenamento</dt>
              <dd className="text-right font-semibold text-[#0F2A2A]">
                {configInfo?.supabaseConfigured ? 'Sincronizado na nuvem' : 'Salvo no dispositivo'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#648482]">Personal &amp; Nutrição</dt>
              <dd className="text-right font-semibold text-[#0C947E]">
                {configInfo?.geminiConfigured ? 'Assistente IA online ativo' : 'Assistente inteligente integrado'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#648482]">Guia de exercícios</dt>
              <dd className="text-right font-semibold text-[#0C947E]">Demonstrações integradas</dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  );
}
