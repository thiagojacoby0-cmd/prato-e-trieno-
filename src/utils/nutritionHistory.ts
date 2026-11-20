import type {
  GoalType,
  MealCategory,
  MealEntry,
  MealFoodItem,
  MealPlan,
  NutritionBackupPayload,
  NutritionDayStatus,
  NutritionHistoryDay,
  NutritionHistoryResponse,
  NutritionHistorySummary,
  WaterLog,
  WeightLog,
} from '../types/index.ts';
import { getTodayISO } from './nutrition.ts';

const VALID_MEAL_CATEGORIES = new Set<MealCategory>(['cafe', 'almoco', 'lanche', 'jantar', 'ceia']);
const VALID_GOALS = new Set<GoalType>(['emagrecimento', 'hipertrofia', 'definicao', 'saude']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidISODate(dateStr: unknown): dateStr is string {
  if (typeof dateStr !== 'string' || !ISO_DATE_RE.test(dateStr.trim())) return false;
  const [y, m, d] = dateStr.trim().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function shiftDateISO(baseDateISO: string, deltaDays: number): string {
  const safeBase = isValidISODate(baseDateISO) ? baseDateISO.trim() : getTodayISO();
  const [y, m, d] = safeBase.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + Math.trunc(deltaDays)));
  return shifted.toISOString().slice(0, 10);
}

export function buildMealContentSignature(meal: {
  date: string;
  category: string;
  title: string;
  calories: number;
}): string {
  const date = meal.date.trim();
  const cat = meal.category.trim().toLowerCase();
  const title = meal.title.trim().toLowerCase().replace(/\s+/g, ' ');
  const cal = Math.round(Number(meal.calories) || 0);
  return `${date}|${cat}|${title}|${cal}`;
}

export function classifyDayCalorieStatus(calories: number, mealsCount: number, targetCalories: number): NutritionDayStatus {
  if (mealsCount <= 0) return 'empty';
  const safeTarget = Math.max(1, targetCalories || 2000);
  const lower = safeTarget * 0.9;
  const upper = safeTarget * 1.1;
  if (calories >= lower - 1e-6 && calories <= upper + 1e-6) return 'on_target';
  return calories > upper ? 'above' : 'below';
}

