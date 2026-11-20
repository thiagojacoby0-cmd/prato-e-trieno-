import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, ChevronLeft, ChevronRight, Minus, Plus, Repeat, Sparkles, Trash2, Upload } from 'lucide-react';
import { NutritionHistory } from '../components/NutritionHistory';
import { apiRequest } from '../services/apiClient';
import { MealCategory, MealEntry, MealFoodItem, MealPlan } from '../types';
import {
  estimateMealLocally,
  extractLeadingQuantity,
  formatFoodItemSummary,
  formatMeasureLabel,
  MEASURE_UNIT_LABELS,
  TACO_TBCA_DISCLAIMER,
  type MealMeasureUnit,
} from '../utils/mealNutritionParser';
import { formatDateBR, getTodayISO, MEAL_CATEGORY_LABELS } from '../utils/nutrition';
import { shiftDateISO } from '../utils/nutritionHistory';
import mealHealthyBowlImg from '../assets/images/meal_healthy_bowl_1794693852279.jpg';

function stripLeadingQtyAndUnit(raw: string): string {
  const leading = extractLeadingQuantity(raw.trim());
  const base = leading.qty !== null && leading.rest ? leading.rest : raw.trim();
  return base
    .replace(
      /^(?:unidades?|unid?s?|un|copos?|x[ií]caras?|colher(?:es)?|fatias?|pratos?|porç(?:ão|ões)|porc(?:ao|oes))\s+(?:de\s+)?/i,
      ''
    )
    .trim();
}

