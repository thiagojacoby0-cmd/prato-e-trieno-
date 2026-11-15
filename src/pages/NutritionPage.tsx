import React, { useCallback, useEffect, useState } from 'react';
import { Camera, Check, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { apiRequest } from '../services/apiClient';
import { MealCategory, MealEntry, MealFoodItem, MealPlan } from '../types';
import { formatDateBR, getTodayISO, MEAL_CATEGORY_LABELS } from '../utils/nutrition';

export function NutritionPage() {
  const [tab, setTab] = useState<'diary' | 'planner'>('diary');
  const [selectedDate, setSelectedDate] = useState(getTodayISO());
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(true);

  // Analisador / Registro de refeição
  const [category, setCategory] = useState<MealCategory>('almoco');
  const [aiDescription, setAiDescription] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Campos preenchidos (manual ou pela IA)
  const [title, setTitle] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [analyzedItems, setAnalyzedItems] = useState<MealFoodItem[]>([]);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [savingMeal, setSavingMeal] = useState(false);

  // Gerador de cardápio IA
  const [planPrefs, setPlanPrefs] = useState('');
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [loggedFeedback, setLoggedFeedback] = useState<string | null>(null);

  const loadMealsAndPlans = useCallback(async () => {
    setLoading(true);
    try {
      const [mealsRes, plansRes] = await Promise.all([
        apiRequest<{ meals: MealEntry[] }>(`/api/meals?date=${selectedDate}`),
        apiRequest<{ plans: MealPlan[] }>('/api/meal-plans'),
      ]);
      setMeals(mealsRes.meals);
      setPlans(plansRes.plans);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadMealsAndPlans();
  }, [loadMealsAndPlans]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleAnalyzeWithAI = async () => {
    if (!aiDescription.trim() && !photoFile) {
      setAiError('Descreva os alimentos ou selecione uma foto do prato.');
      return;
    }
    setAnalyzing(true);
    setAiError(null);
    try {
      const formData = new FormData();
      formData.append('description', aiDescription);
      if (photoFile) {
        formData.append('image', photoFile);
      }
      const res = await apiRequest<{
        analysis: {
          title: string;
          description: string;
          calories: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          items: MealFoodItem[];
        };
        image_url: string | null;
      }>('/api/ai/analyze-meal', {
        method: 'POST',
        body: formData,
      });

      setTitle(res.analysis.title);
      setCalories(String(res.analysis.calories));
      setProtein(String(res.analysis.protein_g));
      setCarbs(String(res.analysis.carbs_g));
      setFat(String(res.analysis.fat_g));
      setAnalyzedItems(res.analysis.items || []);
      setUploadedImageUrl(res.image_url);
      if (!aiDescription.trim()) {
        setAiDescription(res.analysis.description);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Falha na análise com IA.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !calories) return;
    setSavingMeal(true);
    try {
      await apiRequest('/api/meals', {
        method: 'POST',
        body: JSON.stringify({
          date: selectedDate,
          category,
          title: title.trim(),
          description: aiDescription.trim(),
          calories: Number(calories),
          protein_g: Number(protein || 0),
          carbs_g: Number(carbs || 0),
          fat_g: Number(fat || 0),
          image_url: uploadedImageUrl,
          items: analyzedItems,
          ai_analyzed: analyzedItems.length > 0,
        }),
      });
      setTitle('');
      setAiDescription('');
      setCalories('');
      setProtein('');
      setCarbs('');
      setFat('');
      setAnalyzedItems([]);
      setPhotoFile(null);
      setPhotoPreview(null);
      setUploadedImageUrl(null);
      await loadMealsAndPlans();
    } finally {
      setSavingMeal(false);
    }
  };

  const handleDeleteMeal = async (id: string) => {
    await apiRequest(`/api/meals/${id}`, { method: 'DELETE' });
    setMeals((prev) => prev.filter((m) => m.id !== id));
  };

  const handleGeneratePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneratingPlan(true);
    setPlanError(null);
    try {
      const res = await apiRequest<{ plan: MealPlan }>('/api/ai/meal-plan', {
        method: 'POST',
        body: JSON.stringify({ preferences: planPrefs }),
      });
      setPlans((prev) => [res.plan, ...prev]);
      setPlanPrefs('');
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Erro ao gerar cardápio.');
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleLogPlannedMeal = async (item: MealPlan['meals'][0]) => {
    await apiRequest('/api/meals', {
      method: 'POST',
      body: JSON.stringify({
        date: getTodayISO(),
        category: item.category,
        title: item.title,
        description: item.description,
        calories: item.calories,
        protein_g: item.protein_g,
        carbs_g: item.carbs_g,
        fat_g: item.fat_g,
        ai_analyzed: true,
      }),
    });
    setLoggedFeedback(`"${item.title}" adicionada ao diário de hoje.`);
    setTimeout(() => setLoggedFeedback(null), 3500);
  };

  const totalDayCalories = meals.reduce((acc, m) => acc + m.calories, 0);
  const totalDayProtein = Math.round(meals.reduce((acc, m) => acc + m.protein_g, 0));

  return (
    <div className="space-y-6">
      {/* Tabs & Date Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 rounded-xl bg-[#111613] p-1 border border-white/8">
          <button
            type="button"
            onClick={() => setTab('diary')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === 'diary' ? 'bg-[#22C55E] text-[#06120A]' : 'text-[#9AA8A0] hover:text-white'
            }`}
          >
            Diário &amp; Analisador de Prato
          </button>
          <button
            type="button"
            onClick={() => setTab('planner')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === 'planner' ? 'bg-[#22C55E] text-[#06120A]' : 'text-[#9AA8A0] hover:text-white'
            }`}
          >
            Cardápios com IA
          </button>
        </div>

        {tab === 'diary' && (
          <div className="flex items-center gap-3">
            <label htmlFor="meal-date" className="text-xs text-[#8F9E95]">
              Data:
            </label>
            <input
              id="meal-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-xl border border-white/10 bg-[#111613] px-3 py-2 font-mono text-xs text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
            />
          </div>
        )}
      </div>

      {tab === 'diary' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Form + AI Analyzer */}
          <section className="rounded-2xl border border-white/8 bg-[#111613] p-6 lg:col-span-5">
            <h2 className="font-display text-lg font-semibold text-[#F4F7F5]">Registrar refeição</h2>
            <p className="mt-1 text-xs text-[#8F9E95]">
              Envie uma foto ou descreva o prato para calcular calorias e macros com Gemini IA, ou preencha manualmente.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Período</label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {(Object.entries(MEAL_CATEGORY_LABELS) as Array<[MealCategory, string]>).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setCategory(k)}
                      className={`rounded-lg border px-2 py-2 text-[11px] font-medium transition-colors truncate ${
                        category === k
                          ? 'border-[#22C55E] bg-[#22C55E]/15 text-[#22C55E]'
                          : 'border-white/10 bg-[#0A0D0B] text-[#9AA8A0] hover:text-white'
                      }`}
                    >
                      {label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">
                  Foto do prato (opcional) ou descrição para análise IA
                </label>
                <textarea
                  rows={3}
                  value={aiDescription}
                  onChange={(e) => setAiDescription(e.target.value)}
                  placeholder="Ex: 150g de frango grelhado, 4 colheres de arroz integral, feijão preto e salada com azeite"
                  className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] p-3 text-sm text-[#F4F7F5] placeholder-[#5F6E65] focus:border-[#22C55E] focus:outline-none"
                />

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2 text-xs font-medium text-[#C2CCC6] hover:bg-white/5">
                    <Camera className="h-4 w-4 text-[#22C55E]" />
                    <span>{photoFile ? 'Trocar foto' : 'Anexar foto'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoSelect}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleAnalyzeWithAI}
                    disabled={analyzing}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/10 px-4 py-2 text-xs font-semibold text-[#22C55E] transition-colors hover:bg-[#22C55E]/20 disabled:opacity-60"
                  >
                    <Sparkles className="h-4 w-4" />
                    {analyzing ? 'Analisando prato...' : 'Calcular macros com IA'}
                  </button>
                </div>

                {photoPreview && (
                  <img
                    src={photoPreview}
                    alt="Prévia da refeição"
                    className="mt-3 h-36 w-full rounded-xl border border-white/10 object-cover"
                  />
                )}

                {aiError && (
                  <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-200">
                    {aiError}
                  </p>
                )}
              </div>

              <form onSubmit={handleSaveMeal} className="space-y-3 border-t border-white/8 pt-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#C2CCC6]">Título da refeição</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Almoço executivo fit"
                    className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2 text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-[11px] text-[#8F9E95]">Calorias</label>
                    <input
                      type="number"
                      required
                      value={calories}
                      onChange={(e) => setCalories(e.target.value)}
                      placeholder="kcal"
                      className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3 py-2 font-mono text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[#8F9E95]">Prot (g)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={protein}
                      onChange={(e) => setProtein(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3 py-2 font-mono text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[#8F9E95]">Carb (g)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={carbs}
                      onChange={(e) => setCarbs(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3 py-2 font-mono text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[#8F9E95]">Gord (g)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={fat}
                      onChange={(e) => setFat(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3 py-2 font-mono text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                    />
                  </div>
                </div>

                {analyzedItems.length > 0 && (
                  <div className="rounded-xl border border-white/8 bg-[#0A0D0B] p-3">
                    <p className="mb-2 text-xs font-medium text-[#22C55E]">Itens identificados pela IA</p>
                    <ul className="space-y-1 text-xs text-[#C2CCC6]">
                      {analyzedItems.map((it, idx) => (
                        <li key={idx} className="flex justify-between gap-2">
                          <span className="truncate">
                            {it.name} ({it.portion})
                          </span>
                          <span className="font-mono text-[#8F9E95] tabular-nums whitespace-nowrap">
                            {it.calories} kcal
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingMeal}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] px-4 py-2.5 text-sm font-semibold text-[#06120A] transition-colors hover:bg-[#16A34A] disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  {savingMeal ? 'Salvando...' : 'Salvar no diário'}
                </button>
              </form>
            </div>
          </section>

          {/* Right Diary List */}
          <section className="space-y-4 lg:col-span-7">
            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-[#111613] p-5">
              <div>
                <p className="text-xs text-[#8F9E95]">Refeições em {formatDateBR(selectedDate)}</p>
                <p className="mt-1 font-mono text-xl font-semibold text-[#F4F7F5] tabular-nums">
                  {totalDayCalories.toLocaleString('pt-BR')} kcal · {totalDayProtein}g proteína
                </p>
              </div>
              <img
                src="/src/assets/images/meal_healthy_bowl_1794693852279.jpg"
                alt="Prato saudável"
                referrerPolicy="no-referrer"
                className="hidden h-16 w-24 rounded-xl border border-white/10 object-cover sm:block"
              />
            </div>

            {loading ? (
              <div className="h-48 animate-pulse rounded-2xl border border-white/8 bg-[#111613]" />
            ) : meals.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-[#111613] p-10 text-center">
                <Upload className="mx-auto h-8 w-8 text-[#5F6E65]" />
                <p className="mt-3 text-sm font-medium text-[#F4F7F5]">Nenhuma refeição registrada nesta data</p>
                <p className="mt-1 text-xs text-[#8F9E95]">
                  Use o formulário ao lado ou envie uma foto do prato para iniciar seu diário.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {meals.map((meal) => (
                  <article
                    key={meal.id}
                    className="flex flex-col justify-between gap-4 rounded-2xl border border-white/8 bg-[#111613] p-5 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 items-start gap-4">
                      {meal.image_url && (
                        <img
                          src={meal.image_url}
                          alt={meal.title}
                          referrerPolicy="no-referrer"
                          className="h-16 w-16 shrink-0 rounded-xl border border-white/10 object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-[#8F9E95]">
                          <span className="font-medium text-[#22C55E]">
                            {MEAL_CATEGORY_LABELS[meal.category]}
                          </span>
                          {meal.ai_analyzed && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>Analisado com IA</span>
                            </>
                          )}
                        </div>
                        <h3 className="mt-0.5 truncate font-display text-base font-semibold text-[#F4F7F5]">
                          {meal.title}
                        </h3>
                        {meal.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-[#9AA8A0]">{meal.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <div className="text-right font-mono tabular-nums">
                        <p className="text-base font-semibold text-[#F4F7F5]">{meal.calories} kcal</p>
                        <p className="text-[11px] text-[#8F9E95]">
                          P {meal.protein_g}g · C {meal.carbs_g}g · G {meal.fat_g}g
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteMeal(meal.id)}
                        className="rounded-lg border border-white/8 p-2 text-[#8F9E95] transition-colors hover:border-red-500/30 hover:text-red-400"
                        aria-label={`Excluir ${meal.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          <form
            onSubmit={handleGeneratePlan}
            className="flex flex-col gap-4 rounded-2xl border border-white/8 bg-[#111613] p-6 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <label htmlFor="plan-prefs" className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">
                Preferências para o cardápio personalizado com IA
              </label>
              <input
                id="plan-prefs"
                type="text"
                value={planPrefs}
                onChange={(e) => setPlanPrefs(e.target.value)}
                placeholder="Ex: Refeições práticas de preparar, café com ovos e almoço brasileiro tradicional"
                className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-4 py-2.5 text-sm text-[#F4F7F5] placeholder-[#5F6E65] focus:border-[#22C55E] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={generatingPlan}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#22C55E] px-5 py-2.5 text-sm font-semibold text-[#06120A] transition-colors hover:bg-[#16A34A] disabled:opacity-60 whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4" />
              {generatingPlan ? 'Gerando cardápio...' : 'Gerar cardápio do dia'}
            </button>
          </form>

          {planError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {planError}
            </div>
          )}

          {loggedFeedback && (
            <div className="flex items-center gap-2 rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/10 p-3 text-sm text-[#22C55E]">
              <Check className="h-4 w-4" />
              <span>{loggedFeedback}</span>
            </div>
          )}

          {plans.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-[#111613] p-10 text-center text-sm text-[#8F9E95]">
              Nenhum cardápio gerado ainda. Clique em &ldquo;Gerar cardápio do dia&rdquo; para criar um plano alinhado às suas metas.
            </div>
          ) : (
            <div className="space-y-6">
              {plans.map((plan) => (
                <div key={plan.id} className="rounded-2xl border border-white/8 bg-[#111613] p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/8 pb-4">
                    <div>
                      <h3 className="font-display text-xl font-semibold text-[#F4F7F5]">{plan.title}</h3>
                      <p className="mt-1 text-sm text-[#9AA8A0]">{plan.notes}</p>
                    </div>
                    <div className="font-mono text-sm text-[#22C55E] tabular-nums">
                      {plan.total_calories} kcal · P {plan.total_protein_g}g · C {plan.total_carbs_g}g · G {plan.total_fat_g}g
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {plan.meals.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col justify-between rounded-xl border border-white/8 bg-[#0C100E] p-4"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs text-[#8F9E95]">
                            <span className="font-medium text-[#22C55E]">
                              {MEAL_CATEGORY_LABELS[item.category] || item.category}
                            </span>
                            <span className="font-mono tabular-nums">{item.time}</span>
                          </div>
                          <h4 className="mt-1.5 font-display text-base font-semibold text-[#F4F7F5]">
                            {item.title}
                          </h4>
                          <p className="mt-1 text-xs leading-relaxed text-[#9AA8A0]">{item.description}</p>
                          <ul className="mt-3 space-y-1 text-xs text-[#C2CCC6]">
                            {item.ingredients.map((ing, i) => (
                              <li key={i}>· {ing}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-white/8 pt-3">
                          <span className="font-mono text-xs text-[#9AA8A0] tabular-nums">
                            {item.calories} kcal · {item.protein_g}g P
                          </span>
                          <button
                            type="button"
                            onClick={() => handleLogPlannedMeal(item)}
                            className="rounded-lg border border-[#22C55E]/40 px-2.5 py-1 text-xs font-medium text-[#22C55E] hover:bg-[#22C55E]/10"
                          >
                            Registrar hoje
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