export function buildNutritionHistory(params: {
  meals: MealEntry[];
  waterLogs: WaterLog[];
  targetCalories: number;
  waterTargetMl?: number;
  days: number;
  endDate?: string;
}): NutritionHistoryResponse {
  const clampedDays = Math.min(730, Math.max(1, Math.round(Number(params.days) || 30)));
  const toDate = params.endDate && isValidISODate(params.endDate) ? params.endDate.trim() : getTodayISO();
  const fromDate = shiftDateISO(toDate, -(clampedDays - 1));
  const targetCalories = Math.max(500, Math.round(Number(params.targetCalories) || 2000));
  const waterTargetMl = Math.max(500, Math.round(Number(params.waterTargetMl) || 2000));

  const mealsByDate = new Map<string, MealEntry[]>();
  for (const meal of params.meals) {
    if (!isValidISODate(meal.date)) continue;
    if (meal.date < fromDate || meal.date > toDate) continue;
    const list = mealsByDate.get(meal.date);
    if (list) list.push(meal);
    else mealsByDate.set(meal.date, [meal]);
  }

  const waterByDate = new Map<string, number>();
  for (const w of params.waterLogs) {
    if (!isValidISODate(w.date)) continue;
    if (w.date < fromDate || w.date > toDate) continue;
    const prev = waterByDate.get(w.date) || 0;
    waterByDate.set(w.date, Math.max(prev, Math.max(0, Math.round(Number(w.amount_ml) || 0))));
  }

  const allDates = new Set<string>([...mealsByDate.keys(), ...waterByDate.keys()]);
  const sortedDatesDesc = Array.from(allDates).sort((a, b) => b.localeCompare(a));

  const days: NutritionHistoryDay[] = sortedDatesDesc.map((date) => {
    const dayMeals = [...(mealsByDate.get(date) || [])].sort((a, b) =>
      String(a.created_at || '').localeCompare(String(b.created_at || ''))
    );
    const calories = Math.round(dayMeals.reduce((acc, m) => acc + (Number(m.calories) || 0), 0));
    const protein_g = Number(dayMeals.reduce((acc, m) => acc + (Number(m.protein_g) || 0), 0).toFixed(1));
    const carbs_g = Number(dayMeals.reduce((acc, m) => acc + (Number(m.carbs_g) || 0), 0).toFixed(1));
    const fat_g = Number(dayMeals.reduce((acc, m) => acc + (Number(m.fat_g) || 0), 0).toFixed(1));
    const fiber_g = Number(dayMeals.reduce((acc, m) => acc + (Number(m.fiber_g) || 0), 0).toFixed(1));
    const water_ml = waterByDate.get(date) || 0;
    const status = classifyDayCalorieStatus(calories, dayMeals.length, targetCalories);

    return {
      date,
      meals: dayMeals,
      meals_count: dayMeals.length,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      fiber_g,
      water_ml,
      target_calories: targetCalories,
      status,
    };
  });

  const mealDays = days.filter((d) => d.meals_count > 0);
  const waterDays = days.filter((d) => d.water_ml > 0);
  const mealDayCount = mealDays.length;

  const summary: NutritionHistorySummary = {
    days_requested: clampedDays,
    from_date: fromDate,
    to_date: toDate,
    logged_days: mealDayCount,
    total_meals: mealDays.reduce((acc, d) => acc + d.meals_count, 0),
    days_on_target: mealDays.filter((d) => d.status === 'on_target').length,
    avg_calories: mealDayCount > 0 ? Math.round(mealDays.reduce((acc, d) => acc + d.calories, 0) / mealDayCount) : 0,
    avg_protein_g: mealDayCount > 0 ? Number((mealDays.reduce((acc, d) => acc + d.protein_g, 0) / mealDayCount).toFixed(1)) : 0,
    avg_carbs_g: mealDayCount > 0 ? Number((mealDays.reduce((acc, d) => acc + d.carbs_g, 0) / mealDayCount).toFixed(1)) : 0,
    avg_fat_g: mealDayCount > 0 ? Number((mealDays.reduce((acc, d) => acc + d.fat_g, 0) / mealDayCount).toFixed(1)) : 0,
    avg_water_ml: waterDays.length > 0 ? Math.round(waterDays.reduce((acc, d) => acc + d.water_ml, 0) / waterDays.length) : 0,
    target_calories: targetCalories,
  };

  return {
    summary,
    days,
    target_calories: targetCalories,
    water_target_ml: waterTargetMl,
  };
}

function clampNum(val: unknown, min: number, max: number, decimals = 1): number | null {
  const num = Number(val);
  if (!Number.isFinite(num)) return null;
  const clamped = Math.min(max, Math.max(min, num));
  if (decimals === 0) return Math.round(clamped);
  const factor = 10 ** decimals;
  return Math.round(clamped * factor) / factor;
}

