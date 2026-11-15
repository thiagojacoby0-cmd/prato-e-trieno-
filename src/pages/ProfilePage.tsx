import React, { useState } from 'react';
import { Check, Save } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ActivityLevel, BiologicalSex, GoalType, WorkoutLevel } from '../types';
import { ACTIVITY_LABELS, GOAL_LABELS, WORKOUT_LEVEL_LABELS } from '../utils/nutrition';
import { PWAInstallButton } from '../components/PWAInstallButton';

export function ProfilePage() {
  const { profile, updateProfile, configInfo } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name || '');
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
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  if (!profile) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <form
        onSubmit={handleSave}
        className="space-y-5 rounded-2xl border border-white/8 bg-[#111613] p-6 lg:col-span-8"
      >
        <div className="flex items-center justify-between border-b border-white/8 pb-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#F4F7F5]">Dados biométricos e metas</h2>
            <p className="text-xs text-[#8F9E95]">
              Ao salvar, suas metas calóricas e de macronutrientes são recalculadas automaticamente.
            </p>
          </div>
          {savedNotice && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#22C55E]">
              <Check className="h-4 w-4" /> Salvo
            </span>
          )}
        </div>

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
            <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Idade</label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(Number(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2.5 font-mono text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Altura (cm)</label>
            <input
              type="number"
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
              value={targetWeight}
              onChange={(e) => setTargetWeight(Number(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2.5 font-mono text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Objetivo</label>
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value as GoalType)}
              className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2.5 text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
            >
              {Object.entries(GOAL_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Atividade física</label>
            <select
              value={activityLevel}
              onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
              className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2.5 text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
            >
              {Object.entries(ACTIVITY_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Nível de treino</label>
            <select
              value={workoutLevel}
              onChange={(e) => setWorkoutLevel(e.target.value as WorkoutLevel)}
              className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2.5 text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
            >
              {Object.entries(WORKOUT_LEVEL_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Restrições alimentares</label>
            <input
              type="text"
              value={restrictionsText}
              onChange={(e) => setRestrictionsText(e.target.value)}
              placeholder="Separadas por vírgula"
              className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2.5 text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Equipamentos em casa</label>
          <input
            type="text"
            value={equipmentText}
            onChange={(e) => setEquipmentText(e.target.value)}
            placeholder="Ex: Peso corporal, Tapete, Halteres"
            className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2.5 text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-[#22C55E] px-5 py-2.5 text-sm font-semibold text-[#06120A] hover:bg-[#16A34A] disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Salvando...' : 'Atualizar perfil e metas'}
        </button>
      </form>

      {/* Summary & Integrations */}
      <aside className="space-y-4 lg:col-span-4">
        <div className="rounded-2xl border border-white/8 bg-[#111613] p-6">
          <h3 className="font-display text-base font-semibold text-[#F4F7F5]">Metas calculadas</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#8F9E95]">Calorias diárias</dt>
              <dd className="font-mono font-semibold text-[#22C55E] tabular-nums">
                {profile.daily_calorie_target} kcal
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#8F9E95]">Proteína</dt>
              <dd className="font-mono text-[#F4F7F5] tabular-nums">{profile.protein_target_g} g</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#8F9E95]">Carboidrato</dt>
              <dd className="font-mono text-[#F4F7F5] tabular-nums">{profile.carbs_target_g} g</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#8F9E95]">Gordura</dt>
              <dd className="font-mono text-[#F4F7F5] tabular-nums">{profile.fat_target_g} g</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#8F9E95]">Hidratação</dt>
              <dd className="font-mono text-sky-400 tabular-nums">{profile.water_target_ml} ml</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#111613] p-6">
          <h3 className="font-display text-base font-semibold text-[#F4F7F5]">App no celular (PWA)</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-[#9AA8A0]">
            Instale diretamente na tela inicial do Android ou iPhone para abrir em tela cheia sem passar pela Play Store.
          </p>
          <div className="mt-4">
            <PWAInstallButton />
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#111613] p-6">
          <h3 className="font-display text-base font-semibold text-[#F4F7F5]">Infraestrutura conectada</h3>
          <dl className="mt-4 space-y-2.5 text-xs">
            <div className="flex justify-between">
              <dt className="text-[#8F9E95]">Banco de dados</dt>
              <dd className="font-medium text-[#F4F7F5]">
                {configInfo?.supabaseConfigured ? 'Supabase PostgreSQL' : 'Persistência local (SQLite) · Schema Supabase pronto'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#8F9E95]">Inteligência Artificial</dt>
              <dd className="font-medium text-[#22C55E]">
                {configInfo?.geminiConfigured ? 'Google Gemini conectado' : 'Aguardando chave Gemini'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#8F9E95]">Vídeos tutoriais</dt>
              <dd className="font-medium text-[#22C55E]">Player biomecânico integrado</dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  );
}