export function NutritionPage() {
  const [tab, setTab] = useState<'diary' | 'history' | 'planner'>('diary');
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
  const [autoCalcStatus, setAutoCalcStatus] = useState<'idle' | 'local' | 'calculating' | 'ai' | 'unavailable'>('idle');

  // Campos preenchidos (manual ou automático) + multiplicador de porções/unidades/copos
  const [title, setTitle] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [analyzedItems, setAnalyzedItems] = useState<MealFoodItem[]>([]);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [savingMeal, setSavingMeal] = useState(false);

  const [servings, setServings] = useState<number>(1);
  const [measureUnit, setMeasureUnit] = useState<MealMeasureUnit>('unidade');
  const [baseMacros, setBaseMacros] = useState<{
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    items: MealFoodItem[];
  } | null>(null);
  const [repeatingMealId, setRepeatingMealId] = useState<string | null>(null);

  const userEditedMacrosRef = useRef(false);
  const userEditedTitleRef = useRef(false);
  const userSelectedUnitRef = useRef(false);
  const aiSeqRef = useRef(0);
  const servingsRef = useRef(servings);
  servingsRef.current = servings;
  const measureUnitRef = useRef(measureUnit);
  measureUnitRef.current = measureUnit;
  const autoCalcStatusRef = useRef(autoCalcStatus);
  autoCalcStatusRef.current = autoCalcStatus;
  const analyzedItemsCountRef = useRef(analyzedItems.length);
  analyzedItemsCountRef.current = analyzedItems.length;

  const [planPrefs, setPlanPrefs] = useState('');
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [diaryError, setDiaryError] = useState<string | null>(null);
  const [loggedFeedback, setLoggedFeedback] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const loadMealsAndPlans = useCallback(async () => {
    setLoading(true);
    setDiaryError(null);
    try {
      const [mealsRes, plansRes] = await Promise.all([
        apiRequest<{ meals: MealEntry[] }>(`/api/meals?date=${selectedDate}`),
        apiRequest<{ plans: MealPlan[] }>('/api/meal-plans'),
      ]);
      setMeals(mealsRes.meals);
      setPlans(plansRes.plans);
    } catch (err) {
      setDiaryError(err instanceof Error ? err.message : 'Erro ao carregar refeições e cardápios.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadMealsAndPlans();
  }, [loadMealsAndPlans]);

  const applyScaledMacros = useCallback(
    (
      base: {
        calories: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
        fiber_g: number;
        items: MealFoodItem[];
      },
      qty: number
    ) => {
      const safeQty = Math.max(0.25, qty);
      setCalories(String(Math.round(base.calories * safeQty)));
      setProtein(String(Number((base.protein_g * safeQty).toFixed(1))));
      setCarbs(String(Number((base.carbs_g * safeQty).toFixed(1))));
      setFat(String(Number((base.fat_g * safeQty).toFixed(1))));
      setFiber(String(Number((base.fiber_g * safeQty).toFixed(1))));
      setAnalyzedItems(
        base.items.map((item) => ({
          ...item,
          portion:
            item.data_available === false
              ? 'Não identificado'
              : Math.abs(safeQty - 1) < 0.01
                ? item.portion
                : `${Number.isInteger(safeQty) ? safeQty : safeQty.toFixed(1).replace('.', ',')}× (${item.portion})`,
          calories: Math.round(item.calories * safeQty),
          protein_g: Number((item.protein_g * safeQty).toFixed(1)),
          carbs_g: Number((item.carbs_g * safeQty).toFixed(1)),
          fat_g: Number((item.fat_g * safeQty).toFixed(1)),
          fiber_g: Number(((item.fiber_g ?? 0) * safeQty).toFixed(1)),
        }))
      );
    },
    []
  );

  const runMealAnalysisWithAI = useCallback(
    async (opts?: {
      descriptionOverride?: string;
      fileOverride?: File | null;
      silent?: boolean;
      seq?: number;
      servingsOverride?: number;
      unitOverride?: MealMeasureUnit;
    }) => {
      const activeDesc = (opts?.descriptionOverride ?? aiDescription).trim();
      const activeFile = opts?.fileOverride !== undefined ? opts.fileOverride : photoFile;
      const activeServings = opts?.servingsOverride ?? servingsRef.current;
      const activeUnit = opts?.unitOverride ?? measureUnitRef.current;

      if (!activeDesc && !activeFile) {
        if (!opts?.silent) {
          setAiError('Descreva os alimentos ou selecione uma foto do prato.');
        }
        return;
      }

      const seq = opts?.seq ?? ++aiSeqRef.current;
      setAnalyzing(true);
      if (!opts?.silent) {
        setAiError(null);
      }

      try {
        const hasGramsOrMl = /^\d+(?:[.,]\d+)?\s*(?:g|gr|gramas?|ml)\b/i.test(activeDesc);
        const leading = hasGramsOrMl ? { qty: null, rest: activeDesc } : extractLeadingQuantity(activeDesc);

        let queryDescription = activeDesc;
        let shouldScaleByServings = false;
        let detectedAutoQty: number | null = null;
        let detectedAutoUnit: MealMeasureUnit | null = null;

        if (activeDesc && activeServings !== 1) {
          const cleanRest = stripLeadingQtyAndUnit(activeDesc) || activeDesc;
          queryDescription = hasGramsOrMl
            ? activeDesc
            : `1 ${formatMeasureLabel(activeUnit, 1)} de ${cleanRest}`;
          shouldScaleByServings = true;
        } else if (activeDesc && activeServings === 1 && leading.qty && leading.qty > 1) {
          detectedAutoQty = leading.qty;
          const localGuess = estimateMealLocally(activeDesc);
          detectedAutoUnit = localGuess.detectedUnit || activeUnit;
        }

        const formData = new FormData();
        formData.append('description', queryDescription);
        if (activeFile) {
          formData.append('image', activeFile);
        }

        const res = await apiRequest<{
          analysis: {
            title: string;
            description: string;
            data_available?: boolean;
            calories: number;
            protein_g: number;
            carbs_g: number;
            fat_g: number;
            fiber_g?: number;
            items: MealFoodItem[];
          };
          image_url: string | null;
        }>('/api/ai/analyze-meal', {
          method: 'POST',
          body: formData,
        });

        // Se o usuário continuou digitando ou mudou valores manualmente durante a chamada, ignora resposta antiga
        if (seq !== aiSeqRef.current) return;
        if (opts?.silent && userEditedMacrosRef.current) return;

        if (res.analysis.data_available === false) {
          if (!userEditedTitleRef.current && res.analysis.title) {
            setTitle(res.analysis.title);
          }
          setBaseMacros(null);
          setCalories('');
          setProtein('');
          setCarbs('');
          setFat('');
          setFiber('');
          setAnalyzedItems(res.analysis.items || []);
          setAutoCalcStatus('unavailable');
          if (res.image_url) setUploadedImageUrl(res.image_url);
          return;
        }

        const returnedItems = res.analysis.items || [];
        const totalFiber =
          typeof res.analysis.fiber_g === 'number'
            ? res.analysis.fiber_g
            : Number(returnedItems.reduce((a, it) => a + (it.fiber_g ?? 0), 0).toFixed(1));

        if (shouldScaleByServings) {
          const perUnitBase = {
            calories: res.analysis.calories,
            protein_g: res.analysis.protein_g,
            carbs_g: res.analysis.carbs_g,
            fat_g: res.analysis.fat_g,
            fiber_g: totalFiber,
            items: returnedItems,
          };
          setBaseMacros(perUnitBase);
          applyScaledMacros(perUnitBase, activeServings);
          if (!userEditedTitleRef.current) {
            const cleanTitle = stripLeadingQtyAndUnit(activeDesc) || activeDesc;
            setTitle(
              `${Number.isInteger(activeServings) ? activeServings : activeServings.toFixed(1).replace('.', ',')} ${formatMeasureLabel(activeUnit, activeServings)} de ${cleanTitle}`
            );
          }
        } else if (detectedAutoQty && detectedAutoQty > 1) {
          const perUnitBase = {
            calories: res.analysis.calories / detectedAutoQty,
            protein_g: res.analysis.protein_g / detectedAutoQty,
            carbs_g: res.analysis.carbs_g / detectedAutoQty,
            fat_g: res.analysis.fat_g / detectedAutoQty,
            fiber_g: totalFiber / detectedAutoQty,
            items: returnedItems.map((it) => ({
              ...it,
              portion: `1 ${formatMeasureLabel(detectedAutoUnit || 'unidade', 1)}`,
              calories: it.calories / detectedAutoQty!,
              protein_g: it.protein_g / detectedAutoQty!,
              carbs_g: it.carbs_g / detectedAutoQty!,
              fat_g: it.fat_g / detectedAutoQty!,
              fiber_g: (it.fiber_g ?? 0) / detectedAutoQty!,
            })),
          };
          setBaseMacros(perUnitBase);
          setServings(detectedAutoQty);
          if (detectedAutoUnit && !userSelectedUnitRef.current) setMeasureUnit(detectedAutoUnit);
          if (!userEditedTitleRef.current) setTitle(res.analysis.title);
          setCalories(String(Math.round(res.analysis.calories)));
          setProtein(String(res.analysis.protein_g));
          setCarbs(String(res.analysis.carbs_g));
          setFat(String(res.analysis.fat_g));
          setFiber(String(totalFiber));
          setAnalyzedItems(returnedItems);
        } else {
          const base = {
            calories: res.analysis.calories,
            protein_g: res.analysis.protein_g,
            carbs_g: res.analysis.carbs_g,
            fat_g: res.analysis.fat_g,
            fiber_g: totalFiber,
            items: returnedItems,
          };
          setBaseMacros(base);
          if (!userEditedTitleRef.current) setTitle(res.analysis.title);
          setCalories(String(res.analysis.calories));
          setProtein(String(res.analysis.protein_g));
          setCarbs(String(res.analysis.carbs_g));
          setFat(String(res.analysis.fat_g));
          setFiber(String(totalFiber));
          setAnalyzedItems(returnedItems);
        }

        if (res.image_url) setUploadedImageUrl(res.image_url);
        if (!activeDesc && !opts?.silent) {
          setAiDescription(res.analysis.description);
        }
        setAutoCalcStatus('ai');
      } catch (err) {
        if (seq === aiSeqRef.current) {
          if (opts?.silent) {
            setAutoCalcStatus((prev) =>
              prev === 'calculating' ? (analyzedItemsCountRef.current > 0 ? 'local' : 'unavailable') : prev
            );
          } else {
            setAiError(err instanceof Error ? err.message : 'Falha na análise com IA.');
          }
        }
      } finally {
        if (seq === aiSeqRef.current) {
          setAnalyzing(false);
        }
      }
    },
    [aiDescription, applyScaledMacros, photoFile]
  );

  // Cálculo automático em tempo real conforme o usuário digita a descrição do prato
  useEffect(() => {
    const trimmed = aiDescription.trim();

    if (!trimmed) {
      aiSeqRef.current += 1;
      setAnalyzing(false);
      if (!photoFile && !userEditedMacrosRef.current && autoCalcStatusRef.current !== 'idle') {
        if (!userEditedTitleRef.current) setTitle('');
        setCalories('');
        setProtein('');
        setCarbs('');
        setFat('');
        setFiber('');
        setAnalyzedItems([]);
        setBaseMacros(null);
        setServings(1);
        userSelectedUnitRef.current = false;
        setAutoCalcStatus('idle');
      }
      return;
    }

    // Ao alterar a descrição, volta a permitir preenchimento automático
    userEditedMacrosRef.current = false;
    setAiError(null);

    let aiTimer: number | undefined;
    const instantTimer = window.setTimeout(() => {
      const hasGramsOrMl = /^\d+(?:[.,]\d+)?\s*(?:g|gr|gramas?|ml)\b/i.test(trimmed);
      const leading = hasGramsOrMl ? { qty: null, rest: trimmed } : extractLeadingQuantity(trimmed);
      const directEst = estimateMealLocally(trimmed);

      const currentServings = servingsRef.current;
      const currentUnit = measureUnitRef.current;

      if (!directEst.dataAvailable) {
        setBaseMacros(null);
        setCalories('');
        setProtein('');
        setCarbs('');
        setFat('');
        setFiber('');
        setAnalyzedItems(directEst.items);
        if (!userEditedTitleRef.current) setTitle(trimmed.slice(0, 60));
        setAutoCalcStatus(trimmed.length >= 3 ? 'calculating' : 'idle');
      } else if (leading.qty !== null) {
        // Usuário digitou a quantidade no texto (ex: "3 bananas", "2 copos de leite")
        const qty = Math.max(0.5, Math.min(30, leading.qty));
        const unitToUse = directEst.detectedUnit || currentUnit;
        const perUnitBase = {
          calories: directEst.calories / qty,
          protein_g: directEst.protein_g / qty,
          carbs_g: directEst.carbs_g / qty,
          fat_g: directEst.fat_g / qty,
          fiber_g: directEst.fiber_g / qty,
          items: directEst.items.map((it) => ({
            ...it,
            portion: `1 ${formatMeasureLabel(unitToUse, 1)}`,
            calories: it.calories / qty,
            protein_g: it.protein_g / qty,
            carbs_g: it.carbs_g / qty,
            fat_g: it.fat_g / qty,
            fiber_g: (it.fiber_g ?? 0) / qty,
          })),
        };
        setServings(qty);
        if (directEst.detectedUnit) {
          userSelectedUnitRef.current = false;
          setMeasureUnit(directEst.detectedUnit);
        }
        setBaseMacros(perUnitBase);
        if (!userEditedTitleRef.current) setTitle(directEst.title);
        setCalories(String(Math.round(directEst.calories)));
        setProtein(String(directEst.protein_g));
        setCarbs(String(directEst.carbs_g));
        setFat(String(directEst.fat_g));
        setFiber(String(directEst.fiber_g));
        setAnalyzedItems(directEst.items);
        setAutoCalcStatus(directEst.needsAiRefinement && trimmed.length >= 3 ? 'calculating' : 'local');
      } else {
        // Sem número na frente (ex: "banana", "leite", "150g de frango")
        let unitEst = directEst;
        let resolvedUnit = currentUnit;

        if (!hasGramsOrMl) {
          if (directEst.detectedUnit && !userSelectedUnitRef.current) {
            resolvedUnit = directEst.detectedUnit;
            setMeasureUnit(resolvedUnit);
          } else if (userSelectedUnitRef.current) {
            const cleanFood = stripLeadingQtyAndUnit(trimmed) || trimmed;
            unitEst = estimateMealLocally(`1 ${formatMeasureLabel(resolvedUnit, 1)} de ${cleanFood}`);
          }
        }

        const perUnitBase = {
          calories: unitEst.calories,
          protein_g: unitEst.protein_g,
          carbs_g: unitEst.carbs_g,
          fat_g: unitEst.fat_g,
          fiber_g: unitEst.fiber_g,
          items: unitEst.items,
        };
        setBaseMacros(perUnitBase);
        applyScaledMacros(perUnitBase, currentServings);
        if (!userEditedTitleRef.current) {
          setTitle(directEst.title);
        }
        setAutoCalcStatus(directEst.needsAiRefinement && trimmed.length >= 3 ? 'calculating' : 'local');
      }

      // Se algum alimento não estiver exatamente na TACO/TBCA local, refina automaticamente via IA com fontes extras
      if ((!directEst.allMatched || directEst.needsAiRefinement) && trimmed.length >= 3) {
        const seq = ++aiSeqRef.current;
        aiTimer = window.setTimeout(() => {
          void runMealAnalysisWithAI({
            descriptionOverride: trimmed,
            silent: true,
            seq,
          });
        }, 650);
      }
    }, 180);

    return () => {
      window.clearTimeout(instantTimer);
      if (aiTimer !== undefined) {
        window.clearTimeout(aiTimer);
      }
    };
  }, [aiDescription, applyScaledMacros, photoFile, runMealAnalysisWithAI]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    userEditedMacrosRef.current = false;
    setPhotoFile(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    const seq = ++aiSeqRef.current;
    void runMealAnalysisWithAI({ fileOverride: file, seq });
  };

  const handleServingsChange = (nextRaw: number) => {
    const nextQty = Math.max(0.5, Math.min(30, Number(nextRaw.toFixed(2))));
    const prevQty = Math.max(0.25, servings);
    setServings(nextQty);

    if (baseMacros) {
      applyScaledMacros(baseMacros, nextQty);
      return;
    }

    // Se o usuário digitou valores manualmente antes de aumentar a quantidade, escala a partir deles
    const calNum = Number(calories);
    if (calories && Number.isFinite(calNum) && calNum > 0) {
      const inferredBase = {
        calories: calNum / prevQty,
        protein_g: Number(protein || 0) / prevQty,
        carbs_g: Number(carbs || 0) / prevQty,
        fat_g: Number(fat || 0) / prevQty,
        fiber_g: Number(fiber || 0) / prevQty,
        items: analyzedItems.map((it) => ({
          ...it,
          calories: it.calories / prevQty,
          protein_g: it.protein_g / prevQty,
          carbs_g: it.carbs_g / prevQty,
          fat_g: it.fat_g / prevQty,
          fiber_g: (it.fiber_g ?? 0) / prevQty,
        })),
      };
      setBaseMacros(inferredBase);
      applyScaledMacros(inferredBase, nextQty);
    }
  };

  const handleMeasureUnitChange = (nextUnit: MealMeasureUnit) => {
    userSelectedUnitRef.current = true;
    setMeasureUnit(nextUnit);

    const trimmed = aiDescription.trim();
    if (!trimmed) return;
    const hasGramsOrMl = /^\d+(?:[.,]\d+)?\s*(?:g|gr|gramas?|ml)\b/i.test(trimmed);
    if (hasGramsOrMl) return;

    const cleanFood = stripLeadingQtyAndUnit(trimmed) || trimmed;
    const singleUnitEst = estimateMealLocally(`1 ${formatMeasureLabel(nextUnit, 1)} de ${cleanFood}`);
    if (!singleUnitEst.dataAvailable) return;

    const perUnitBase = {
      calories: singleUnitEst.calories,
      protein_g: singleUnitEst.protein_g,
      carbs_g: singleUnitEst.carbs_g,
      fat_g: singleUnitEst.fat_g,
      fiber_g: singleUnitEst.fiber_g,
      items: singleUnitEst.items,
    };
    setBaseMacros(perUnitBase);
    applyScaledMacros(perUnitBase, servings);
    setAutoCalcStatus('local');
  };

  const handleManualMacroEdit = (field: 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber', rawVal: string) => {
    userEditedMacrosRef.current = true;
    if (field === 'calories') setCalories(rawVal);
    if (field === 'protein') setProtein(rawVal);
    if (field === 'carbs') setCarbs(rawVal);
    if (field === 'fat') setFat(rawVal);
    if (field === 'fiber') setFiber(rawVal);

    const safeQty = Math.max(0.25, servings);
    const nextCal = field === 'calories' ? Number(rawVal || 0) : Number(calories || 0);
    const nextProt = field === 'protein' ? Number(rawVal || 0) : Number(protein || 0);
    const nextCarbs = field === 'carbs' ? Number(rawVal || 0) : Number(carbs || 0);
    const nextFat = field === 'fat' ? Number(rawVal || 0) : Number(fat || 0);
    const nextFiber = field === 'fiber' ? Number(rawVal || 0) : Number(fiber || 0);

    setBaseMacros((prev) => ({
      calories: nextCal / safeQty,
      protein_g: nextProt / safeQty,
      carbs_g: nextCarbs / safeQty,
      fat_g: nextFat / safeQty,
      fiber_g: nextFiber / safeQty,
      items: prev?.items || [],
    }));
  };

  const handleAnalyzeWithAI = async () => {
    userEditedMacrosRef.current = false;
    await runMealAnalysisWithAI();
  };

  const handleSaveMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    const parseDecimal = (val: string) => Number(String(val || '0').replace(',', '.'));
    const calNum = parseDecimal(calories);
    if (!title.trim() || !calories || !Number.isFinite(calNum) || calNum < 0) {
      setDiaryError('Informe um título e um valor válido de calorias.');
      return;
    }
    setSavingMeal(true);
    setDiaryError(null);
    try {
      const qtyLabel =
        servings !== 1
          ? `${Number.isInteger(servings) ? servings : servings.toFixed(1).replace('.', ',')} ${formatMeasureLabel(measureUnit, servings)}`
          : null;
      const trimmedTitle = title.trim();
      const finalTitle =
        qtyLabel && !/^\d/.test(trimmedTitle) && !trimmedTitle.toLowerCase().includes(qtyLabel.toLowerCase())
          ? `${trimmedTitle} (${qtyLabel})`
          : trimmedTitle;

      const safeNum = (val: string) => {
        const n = parseDecimal(val);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      };

      await apiRequest('/api/meals', {
        method: 'POST',
        body: JSON.stringify({
          date: selectedDate,
          category,
          title: finalTitle,
          description: aiDescription.trim() || (qtyLabel ? `Quantidade registrada: ${qtyLabel}` : ''),
          calories: Math.round(calNum),
          protein_g: safeNum(protein),
          carbs_g: safeNum(carbs),
          fat_g: safeNum(fat),
          fiber_g: safeNum(fiber),
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
      setFiber('');
      setAnalyzedItems([]);
      setBaseMacros(null);
      setServings(1);
      setPhotoFile(null);
      setPhotoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setUploadedImageUrl(null);
      setAutoCalcStatus('idle');
      userEditedMacrosRef.current = false;
      userEditedTitleRef.current = false;
      userSelectedUnitRef.current = false;
      await loadMealsAndPlans();
    } catch (err) {
      setDiaryError(err instanceof Error ? err.message : 'Não foi possível salvar a refeição.');
    } finally {
      setSavingMeal(false);
    }
  };

  const handleRepeatMeal = async (meal: MealEntry) => {
    setRepeatingMealId(meal.id);
    setDiaryError(null);
    try {
      await apiRequest('/api/meals', {
        method: 'POST',
        body: JSON.stringify({
          date: selectedDate,
          category: meal.category,
          title: meal.title,
          description: meal.description || 'Porção repetida no diário',
          calories: meal.calories,
          protein_g: meal.protein_g,
          carbs_g: meal.carbs_g,
          fat_g: meal.fat_g,
          fiber_g: meal.fiber_g ?? 0,
          image_url: meal.image_url || null,
          items: meal.items || [],
          ai_analyzed: Boolean(meal.ai_analyzed),
        }),
      });
      await loadMealsAndPlans();
    } catch (err) {
      setDiaryError(err instanceof Error ? err.message : 'Não foi possível repetir a refeição.');
    } finally {
      setRepeatingMealId(null);
    }
  };

  const handleDeleteMeal = async (id: string) => {
    setDiaryError(null);
    try {
      await apiRequest(`/api/meals/${id}`, { method: 'DELETE' });
      setMeals((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setDiaryError(err instanceof Error ? err.message : 'Não foi possível excluir a refeição.');
    }
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
    setPlanError(null);
    try {
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
          fiber_g: item.fiber_g ?? 0,
          ai_analyzed: true,
        }),
      });
      setLoggedFeedback(`"${item.title}" adicionada ao diário de hoje.`);
      setTimeout(() => setLoggedFeedback(null), 3500);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Erro ao registrar refeição do cardápio.');
    }
  };

  const totalDayCalories = meals.reduce((acc, m) => acc + m.calories, 0);
  const totalDayProtein = Math.round(meals.reduce((acc, m) => acc + m.protein_g, 0));
  const totalDayFiber = Number(meals.reduce((acc, m) => acc + (m.fiber_g ?? 0), 0).toFixed(1));

  const todayISO = getTodayISO();

  return (
    <div className="space-y-6">
      {/* Tabs & Date Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-[#DCECE6] bg-[#EDF7F3] p-1">
          <button
            type="button"
            onClick={() => setTab('diary')}
            className={`min-h-[42px] shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
              tab === 'diary' ? 'bg-[#15C8AA] text-[#062924] shadow-sm' : 'text-[#4B6B68] hover:text-[#0F2A2A]'
            }`}
          >
            Diário do Prato
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`min-h-[42px] shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
              tab === 'history' ? 'bg-[#15C8AA] text-[#062924] shadow-sm' : 'text-[#4B6B68] hover:text-[#0F2A2A]'
            }`}
          >
            Histórico
          </button>
          <button
            type="button"
            onClick={() => setTab('planner')}
            className={`min-h-[42px] shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
              tab === 'planner' ? 'bg-[#15C8AA] text-[#062924] shadow-sm' : 'text-[#4B6B68] hover:text-[#0F2A2A]'
            }`}
          >
            Cardápios com IA
          </button>
        </div>

        {tab === 'diary' && (
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <div className="flex items-center gap-1 rounded-2xl border border-[#DCECE6] bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setSelectedDate((prev) => shiftDateISO(prev, -1))}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-[#4B6B68] transition-colors hover:bg-[#F4FAF7] hover:text-[#0F2A2A]"
                aria-label="Dia anterior"
                title="Dia anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input
                id="meal-date"
                type="date"
                max={todayISO}
                value={selectedDate}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  setSelectedDate(val > todayISO ? todayISO : val);
                }}
                aria-label="Selecionar data do diário"
                className="min-h-[36px] bg-transparent px-2 py-1 font-mono text-sm font-medium text-[#0F2A2A] focus:outline-none sm:text-xs"
              />
              <button
                type="button"
                onClick={() =>
                  setSelectedDate((prev) => {
                    const next = shiftDateISO(prev, 1);
                    return next > todayISO ? todayISO : next;
                  })
                }
                disabled={selectedDate >= todayISO}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-[#4B6B68] transition-colors hover:bg-[#F4FAF7] hover:text-[#0F2A2A] disabled:opacity-35"
                aria-label="Próximo dia"
                title="Próximo dia"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSelectedDate(todayISO)}
              disabled={selectedDate === todayISO}
              className="min-h-[42px] rounded-2xl border border-[#BCE6DC] bg-[#E3F7F2] px-3.5 py-2 text-xs font-semibold text-[#0B7C6A] transition-colors hover:bg-[#D4F3EA] disabled:opacity-45 whitespace-nowrap"
            >
              Hoje
            </button>
          </div>
        )}
      </div>

      {tab === 'history' ? (
        <NutritionHistory
          onOpenDateInDiary={(date) => {
            setSelectedDate(date > todayISO ? todayISO : date);
            setTab('diary');
          }}
          onMealRepeatedToday={() => {
            if (selectedDate === getTodayISO()) {
              void loadMealsAndPlans();
            }
          }}
        />
      ) : tab === 'diary' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Form + AI Analyzer */}
          <section className="rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] sm:p-6 lg:col-span-5">
            <h2 className="font-display text-lg font-bold text-[#0F2A2A]">Registrar refeição</h2>
            <p className="mt-1 text-xs text-[#5C7B79]">
              Digite os alimentos ou envie uma foto — calorias e macros são calculados automaticamente conforme você escreve ou ajusta a quantidade.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#2E4A48]">Período</label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {(Object.entries(MEAL_CATEGORY_LABELS) as Array<[MealCategory, string]>).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setCategory(k)}
                      className={`min-h-[40px] rounded-xl border px-2 py-2 text-xs font-semibold transition-colors truncate sm:text-[11px] ${
                        category === k
                          ? 'border-[#12BFA3] bg-[#E3F7F2] text-[#0B7C6A]'
                          : 'border-[#DCECE6] bg-[#F4FAF7] text-[#4B6B68] hover:text-[#0F2A2A]'
                      }`}
                    >
                      {label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#2E4A48]">
                  Foto do prato (opcional) ou descrição
                </label>
                <textarea
                  rows={3}
                  value={aiDescription}
                  onChange={(e) => setAiDescription(e.target.value)}
                  placeholder="Ex: 3 bananas, ou 3 copos de leite, ou 150g de frango grelhado com arroz"
                  className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] p-3 text-base text-[#0F2A2A] placeholder-[#7C9A98] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                />

                {/* Seletor de Quantidade & Medida (ex: 3 unidades, 3 copos, 2 porções) */}
                <div className="mt-3 rounded-2xl border border-[#DCECE6] bg-[#F4FAF7] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#2E4A48]">Quantidade da alimentação</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4].map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => handleServingsChange(q)}
                          className={`min-h-[30px] rounded-lg px-2.5 font-mono text-xs font-semibold transition-colors ${
                            Math.abs(servings - q) < 0.01
                              ? 'bg-[#12BFA3] text-white'
                              : 'border border-[#D3E5DF] bg-white text-[#4B6B68] hover:text-[#0F2A2A]'
                          }`}
                        >
                          {q}×
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <div className="flex items-center rounded-xl border border-[#D3E5DF] bg-white">
                      <button
                        type="button"
                        onClick={() => handleServingsChange(Math.max(0.5, servings - (servings <= 1 ? 0.5 : 1)))}
                        className="flex h-10 w-10 items-center justify-center text-[#4B6B68] hover:text-[#0F2A2A]"
                        aria-label="Diminuir quantidade"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        type="number"
                        min="0.5"
                        max="30"
                        step="0.5"
                        value={servings}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isNaN(v) && v > 0) handleServingsChange(v);
                        }}
                        aria-label="Quantidade de porções ou unidades"
                        className="w-12 bg-transparent text-center font-mono text-sm font-bold text-[#0F2A2A] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleServingsChange(servings + 1)}
                        className="flex h-10 w-10 items-center justify-center text-[#4B6B68] hover:text-[#0F2A2A]"
                        aria-label="Aumentar quantidade"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <select
                      value={measureUnit}
                      onChange={(e) => handleMeasureUnitChange(e.target.value as MealMeasureUnit)}
                      aria-label="Tipo de medida"
                      className="min-h-[40px] flex-1 rounded-xl border border-[#D3E5DF] bg-white px-3 py-2 text-xs font-medium text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none"
                    >
                      {(Object.keys(MEASURE_UNIT_LABELS) as MealMeasureUnit[]).map((unitKey) => (
                        <option key={unitKey} value={unitKey}>
                          {formatMeasureLabel(unitKey, servings)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {baseMacros && servings !== 1 && (
                    <p className="mt-2 text-[11px] font-semibold text-[#0C947E] tabular-nums">
                      Total para {Number.isInteger(servings) ? servings : servings.toFixed(1).replace('.', ',')}{' '}
                      {formatMeasureLabel(measureUnit, servings)}: {calories || 0} kcal (
                      {Math.round(baseMacros.calories)} kcal por {formatMeasureLabel(measureUnit, 1)})
                    </p>
                  )}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2 text-xs font-semibold text-[#2E4A48] hover:bg-[#E7F4EF]">
                    <Camera className="h-4 w-4 text-[#0C947E]" />
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
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#BCE6DC] bg-[#E3F7F2] px-4 py-2 text-xs font-semibold text-[#0B7C6A] transition-colors hover:bg-[#D4F3EA] disabled:opacity-60"
                  >
                    <Sparkles className="h-4 w-4" />
                    {analyzing
                      ? 'Calculando com IA...'
                      : autoCalcStatus !== 'idle'
                        ? 'Recalcular com IA'
                        : 'Calcular macros'}
                  </button>

                  {(analyzing || autoCalcStatus === 'calculating') && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-[#BCE6DC] bg-[#EDF9F6] px-2.5 py-1 text-[11px] font-semibold text-[#0C947E]">
                      Calculando (TACO + fontes extras)...
                    </span>
                  )}
                  {autoCalcStatus === 'unavailable' && !analyzing && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-[#F7D79C] bg-[#FFF4E2] px-2.5 py-1 text-[11px] font-semibold text-[#9A5B13]">
                      Não identificado — descreva os ingredientes
                    </span>
                  )}
                  {(autoCalcStatus === 'local' || autoCalcStatus === 'ai') && !analyzing && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-[#E3F7F2] px-2.5 py-1 text-[11px] font-semibold text-[#0B7C6A]">
                      <Check className="h-3 w-3" />
                      {autoCalcStatus === 'ai'
                        ? 'Calculado pela IA (TACO + fontes extras)'
                        : analyzedItems.some((it) => it.source && !['TACO', 'TBCA'].includes(it.source))
                          ? 'TACO + Cálculo nutricional'
                          : 'Base TACO / TBCA'}
                    </span>
                  )}
                </div>

                {photoPreview && (
                  <img
                    src={photoPreview}
                    alt="Prévia da refeição"
                    className="mt-3 h-36 w-full rounded-2xl border border-[#DCECE6] object-cover"
                  />
                )}

                {aiError && (
                  <p className="mt-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                    {aiError}
                  </p>
                )}
              </div>

              <form onSubmit={handleSaveMeal} className="space-y-3 border-t border-[#E1EEE9] pt-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#2E4A48]">Título da refeição</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => {
                      userEditedTitleRef.current = e.target.value.trim().length > 0;
                      setTitle(e.target.value);
                    }}
                    placeholder="Ex: 3 bananas ou Arroz branco e frango"
                    className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2 text-sm text-[#0F2A2A] placeholder-[#7C9A98] focus:border-[#12BFA3] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-[#5C7B79]">Calorias (kcal)</label>
                    <input
                      type="number"
                      required
                      value={calories}
                      onChange={(e) => handleManualMacroEdit('calories', e.target.value)}
                      placeholder="kcal"
                      className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-2 font-mono text-sm text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-[#5C7B79]">Carbo (g)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={carbs}
                      onChange={(e) => handleManualMacroEdit('carbs', e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-2 font-mono text-sm text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-[#5C7B79]">Prot (g)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={protein}
                      onChange={(e) => handleManualMacroEdit('protein', e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-2 font-mono text-sm text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-[#5C7B79]">Gord (g)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={fat}
                      onChange={(e) => handleManualMacroEdit('fat', e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-2 font-mono text-sm text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="mb-1 block text-[11px] font-medium text-[#5C7B79]">Fibra (g)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={fiber}
                      onChange={(e) => handleManualMacroEdit('fiber', e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-2 font-mono text-sm text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none"
                    />
                  </div>
                </div>

                {analyzedItems.length > 0 && (
                  <div className="rounded-2xl border border-[#DCECE6] bg-[#F4FAF7] p-3">
                    <p className="mb-2 text-xs font-semibold text-[#0C947E]">Detalhamento nutricional por alimento</p>
                    <ul className="space-y-1.5 text-xs text-[#2E4A48]">
                      {analyzedItems.map((it, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {formatFoodItemSummary(it)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="rounded-xl border border-[#E1EEE9] bg-[#F4FAF7] px-3 py-2 text-[11px] leading-relaxed text-[#5C7B79]">
                  {TACO_TBCA_DISCLAIMER}
                </p>

                <button
                  type="submit"
                  disabled={savingMeal}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#12BFA3] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0EA88F] disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  {savingMeal ? 'Salvando...' : 'Salvar no diário'}
                </button>
              </form>
            </div>
          </section>

          {/* Right Diary List */}
          <section className="space-y-4 lg:col-span-7">
            <div className="flex items-center justify-between rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)]">
              <div>
                <p className="text-xs font-medium text-[#5C7B79]">Refeições em {formatDateBR(selectedDate)}</p>
                <p className="mt-1 font-mono text-xl font-bold text-[#0F2A2A] tabular-nums">
                  {totalDayCalories.toLocaleString('pt-BR')} kcal · {totalDayProtein}g proteína
                  {totalDayFiber > 0 ? ` · ${totalDayFiber}g fibras` : ''}
                </p>
              </div>
              <img
                src={mealHealthyBowlImg}
                alt="Prato saudável"
                referrerPolicy="no-referrer"
                className="hidden h-16 w-24 rounded-2xl border border-[#DCECE6] object-cover sm:block"
              />
            </div>

            {diaryError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {diaryError}
              </div>
            )}

            {loading ? (
              <div className="h-48 animate-pulse rounded-3xl border border-[#E1EEE9] bg-white" />
            ) : meals.length === 0 ? (
              <div className="rounded-3xl border border-[#E1EEE9] bg-white p-10 text-center">
                <Upload className="mx-auto h-8 w-8 text-[#7C9A98]" />
                <p className="mt-3 text-sm font-semibold text-[#0F2A2A]">Nenhuma refeição registrada nesta data</p>
                <p className="mt-1 text-xs text-[#5C7B79]">
                  Use o formulário ao lado ou envie uma foto do prato para iniciar seu diário.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {meals.map((meal) => (
                  <article
                    key={meal.id}
                    className="flex flex-col justify-between gap-4 rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_8px_24px_-14px_rgba(15,42,42,0.08)] sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 items-start gap-4">
                      {meal.image_url && (
                        <img
                          src={meal.image_url}
                          alt={meal.title}
                          referrerPolicy="no-referrer"
                          className="h-16 w-16 shrink-0 rounded-2xl border border-[#DCECE6] object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-[#5C7B79]">
                          <span className="font-semibold text-[#0C947E]">
                            {MEAL_CATEGORY_LABELS[meal.category]}
                          </span>
                          {meal.ai_analyzed && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>TACO + Cálculo IA</span>
                            </>
                          )}
                        </div>
                        <h3 className="mt-0.5 truncate font-display text-base font-bold text-[#0F2A2A]">
                          {meal.title}
                        </h3>
                        {meal.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-[#4B6B68]">{meal.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <div className="text-right font-mono tabular-nums">
                        <p className="text-base font-bold text-[#0F2A2A]">{meal.calories} kcal</p>
                        <p className="text-[11px] text-[#5C7B79]">
                          Carbo {meal.carbs_g}g · Prot {meal.protein_g}g · Gord {meal.fat_g}g · Fibra {meal.fiber_g ?? 0}g
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRepeatMeal(meal)}
                        disabled={repeatingMealId === meal.id}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-[#BCE6DC] bg-[#E3F7F2] px-2.5 py-1.5 font-mono text-xs font-semibold text-[#0B7C6A] transition-colors hover:bg-[#D4F3EA] disabled:opacity-60"
                        title="Registrar mais 1 vez no diário"
                        aria-label={`Repetir mais 1 vez ${meal.title}`}
                      >
                        <Repeat className="h-3.5 w-3.5" />
                        +1×
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMeal(meal.id)}
                        className="rounded-xl border border-[#DCECE6] bg-[#F4FAF7] p-2 text-[#5C7B79] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
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
            className="flex flex-col gap-4 rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <label htmlFor="plan-prefs" className="mb-1.5 block text-xs font-semibold text-[#2E4A48]">
                Preferências para o cardápio personalizado com IA
              </label>
              <input
                id="plan-prefs"
                type="text"
                value={planPrefs}
                onChange={(e) => setPlanPrefs(e.target.value)}
                placeholder="Ex: Refeições práticas de preparar, café com ovos e almoço brasileiro tradicional"
                className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-4 py-2.5 text-sm text-[#0F2A2A] placeholder-[#7C9A98] focus:border-[#12BFA3] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={generatingPlan}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#12BFA3] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0EA88F] disabled:opacity-60 whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4" />
              {generatingPlan ? 'Gerando cardápio...' : 'Gerar cardápio do dia'}
            </button>
          </form>

          {planError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {planError}
            </div>
          )}

          {loggedFeedback && (
            <div className="flex items-center gap-2 rounded-xl border border-[#BCE6DC] bg-[#E3F7F2] p-3 text-sm font-medium text-[#0B7C6A]">
              <Check className="h-4 w-4" />
              <span>{loggedFeedback}</span>
            </div>
          )}

          {plans.length === 0 ? (
            <div className="rounded-3xl border border-[#E1EEE9] bg-white p-10 text-center text-sm text-[#5C7B79]">
              Nenhum cardápio gerado ainda. Clique em &ldquo;Gerar cardápio do dia&rdquo; para criar um plano alinhado às suas metas.
            </div>
          ) : (
            <div className="space-y-6">
              {plans.map((plan) => (
                <div key={plan.id} className="rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)]">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E1EEE9] pb-4">
                    <div>
                      <h3 className="font-display text-xl font-bold text-[#0F2A2A]">{plan.title}</h3>
                      <p className="mt-1 text-sm text-[#4B6B68]">{plan.notes}</p>
                    </div>
                    <div className="font-mono text-sm font-semibold text-[#0C947E] tabular-nums">
                      {plan.total_calories} kcal · P {plan.total_protein_g}g · C {plan.total_carbs_g}g · G {plan.total_fat_g}g
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {plan.meals.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col justify-between rounded-2xl border border-[#DCECE6] bg-[#F4FAF7] p-4"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs text-[#5C7B79]">
                            <span className="font-semibold text-[#0C947E]">
                              {MEAL_CATEGORY_LABELS[item.category] || item.category}
                            </span>
                            <span className="font-mono tabular-nums">{item.time}</span>
                          </div>
                          <h4 className="mt-1.5 font-display text-base font-bold text-[#0F2A2A]">
                            {item.title}
                          </h4>
                          <p className="mt-1 text-xs leading-relaxed text-[#4B6B68]">{item.description}</p>
                          <ul className="mt-3 space-y-1 text-xs text-[#2E4A48]">
                            {item.ingredients.map((ing, i) => (
                              <li key={i}>· {ing}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#DCECE6] pt-3">
                          <span className="font-mono text-[11px] text-[#4B6B68] tabular-nums">
                            {item.calories} kcal · C {item.carbs_g}g · P {item.protein_g}g · G {item.fat_g}g
                            {typeof item.fiber_g === 'number' ? ` · Fibra ${item.fiber_g}g` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleLogPlannedMeal(item)}
                            className="shrink-0 rounded-xl border border-[#BCE6DC] bg-white px-2.5 py-1 text-xs font-semibold text-[#0C947E] hover:bg-[#E3F7F2]"
                          >
                            Registrar hoje
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-[11px] text-[#5C7B79]">{TACO_TBCA_DISCLAIMER}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