function sanitizeStr(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function sanitizeFoodItems(rawItems: unknown): MealFoodItem[] {
  if (!Array.isArray(rawItems)) return [];
  const out: MealFoodItem[] = [];
  for (const item of rawItems.slice(0, 40)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const name = sanitizeStr(obj.name, 140);
    if (!name) continue;
    out.push({
      name,
      portion: sanitizeStr(obj.portion, 80) || '1 porção',
      reference_portion: sanitizeStr(obj.reference_portion, 80) || undefined,
      calories: clampNum(obj.calories, 0, 10000, 0) ?? 0,
      protein_g: clampNum(obj.protein_g, 0, 1000, 1) ?? 0,
      carbs_g: clampNum(obj.carbs_g, 0, 1000, 1) ?? 0,
      fat_g: clampNum(obj.fat_g, 0, 1000, 1) ?? 0,
      fiber_g: clampNum(obj.fiber_g, 0, 500, 1) ?? 0,
      data_available: obj.data_available === false ? false : true,
    });
  }
  return out;
}

export function sanitizeNutritionBackup(raw: unknown): NutritionBackupPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const hasAnySection =
    'meals' in obj || 'water_logs' in obj || 'meal_plans' in obj || 'weight_logs' in obj;
  if (!hasAnySection) {
    return null;
  }

  for (const key of ['meals', 'water_logs', 'meal_plans', 'weight_logs'] as const) {
    if (key in obj && obj[key] !== undefined && !Array.isArray(obj[key])) {
      return null;
    }
  }

  const rawMeals = Array.isArray(obj.meals) ? obj.meals : [];
  const rawWater = Array.isArray(obj.water_logs) ? obj.water_logs : [];
  const rawPlans = Array.isArray(obj.meal_plans) ? obj.meal_plans : [];
  const rawWeights = Array.isArray(obj.weight_logs) ? obj.weight_logs : [];
  const rawTotalCount = rawMeals.length + rawWater.length + rawPlans.length + rawWeights.length;

  const meals: MealEntry[] = [];
  for (const entry of rawMeals.slice(0, 15000)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const m = entry as Record<string, unknown>;
    const date = typeof m.date === 'string' ? m.date.trim() : '';
    const title = sanitizeStr(m.title, 200);
    const cal = clampNum(m.calories, 0, 20000, 0);
    if (!isValidISODate(date) || !title || cal === null) continue;

    const rawCat = typeof m.category === 'string' ? (m.category.trim().toLowerCase() as MealCategory) : 'almoco';
    const category: MealCategory = VALID_MEAL_CATEGORIES.has(rawCat) ? rawCat : 'almoco';
    const imageUrl = sanitizeStr(m.image_url, 500) || null;
    const createdAt =
      typeof m.created_at === 'string' && !Number.isNaN(Date.parse(m.created_at))
        ? m.created_at
        : `${date}T12:00:00.000Z`;

    meals.push({
      id: sanitizeStr(m.id, 80),
      user_id: sanitizeStr(m.user_id, 80),
      date,
      category,
      title,
      description: sanitizeStr(m.description, 1000),
      calories: cal,
      protein_g: clampNum(m.protein_g, 0, 2000, 1) ?? 0,
      carbs_g: clampNum(m.carbs_g, 0, 2000, 1) ?? 0,
      fat_g: clampNum(m.fat_g, 0, 2000, 1) ?? 0,
      fiber_g: clampNum(m.fiber_g, 0, 1000, 1) ?? 0,
      image_url: imageUrl,
      items: sanitizeFoodItems(m.items),
      ai_analyzed: Boolean(m.ai_analyzed),
      created_at: createdAt,
    });
  }

  const water_logs: WaterLog[] = [];
  for (const entry of rawWater.slice(0, 5000)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const w = entry as Record<string, unknown>;
    const date = typeof w.date === 'string' ? w.date.trim() : '';
    const amount = clampNum(w.amount_ml, 0, 25000, 0);
    if (!isValidISODate(date) || amount === null) continue;
    water_logs.push({
      id: sanitizeStr(w.id, 80),
      user_id: sanitizeStr(w.user_id, 80),
      date,
      amount_ml: amount,
      updated_at:
        typeof w.updated_at === 'string' && !Number.isNaN(Date.parse(w.updated_at))
          ? w.updated_at
          : new Date().toISOString(),
    });
  }

  const meal_plans: MealPlan[] = [];
  for (const entry of rawPlans.slice(0, 1000)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const p = entry as Record<string, unknown>;
    const title = sanitizeStr(p.title, 200);
    const totalCal = clampNum(p.total_calories, 100, 20000, 0);
    if (!title || totalCal === null || !Array.isArray(p.meals)) continue;

    const rawGoal = typeof p.goal === 'string' ? (p.goal.trim().toLowerCase() as GoalType) : 'saude';
    const goal: GoalType = VALID_GOALS.has(rawGoal) ? rawGoal : 'saude';

    const planMeals: MealPlan['meals'] = [];
    for (const pmRaw of p.meals.slice(0, 12)) {
      if (!pmRaw || typeof pmRaw !== 'object') continue;
      const pm = pmRaw as Record<string, unknown>;
      const pmTitle = sanitizeStr(pm.title, 180);
      if (!pmTitle) continue;
      const pmCat = typeof pm.category === 'string' ? (pm.category.trim().toLowerCase() as MealCategory) : 'almoco';
      planMeals.push({
        category: VALID_MEAL_CATEGORIES.has(pmCat) ? pmCat : 'almoco',
        time: sanitizeStr(pm.time, 20) || '12:00',
        title: pmTitle,
        description: sanitizeStr(pm.description, 500),
        ingredients: Array.isArray(pm.ingredients)
          ? pm.ingredients.slice(0, 25).map((i) => sanitizeStr(i, 120)).filter(Boolean)
          : [],
        calories: clampNum(pm.calories, 0, 10000, 0) ?? 0,
        protein_g: clampNum(pm.protein_g, 0, 1000, 1) ?? 0,
        carbs_g: clampNum(pm.carbs_g, 0, 1000, 1) ?? 0,
        fat_g: clampNum(pm.fat_g, 0, 1000, 1) ?? 0,
        fiber_g: clampNum(pm.fiber_g, 0, 500, 1) ?? 0,
      });
    }
    if (planMeals.length === 0) continue;

    meal_plans.push({
      id: sanitizeStr(p.id, 80),
      user_id: sanitizeStr(p.user_id, 80),
      title,
      goal,
      total_calories: totalCal,
      total_protein_g: clampNum(p.total_protein_g, 0, 2000, 0) ?? 0,
      total_carbs_g: clampNum(p.total_carbs_g, 0, 2000, 0) ?? 0,
      total_fat_g: clampNum(p.total_fat_g, 0, 2000, 0) ?? 0,
      total_fiber_g: clampNum(p.total_fiber_g, 0, 1000, 1) ?? undefined,
      meals: planMeals,
      notes: sanitizeStr(p.notes, 1000),
      created_at:
        typeof p.created_at === 'string' && !Number.isNaN(Date.parse(p.created_at))
          ? p.created_at
          : new Date().toISOString(),
    });
  }

  const weight_logs: WeightLog[] = [];
  for (const entry of rawWeights.slice(0, 5000)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const wl = entry as Record<string, unknown>;
    const date = typeof wl.date === 'string' ? wl.date.trim() : '';
    const weight = clampNum(wl.weight_kg, 20, 400, 2);
    if (!isValidISODate(date) || weight === null) continue;

    weight_logs.push({
      id: sanitizeStr(wl.id, 80),
      user_id: sanitizeStr(wl.user_id, 80),
      date,
      weight_kg: weight,
      waist_cm: clampNum(wl.waist_cm, 20, 300, 1),
      chest_cm: clampNum(wl.chest_cm, 20, 300, 1),
      hip_cm: clampNum(wl.hip_cm, 20, 300, 1),
      arm_cm: clampNum(wl.arm_cm, 10, 120, 1),
      notes: sanitizeStr(wl.notes, 500),
      created_at:
        typeof wl.created_at === 'string' && !Number.isNaN(Date.parse(wl.created_at))
          ? wl.created_at
          : `${date}T08:00:00.000Z`,
    });
  }

  const validTotalCount = meals.length + water_logs.length + meal_plans.length + weight_logs.length;
  if (rawTotalCount > 0 && validTotalCount === 0) {
    return null;
  }

  return {
    version: clampNum(obj.version, 1, 10, 0) ?? 1,
    exported_at:
      typeof obj.exported_at === 'string' && !Number.isNaN(Date.parse(obj.exported_at))
        ? obj.exported_at
        : new Date().toISOString(),
    app: 'PRATO & TREINO',
    meals,
    water_logs,
    meal_plans,
    weight_logs,
  };
}
