import { DEFAULT_WORKOUT_CATALOG } from '../database/seedWorkouts';
import { EXERCISE_LIBRARY, buildExercisesFromIds } from '../database/exerciseLibrary';
import type {
  AppConfigInfo,
  CoachMessage,
  DashboardSummary,
  MealCategory,
  MealEntry,
  MealFoodItem,
  MealPlan,
  NutritionBackupPayload,
  NutritionRestoreResult,
  ProgressPhoto,
  TrainingPlan,
  UserProfile,
  WaterLog,
  WeightLog,
  WorkoutLevel,
  WorkoutLog,
  WorkoutPreferences,
  WorkoutProgram,
} from '../types';
import { buildLocalTutorialSpec } from '../utils/exerciseTutorials';
import {
  calculateNutritionTargets,
  formatShortWeekday,
  getLastNDaysISO,
  getTodayISO,
} from '../utils/nutrition';
import {
  buildMealContentSignature,
  buildNutritionHistory,
  sanitizeNutritionBackup,
} from '../utils/nutritionHistory';
import { estimateMealLocally } from '../utils/mealNutritionParser';
import { buildDefaultTrainingPlan } from '../utils/trainingPlans';

const STORAGE_KEY = 'prato_treino_local_mobile_db_v1';
const LOCAL_USER_ID = 'local-owner-thiago';
const LOCAL_TOKEN = 'local-mobile-session';

interface LocalMobileStore {
  profile: UserProfile;
  credentials: Record<string, string>; // email -> password
  meals: MealEntry[];
  mealPlans: MealPlan[];
  customWorkouts: WorkoutProgram[];
  workoutLogs: WorkoutLog[];
  trainingPlans: TrainingPlan[];
  preferences: WorkoutPreferences;
  weightLogs: WeightLog[];
  waterLogs: Record<string, WaterLog>; // key: date
  progressPhotos: ProgressPhoto[];
  coachMessages: CoachMessage[];
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `loc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createInitialStore(): LocalMobileStore {
  const now = new Date().toISOString();
  const targets = calculateNutritionTargets({
    age: 28,
    sex: 'masculino',
    height_cm: 175,
    current_weight_kg: 78,
    activity_level: 'moderado',
    goal: 'emagrecimento',
  });

  const profile: UserProfile = {
    id: LOCAL_USER_ID,
    email: 'thiagojacoby0@gmail.com',
    full_name: '',
    age: 28,
    sex: 'masculino',
    height_cm: 175,
    current_weight_kg: 78,
    target_weight_kg: 72,
    activity_level: 'moderado',
    goal: 'emagrecimento',
    dietary_restrictions: [],
    workout_level: 'intermediario',
    home_equipment: ['Peso corporal'],
    daily_calorie_target: targets.daily_calorie_target,
    protein_target_g: targets.protein_target_g,
    carbs_target_g: targets.carbs_target_g,
    fat_target_g: targets.fat_target_g,
    water_target_ml: targets.water_target_ml,
    avatar_url: null,
    onboarding_completed: false,
    created_at: now,
    updated_at: now,
  };

  const initialPlanDraft = buildDefaultTrainingPlan({
    userId: LOCAL_USER_ID,
    durationDays: 30,
    level: profile.workout_level,
    goal: profile.goal,
  });

  const initialPlan: TrainingPlan = {
    id: makeId(),
    ...initialPlanDraft,
    started_at: now,
    updated_at: now,
  };

  const preferences: WorkoutPreferences = {
    user_id: LOCAL_USER_ID,
    favorite_exercise_ids: [],
    substituted_exercises: {},
    preferred_level: profile.workout_level,
    preferred_duration_min: 25,
    focus_muscles: ['Corpo inteiro'],
    voice_enabled: true,
    sound_enabled: true,
    countdown_seconds: 5,
    rest_seconds: 20,
    adaptive_multiplier: 1.0,
    reminder_enabled: false,
    reminder_time: '07:30',
    reminder_days: [1, 2, 3, 4, 5],
    reminder_frequency: 'dias_selecionados',
    rest_time_reminder: '22:00',
    updated_at: now,
  };

  const coachMessages: CoachMessage[] = [
    {
      id: makeId(),
      user_id: LOCAL_USER_ID,
      role: 'assistant',
      content:
        'Bem-vindo ao PRATO & TREINO! Seus treinos completos, guia passo a passo e controle diário já estão prontos para uso no celular.',
      created_at: now,
    },
  ];

  return {
    profile,
    credentials: {
      'thiagojacoby0@gmail.com': '123456',
    },
    meals: [],
    mealPlans: [],
    customWorkouts: [],
    workoutLogs: [],
    trainingPlans: [initialPlan],
    preferences,
    weightLogs: [
      {
        id: makeId(),
        user_id: LOCAL_USER_ID,
        date: getTodayISO(),
        weight_kg: profile.current_weight_kg,
        notes: 'Peso inicial',
        created_at: now,
      },
    ],
    waterLogs: {},
    progressPhotos: [],
    coachMessages,
  };
}

function loadStore(): LocalMobileStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalMobileStore>;
      const base = createInitialStore();
      return {
        ...base,
        ...parsed,
        profile: { ...base.profile, ...(parsed.profile || {}) },
        preferences: { ...base.preferences, ...(parsed.preferences || {}) },
        credentials: parsed.credentials || base.credentials,
        meals: Array.isArray(parsed.meals) ? parsed.meals : [],
        mealPlans: Array.isArray(parsed.mealPlans) ? parsed.mealPlans : [],
        customWorkouts: Array.isArray(parsed.customWorkouts) ? parsed.customWorkouts : [],
        workoutLogs: Array.isArray(parsed.workoutLogs) ? parsed.workoutLogs : [],
        trainingPlans:
          Array.isArray(parsed.trainingPlans) && parsed.trainingPlans.length > 0
            ? parsed.trainingPlans
            : base.trainingPlans,
        weightLogs: Array.isArray(parsed.weightLogs) ? parsed.weightLogs : base.weightLogs,
        waterLogs: parsed.waterLogs || {},
        progressPhotos: Array.isArray(parsed.progressPhotos) ? parsed.progressPhotos : [],
        coachMessages:
          Array.isArray(parsed.coachMessages) && parsed.coachMessages.length > 0
            ? parsed.coachMessages
            : base.coachMessages,
      };
    }
  } catch {
    // Corrupted localStorage fallback
  }
  const initial = createInitialStore();
  saveStore(initial);
  return initial;
}

function saveStore(store: LocalMobileStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota warnings gracefully
  }
}

function computeStats(logs: WorkoutLog[]) {
  const last7 = getLastNDaysISO(7);
  const last7Set = new Set(last7);
  const last30 = getLastNDaysISO(30);
  const activeDatesSet = new Set(logs.map((l) => l.date));

  let streakDays = 0;
  const recentDesc = [...last30].reverse();
  for (let i = 0; i < recentDesc.length; i++) {
    if (activeDatesSet.has(recentDesc[i])) {
      streakDays++;
    } else if (i > 0) {
      break;
    }
  }

  const weekly_series = last7.map((d) => {
    const dayLogs = logs.filter((l) => l.date === d);
    return {
      date: d,
      label: formatShortWeekday(d),
      minutes: dayLogs.reduce((acc, l) => acc + Number(l.duration_minutes || 0), 0),
      calories: dayLogs.reduce((acc, l) => acc + Number(l.calories_burned || 0), 0),
      sessions: dayLogs.length,
    };
  });

  const last28 = getLastNDaysISO(28);
  const monthly_series = [0, 1, 2, 3].map((weekIdx) => {
    const slice = new Set(last28.slice(weekIdx * 7, (weekIdx + 1) * 7));
    const weekLogs = logs.filter((l) => slice.has(l.date));
    return {
      label: `Sem ${weekIdx + 1}`,
      minutes: weekLogs.reduce((acc, l) => acc + Number(l.duration_minutes || 0), 0),
      calories: weekLogs.reduce((acc, l) => acc + Number(l.calories_burned || 0), 0),
      sessions: weekLogs.length,
    };
  });

  const weeklyActiveDays = new Set(logs.filter((l) => last7Set.has(l.date)).map((l) => l.date)).size;

  return {
    total_workouts: logs.length,
    total_minutes: logs.reduce((acc, l) => acc + Number(l.duration_minutes || 0), 0),
    total_calories: logs.reduce((acc, l) => acc + Number(l.calories_burned || 0), 0),
    total_exercises: logs.reduce((acc, l) => acc + Number(l.exercises_completed || 0), 0),
    weekly_frequency: weeklyActiveDays,
    streak_days: streakDays,
    active_dates: Array.from(activeDatesSet).sort(),
    weekly_series,
    monthly_series,
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
    reader.readAsDataURL(file);
  });
}

function parseBody(options: RequestInit): Record<string, unknown> {
  if (typeof options.body === 'string' && options.body.trim()) {
    try {
      return JSON.parse(options.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function buildLocalMealPlan(profile: UserProfile, preferences?: string): MealPlan {
  const cal = profile.daily_calorie_target || 1950;
  const p = profile.protein_target_g || 140;
  const c = profile.carbs_target_g || 190;
  const f = profile.fat_target_g || 55;
  const noteSuffix = preferences?.trim() ? ` Preferências consideradas: ${preferences.trim()}.` : '';

  return {
    id: makeId(),
    user_id: profile.id,
    title: `Cardápio Inteligente · ${cal} kcal`,
    goal: profile.goal,
    total_calories: cal,
    total_protein_g: p,
    total_carbs_g: c,
    total_fat_g: f,
    notes: `Plano diário calculado localmente no celular para sua meta calórica e de macronutrientes.${noteSuffix}`,
    created_at: new Date().toISOString(),
    meals: [
      {
        category: 'cafe',
        time: '07:30',
        title: 'Ovos Mexidos com Pão Integral e Fruta',
        description: 'Café equilibrado com proteína, carboidrato complexo e fibras.',
        ingredients: ['3 ovos inteiros', '2 fatias de pão integral', '1 banana média', 'Café preto sem açúcar'],
        calories: Math.round(cal * 0.24),
        protein_g: Math.round(p * 0.23),
        carbs_g: Math.round(c * 0.28),
        fat_g: Math.round(f * 0.28),
      },
      {
        category: 'almoco',
        time: '12:30',
        title: 'Frango Grelhado com Arroz, Feijão e Salada',
        description: 'Prato brasileiro clássico ajustado para saciedade e performance.',
        ingredients: ['160g peito de frango grelhado', '120g arroz cozido', '90g feijão carioca', 'Salada verde + 1 col. chá azeite'],
        calories: Math.round(cal * 0.35),
        protein_g: Math.round(p * 0.38),
        carbs_g: Math.round(c * 0.36),
        fat_g: Math.round(f * 0.3),
      },
      {
        category: 'lanche',
        time: '16:30',
        title: 'Iogurte Natural com Aveia e Pasta de Amendoim',
        description: 'Lanche prático pré ou pós-treino.',
        ingredients: ['170g iogurte natural desnatado', '25g aveia em flocos', '10g pasta de amendoim integral'],
        calories: Math.round(cal * 0.16),
        protein_g: Math.round(p * 0.14),
        carbs_g: Math.round(c * 0.17),
        fat_g: Math.round(f * 0.18),
      },
      {
        category: 'jantar',
        time: '20:00',
        title: 'Patinho Moído com Purê de Batata e Legumes',
        description: 'Jantar leve rico em proteína magra para recuperação noturna.',
        ingredients: ['150g patinho moído refogado', '150g batata cozida', 'Brócolis e cenoura no vapor'],
        calories: Math.round(cal * 0.25),
        protein_g: Math.round(p * 0.25),
        carbs_g: Math.round(c * 0.19),
        fat_g: Math.round(f * 0.24),
      },
    ],
  };
}

function estimateLocalMealAnalysis(description: string): {
  title: string;
  description: string;
  data_available: boolean;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  items: MealFoodItem[];
} {
  const est = estimateMealLocally(description);
  return {
    title: est.title,
    description: est.description,
    data_available: est.dataAvailable,
    calories: est.calories,
    protein_g: est.protein_g,
    carbs_g: est.carbs_g,
    fat_g: est.fat_g,
    fiber_g: est.fiber_g,
    items: est.items,
  };
}

export async function handleLocalMobileRequest<T>(
  rawPath: string,
  options: RequestInit = {}
): Promise<T> {
  const [pathname, queryString = ''] = rawPath.split('?');
  const params = new URLSearchParams(queryString);
  const method = (options.method || 'GET').toUpperCase();
  const body = parseBody(options);
  const store = loadStore();

  // --- HEALTH ---
  if (pathname === '/api/health') {
    const info: AppConfigInfo & { ok: boolean } = {
      ok: true,
      storageBackend: 'sqlite',
      supabaseConfigured: false,
      supabaseServiceRole: false,
      geminiConfigured: false,
      trainingMigrationPending: false,
    };
    return info as unknown as T;
  }

  // --- AUTH ---
  if (
    pathname === '/api/auth/personal' ||
    pathname === '/api/auth/demo' ||
    pathname === '/api/auth/refresh'
  ) {
    return {
      token: LOCAL_TOKEN,
      refreshToken: null,
      persistentToken: LOCAL_TOKEN,
      profile: store.profile,
    } as unknown as T;
  }

  if (pathname === '/api/auth/login') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) {
      throw new Error('Informe e-mail e senha.');
    }
    const existingPass = store.credentials[email];
    if (existingPass && existingPass !== password) {
      throw new Error('Senha incorreta para este e-mail.');
    }
    if (!existingPass) {
      store.credentials[email] = password;
    }
    store.profile = {
      ...store.profile,
      email,
      full_name: store.profile.full_name || email.split('@')[0],
      onboarding_completed: store.profile.onboarding_completed || Boolean(store.profile.full_name.trim()),
      updated_at: new Date().toISOString(),
    };
    saveStore(store);
    return {
      token: LOCAL_TOKEN,
      refreshToken: null,
      persistentToken: LOCAL_TOKEN,
      profile: store.profile,
    } as unknown as T;
  }

  if (pathname === '/api/auth/register') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fullName = String(body.full_name || '').trim();
    if (!fullName || !email || password.length < 6) {
      throw new Error('Preencha nome completo, e-mail válido e senha com pelo menos 6 caracteres.');
    }
    store.credentials[email] = password;
    store.profile = {
      ...store.profile,
      email,
      full_name: fullName,
      onboarding_completed: false,
      updated_at: new Date().toISOString(),
    };
    saveStore(store);
    return {
      token: LOCAL_TOKEN,
      refreshToken: null,
      persistentToken: LOCAL_TOKEN,
      profile: store.profile,
    } as unknown as T;
  }

  if (pathname === '/api/auth/otp-send' || pathname === '/api/auth/otp-verify') {
    throw new Error(
      'O código por e-mail requer conexão com o servidor online. Toque em "Entrar no meu app agora (sem senha)" para acessar no celular.'
    );
  }

  if (pathname === '/api/auth/me') {
    return { profile: store.profile } as unknown as T;
  }

  // --- PROFILE ---
  if (pathname === '/api/profile' && method === 'PUT') {
    const nextEmail =
      typeof body.email === 'string' && body.email.trim().includes('@')
        ? body.email.trim().toLowerCase()
        : store.profile.email;
    const merged: UserProfile = {
      ...store.profile,
      ...(body as Partial<UserProfile>),
      id: store.profile.id,
      email: nextEmail,
      updated_at: new Date().toISOString(),
    };
    const targets = calculateNutritionTargets({
      age: Number(merged.age || 28),
      sex: merged.sex || 'masculino',
      height_cm: Number(merged.height_cm || 175),
      current_weight_kg: Number(merged.current_weight_kg || 78),
      activity_level: merged.activity_level || 'moderado',
      goal: merged.goal || 'emagrecimento',
    });
    const clampTarget = (val: unknown, fallback: number, min: number, max: number): number => {
      const n = Number(val);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, Math.round(n)));
    };
    const prev = store.profile;
    const bioChanged =
      (body.age !== undefined && Number(body.age) !== Number(prev.age)) ||
      (body.sex !== undefined && body.sex !== prev.sex) ||
      (body.height_cm !== undefined && Number(body.height_cm) !== Number(prev.height_cm)) ||
      (body.current_weight_kg !== undefined && Number(body.current_weight_kg) !== Number(prev.current_weight_kg)) ||
      (body.activity_level !== undefined && body.activity_level !== prev.activity_level) ||
      (body.goal !== undefined && body.goal !== prev.goal);

    const fallbackCal = bioChanged ? targets.daily_calorie_target : prev.daily_calorie_target;
    const fallbackProt = bioChanged ? targets.protein_target_g : prev.protein_target_g;
    const fallbackCarbs = bioChanged ? targets.carbs_target_g : prev.carbs_target_g;
    const fallbackFat = bioChanged ? targets.fat_target_g : prev.fat_target_g;
    const fallbackWater = prev.water_target_ml || targets.water_target_ml;

    merged.daily_calorie_target =
      body.daily_calorie_target !== undefined
        ? clampTarget(body.daily_calorie_target, fallbackCal, 800, 8000)
        : fallbackCal;
    merged.protein_target_g =
      body.protein_target_g !== undefined
        ? clampTarget(body.protein_target_g, fallbackProt, 20, 500)
        : fallbackProt;
    merged.carbs_target_g =
      body.carbs_target_g !== undefined
        ? clampTarget(body.carbs_target_g, fallbackCarbs, 0, 1000)
        : fallbackCarbs;
    merged.fat_target_g =
      body.fat_target_g !== undefined
        ? clampTarget(body.fat_target_g, fallbackFat, 15, 350)
        : fallbackFat;
    merged.water_target_ml =
      body.water_target_ml !== undefined
        ? clampTarget(body.water_target_ml, fallbackWater, 500, 10000)
        : fallbackWater;
    store.profile = merged;
    saveStore(store);
    return { profile: merged } as unknown as T;
  }

  // --- DASHBOARD ---
  if (pathname === '/api/dashboard') {
    const date = params.get('date') || getTodayISO();
    const targetCalories = store.profile.daily_calorie_target || 2000;
    const todayMeals = store.meals.filter((m) => m.date === date);
    const todayWorkouts = store.workoutLogs.filter((w) => w.date === date);
    const water = store.waterLogs[date] || {
      id: makeId(),
      user_id: store.profile.id,
      date,
      amount_ml: 0,
      updated_at: new Date().toISOString(),
    };

    const last7 = getLastNDaysISO(7);
    const weekly_calories = last7.map((d) => {
      const dayMeals = store.meals.filter((m) => m.date === d);
      const dayWorkouts = store.workoutLogs.filter((w) => w.date === d);
      return {
        date: d,
        label: formatShortWeekday(d),
        consumed: dayMeals.reduce((acc, m) => acc + Number(m.calories), 0),
        burned: dayWorkouts.reduce((acc, w) => acc + Number(w.calories_burned), 0),
        target: targetCalories,
      };
    });

    const activeDates = new Set<string>([
      ...store.meals.map((m) => m.date),
      ...store.workoutLogs.map((w) => w.date),
    ]);
    let streak_days = 0;
    const recent14 = getLastNDaysISO(14).reverse();
    for (let i = 0; i < recent14.length; i++) {
      if (activeDates.has(recent14[i])) {
        streak_days++;
      } else if (i > 0) {
        break;
      }
    }

    const summary: DashboardSummary = {
      date,
      calories_consumed: todayMeals.reduce((acc, m) => acc + Number(m.calories), 0),
      calories_burned: todayWorkouts.reduce((acc, w) => acc + Number(w.calories_burned), 0),
      protein_g: Math.round(todayMeals.reduce((acc, m) => acc + Number(m.protein_g), 0)),
      carbs_g: Math.round(todayMeals.reduce((acc, m) => acc + Number(m.carbs_g), 0)),
      fat_g: Math.round(todayMeals.reduce((acc, m) => acc + Number(m.fat_g), 0)),
      water_ml: water.amount_ml,
      workouts_today: todayWorkouts.length,
      weekly_calories,
      weight_history: store.weightLogs,
      streak_days,
    };
    return summary as unknown as T;
  }

  // --- MEALS & MEAL PLANS ---
  if (pathname === '/api/meals' && method === 'GET') {
    const date = params.get('date');
    const meals = date ? store.meals.filter((m) => m.date === date) : store.meals;
    return { meals } as unknown as T;
  }

  if (pathname === '/api/meals' && method === 'POST') {
    const meal: MealEntry = {
      id: makeId(),
      user_id: store.profile.id,
      date: String(body.date || getTodayISO()),
      category: (body.category as MealCategory) || 'almoco',
      title: String(body.title || 'Refeição'),
      description: body.description ? String(body.description) : undefined,
      calories: Number(body.calories || 0),
      protein_g: Number(body.protein_g || 0),
      carbs_g: Number(body.carbs_g || 0),
      fat_g: Number(body.fat_g || 0),
      fiber_g: Number(body.fiber_g || 0),
      image_url: (body.image_url as string | null) ?? null,
      items: Array.isArray(body.items) ? (body.items as MealFoodItem[]) : undefined,
      ai_analyzed: Boolean(body.ai_analyzed),
      created_at: new Date().toISOString(),
    };
    store.meals = [meal, ...store.meals];
    saveStore(store);
    return { meal } as unknown as T;
  }

  if (pathname.startsWith('/api/meals/') && method === 'DELETE') {
    const id = pathname.slice('/api/meals/'.length);
    store.meals = store.meals.filter((m) => m.id !== id);
    saveStore(store);
    return { ok: true } as unknown as T;
  }

  if (pathname === '/api/meal-plans' && method === 'GET') {
    return { plans: store.mealPlans } as unknown as T;
  }

  // --- NUTRITION HISTORY & BACKUP ---
  if (pathname === '/api/nutrition/history' && method === 'GET') {
    const rawDays = Number(params.get('days') ?? 30);
    const days = Number.isFinite(rawDays) ? Math.min(730, Math.max(1, Math.round(rawDays))) : 30;
    const history = buildNutritionHistory({
      meals: store.meals,
      waterLogs: Object.values(store.waterLogs),
      targetCalories: store.profile.daily_calorie_target || 2000,
      waterTargetMl: store.profile.water_target_ml || 2000,
      days,
      endDate: getTodayISO(),
    });
    return history as unknown as T;
  }

  if (pathname === '/api/nutrition/backup' && method === 'GET') {
    const backup: NutritionBackupPayload = {
      version: 1,
      exported_at: new Date().toISOString(),
      app: 'PRATO & TREINO',
      meals: store.meals,
      water_logs: Object.values(store.waterLogs),
      meal_plans: store.mealPlans,
      weight_logs: store.weightLogs,
    };
    return backup as unknown as T;
  }

  if (pathname === '/api/nutrition/restore' && method === 'POST') {
    const sanitized = sanitizeNutritionBackup(body);
    if (!sanitized) {
      throw new Error('Arquivo de backup nutricional inválido ou sem registros válidos.');
    }
    const existingMealIds = new Set(store.meals.map((m) => m.id));
    const existingMealSigs = new Set(store.meals.map((m) => buildMealContentSignature(m)));
    const seenIds = new Set<string>();
    let mealsAdded = 0;
    let mealsSkipped = 0;
    const insertedMeals: MealEntry[] = [];

    for (const m of sanitized.meals) {
      const id = m.id?.trim() || '';
      const sig = buildMealContentSignature(m);
      if ((id && (existingMealIds.has(id) || seenIds.has(id))) || existingMealSigs.has(sig)) {
        mealsSkipped += 1;
        continue;
      }
      if (id) seenIds.add(id);
      insertedMeals.push({ ...m, id: id || makeId(), user_id: store.profile.id });
      mealsAdded += 1;
    }
    store.meals = [...insertedMeals, ...store.meals];

    let waterDaysMerged = 0;
    const waterMaxByDate = new Map<string, number>();
    for (const wl of sanitized.water_logs) {
      waterMaxByDate.set(wl.date, Math.max(waterMaxByDate.get(wl.date) || 0, wl.amount_ml));
    }
    for (const [date, amt] of waterMaxByDate.entries()) {
      const current = store.waterLogs[date]?.amount_ml || 0;
      if (amt > current) {
        store.waterLogs[date] = {
          id: store.waterLogs[date]?.id || makeId(),
          user_id: store.profile.id,
          date,
          amount_ml: amt,
          updated_at: new Date().toISOString(),
        };
        waterDaysMerged += 1;
      }
    }

    const existingPlanIds = new Set(store.mealPlans.map((p) => p.id));
    const existingPlanSigs = new Set(
      store.mealPlans.map((p) => `${p.title.trim().toLowerCase()}|${p.total_calories}|${p.goal}|${p.meals.length}`)
    );
    let plansAdded = 0;
    for (const p of sanitized.meal_plans) {
      const sig = `${p.title.trim().toLowerCase()}|${p.total_calories}|${p.goal}|${p.meals.length}`;
      if ((p.id && existingPlanIds.has(p.id)) || existingPlanSigs.has(sig)) continue;
      existingPlanSigs.add(sig);
      if (p.id) existingPlanIds.add(p.id);
      store.mealPlans = [{ ...p, id: p.id || makeId(), user_id: store.profile.id }, ...store.mealPlans];
      plansAdded += 1;
    }

    const existingWeightIds = new Set(store.weightLogs.map((w) => w.id));
    const existingWeightSigs = new Set(
      store.weightLogs.map((w) => `${w.date}|${Number(w.weight_kg).toFixed(2)}`)
    );
    let weightsAdded = 0;
    for (const wl of sanitized.weight_logs) {
      const sig = `${wl.date}|${Number(wl.weight_kg).toFixed(2)}`;
      if ((wl.id && existingWeightIds.has(wl.id)) || existingWeightSigs.has(sig)) continue;
      existingWeightSigs.add(sig);
      if (wl.id) existingWeightIds.add(wl.id);
      store.weightLogs = [...store.weightLogs, { ...wl, id: wl.id || makeId(), user_id: store.profile.id }];
      weightsAdded += 1;
    }

    saveStore(store);
    const result: NutritionRestoreResult = {
      meals_added: mealsAdded,
      meals_skipped: mealsSkipped,
      plans_added: plansAdded,
      water_days_merged: waterDaysMerged,
      weights_added: weightsAdded,
    };
    return { ok: true, ...result } as unknown as T;
  }

  // --- WORKOUTS & TRAINING HUB ---
  if (pathname === '/api/workouts' && method === 'GET') {
    return {
      workouts: [...store.customWorkouts, ...DEFAULT_WORKOUT_CATALOG],
      logs: store.workoutLogs,
    } as unknown as T;
  }

  if (pathname === '/api/training/hub' && method === 'GET') {
    const activePlan =
      store.trainingPlans.find((p) => p.active) || store.trainingPlans[0] || null;
    return {
      workouts: [...store.customWorkouts, ...DEFAULT_WORKOUT_CATALOG],
      logs: store.workoutLogs,
      preferences: store.preferences,
      trainingPlan: activePlan,
      stats: computeStats(store.workoutLogs),
      trainingMigrationPending: false,
    } as unknown as T;
  }

  if (pathname === '/api/training/plans' && method === 'POST') {
    const duration = ([7, 14, 30, 60].includes(Number(body.duration_days))
      ? Number(body.duration_days)
      : 30) as 7 | 14 | 30 | 60;
    const level = (body.level as WorkoutLevel) || store.profile.workout_level || 'intermediario';
    const goal = String(body.goal || store.profile.goal || 'emagrecimento');
    const draft = buildDefaultTrainingPlan({
      userId: store.profile.id,
      durationDays: duration,
      level,
      goal,
    });
    const now = new Date().toISOString();
    const newPlan: TrainingPlan = {
      id: makeId(),
      ...draft,
      started_at: now,
      updated_at: now,
    };
    store.trainingPlans = [
      newPlan,
      ...store.trainingPlans.map((p) => ({ ...p, active: false })),
    ];
    saveStore(store);
    return { trainingPlan: newPlan } as unknown as T;
  }

  if (pathname.startsWith('/api/training/plans/') && pathname.endsWith('/complete-day') && method === 'POST') {
    const planId = pathname.slice('/api/training/plans/'.length, -'/complete-day'.length);
    const dayNumber = Number(body.day_number || 1);
    let updatedPlan: TrainingPlan | null = null;
    store.trainingPlans = store.trainingPlans.map((p) => {
      if (p.id !== planId) return p;
      const completed = Array.from(new Set([...p.completed_days, dayNumber])).sort((a, b) => a - b);
      const nextDay = Math.min(p.duration_days, Math.max(p.current_day, dayNumber + 1));
      updatedPlan = {
        ...p,
        completed_days: completed,
        current_day: nextDay,
        updated_at: new Date().toISOString(),
      };
      return updatedPlan;
    });
    saveStore(store);
    return { trainingPlan: updatedPlan } as unknown as T;
  }

  if (pathname === '/api/training/preferences' && method === 'GET') {
    return { preferences: store.preferences } as unknown as T;
  }

  if (pathname === '/api/training/preferences' && method === 'PUT') {
    store.preferences = {
      ...store.preferences,
      ...(body as Partial<WorkoutPreferences>),
      user_id: store.profile.id,
      updated_at: new Date().toISOString(),
    };
    saveStore(store);
    return { preferences: store.preferences } as unknown as T;
  }

  if (pathname === '/api/workouts/custom' && method === 'POST') {
    const now = new Date().toISOString();
    const workout: WorkoutProgram = {
      id: makeId(),
      user_id: store.profile.id,
      title: String(body.title || 'Treino Personalizado').trim(),
      category: String(body.category || 'Corpo inteiro'),
      level: (body.level as WorkoutLevel) || 'intermediario',
      duration_minutes: Number(body.duration_minutes || 20),
      estimated_calories: Number(body.estimated_calories || 180),
      equipment: Array.isArray(body.equipment) ? (body.equipment as string[]) : ['Peso corporal'],
      description: String(body.description || 'Treino personalizado criado no PRATO & TREINO.'),
      warmup: Array.isArray(body.warmup)
        ? (body.warmup as WorkoutProgram['warmup'])
        : buildExercisesFromIds(['warm-arm-circles', 'warm-torso-twist'], 'warmup'),
      exercises: (body.exercises as WorkoutProgram['exercises']) || [],
      cooldown: Array.isArray(body.cooldown)
        ? (body.cooldown as WorkoutProgram['cooldown'])
        : buildExercisesFromIds(['cool-child-pose', 'cool-cobra'], 'cooldown'),
      muscle_focus: Array.isArray(body.muscle_focus)
        ? (body.muscle_focus as string[])
        : [String(body.category || 'Corpo inteiro')],
      is_ai_generated: false,
      is_custom: true,
      video_url: null,
      created_at: now,
    };
    store.customWorkouts = [workout, ...store.customWorkouts];
    saveStore(store);
    return { workout } as unknown as T;
  }

  if (pathname.startsWith('/api/workouts/') && method === 'DELETE') {
    const id = pathname.slice('/api/workouts/'.length);
    store.customWorkouts = store.customWorkouts.filter((w) => w.id !== id);
    saveStore(store);
    return { ok: true } as unknown as T;
  }

  if (pathname === '/api/workout-logs' && method === 'POST') {
    const now = new Date().toISOString();
    const log: WorkoutLog = {
      id: makeId(),
      user_id: store.profile.id,
      workout_id: String(body.workout_id || ''),
      workout_title: String(body.workout_title || 'Treino'),
      date: String(body.date || getTodayISO()),
      duration_minutes: Number(body.duration_minutes || 20),
      calories_burned: Number(body.calories_burned || 150),
      exercises_completed: Number(body.exercises_completed || 1),
      skipped_exercises: Number(body.skipped_exercises || 0),
      plan_id: (body.plan_id as string | null) ?? null,
      plan_day_number: body.plan_day_number ? Number(body.plan_day_number) : null,
      perceived_difficulty:
        (body.perceived_difficulty as WorkoutLog['perceived_difficulty']) ?? null,
      warmup_done: body.warmup_done !== false,
      cooldown_done: body.cooldown_done !== false,
      notes: String(body.notes || ''),
      created_at: now,
    };
    store.workoutLogs = [log, ...store.workoutLogs];

    let trainingPlan: TrainingPlan | null = null;
    if (log.plan_id && log.plan_day_number) {
      store.trainingPlans = store.trainingPlans.map((p) => {
        if (p.id !== log.plan_id) return p;
        const completed = Array.from(
          new Set([...p.completed_days, log.plan_day_number!])
        ).sort((a, b) => a - b);
        const nextDay = Math.min(
          p.duration_days,
          Math.max(p.current_day, log.plan_day_number! + 1)
        );
        trainingPlan = { ...p, completed_days: completed, current_day: nextDay, updated_at: now };
        return trainingPlan;
      });
    }

    if (log.perceived_difficulty === 'facil') {
      store.preferences.adaptive_multiplier = Math.min(
        1.45,
        Number((store.preferences.adaptive_multiplier + 0.08).toFixed(2))
      );
    } else if (log.perceived_difficulty === 'intenso') {
      store.preferences.adaptive_multiplier = Math.max(
        0.75,
        Number((store.preferences.adaptive_multiplier - 0.08).toFixed(2))
      );
    }

    saveStore(store);
    return {
      log,
      trainingPlan,
      preferences: store.preferences,
    } as unknown as T;
  }

  // --- WEIGHT ---
  if (pathname === '/api/weight' && method === 'GET') {
    const sorted = [...store.weightLogs].sort((a, b) => a.date.localeCompare(b.date));
    return { logs: sorted } as unknown as T;
  }

  if (pathname === '/api/weight' && method === 'POST') {
    const now = new Date().toISOString();
    const rawWeight = body.weight_kg !== undefined && body.weight_kg !== null
      ? Number(String(body.weight_kg).replace(',', '.'))
      : store.profile.current_weight_kg;
    if (!Number.isFinite(rawWeight) || rawWeight <= 0) {
      throw new Error('Peso inválido. Informe um número positivo em kg.');
    }
    const toOptNum = (v: unknown) => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number(String(v).replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const weightKg = rawWeight;
    const log: WeightLog = {
      id: makeId(),
      user_id: store.profile.id,
      date: String(body.date || getTodayISO()),
      weight_kg: weightKg,
      waist_cm: toOptNum(body.waist_cm),
      chest_cm: toOptNum(body.chest_cm),
      hip_cm: toOptNum(body.hip_cm),
      arm_cm: toOptNum(body.arm_cm),
      notes: String(body.notes || ''),
      created_at: now,
    };
    store.weightLogs = [...store.weightLogs, log];
    store.profile = {
      ...store.profile,
      current_weight_kg: weightKg,
      updated_at: now,
    };
    saveStore(store);
    return { log, profile: store.profile } as unknown as T;
  }

  if (pathname.startsWith('/api/weight/') && method === 'DELETE') {
    const id = pathname.slice('/api/weight/'.length);
    store.weightLogs = store.weightLogs.filter((l) => l.id !== id);
    saveStore(store);
    return { ok: true } as unknown as T;
  }

  // --- WATER ---
  if (pathname === '/api/water' && method === 'GET') {
    const date = params.get('date') || getTodayISO();
    const water = store.waterLogs[date] || {
      id: makeId(),
      user_id: store.profile.id,
      date,
      amount_ml: 0,
      updated_at: new Date().toISOString(),
    };
    return { water } as unknown as T;
  }

  if (pathname === '/api/water' && method === 'POST') {
    const date = String(body.date || getTodayISO());
    const delta = Number(body.delta_ml || 0);
    const current = store.waterLogs[date] || {
      id: makeId(),
      user_id: store.profile.id,
      date,
      amount_ml: 0,
      updated_at: new Date().toISOString(),
    };
    const updated: WaterLog = {
      ...current,
      amount_ml: Math.max(0, current.amount_ml + delta),
      updated_at: new Date().toISOString(),
    };
    store.waterLogs[date] = updated;
    saveStore(store);
    return { water: updated } as unknown as T;
  }

  // --- STORAGE & PROGRESS PHOTOS ---
  if (pathname === '/api/storage/upload' && method === 'POST') {
    if (options.body instanceof FormData) {
      const file = options.body.get('file');
      if (file instanceof File) {
        const url = await fileToDataUrl(file);
        return { url } as unknown as T;
      }
    }
    return { url: '' } as unknown as T;
  }

  if (pathname === '/api/progress-photos' && method === 'GET') {
    return { photos: store.progressPhotos } as unknown as T;
  }

  if (pathname === '/api/progress-photos' && method === 'POST') {
    const photo: ProgressPhoto = {
      id: makeId(),
      user_id: store.profile.id,
      date: String(body.date || getTodayISO()),
      weight_kg: body.weight_kg ? Number(body.weight_kg) : null,
      caption: String(body.caption || ''),
      image_url: String(body.image_url || ''),
      created_at: new Date().toISOString(),
    };
    store.progressPhotos = [photo, ...store.progressPhotos];
    saveStore(store);
    return { photo } as unknown as T;
  }

  if (pathname.startsWith('/api/progress-photos/') && method === 'DELETE') {
    const id = pathname.slice('/api/progress-photos/'.length);
    store.progressPhotos = store.progressPhotos.filter((p) => p.id !== id);
    saveStore(store);
    return { ok: true } as unknown as T;
  }

  // --- AI & TUTORIAL FALLBACKS ---
  if (pathname === '/api/ai/exercise-tutorial' && method === 'POST') {
    const spec = buildLocalTutorialSpec(
      String(body.exercise_name || 'Exercício'),
      String(body.muscle_group || 'Corpo inteiro'),
      String(body.instructions || '')
    );
    return { spec, source: 'local' } as unknown as T;
  }

  if (pathname === '/api/ai/meal-plan' && method === 'POST') {
    const plan = buildLocalMealPlan(store.profile, String(body.preferences || ''));
    store.mealPlans = [plan, ...store.mealPlans];
    saveStore(store);
    return { plan } as unknown as T;
  }

  if (pathname === '/api/ai/workout' && method === 'POST') {
    const focus = String(body.focus || 'Corpo inteiro').trim();
    const durationMin = Number(body.duration_minutes || 25);
    const allLib = Object.values(EXERCISE_LIBRARY).filter((ex) => ex.stage === 'main');
    const matched = allLib.filter(
      (ex) =>
        ex.muscle_group.toLowerCase().includes(focus.toLowerCase()) ||
        ex.name.toLowerCase().includes(focus.toLowerCase())
    );
    const chosen = (matched.length >= 4 ? matched : allLib).slice(0, 5);
    const now = new Date().toISOString();
    const workout: WorkoutProgram = {
      id: makeId(),
      user_id: store.profile.id,
      title: `Treino Personalizado · ${focus}`,
      category: 'Corpo inteiro',
      level: store.profile.workout_level || 'intermediario',
      duration_minutes: durationMin,
      estimated_calories: Math.round(durationMin * 9),
      equipment: Array.isArray(body.equipment) ? (body.equipment as string[]) : ['Peso corporal'],
      description: `Treino montado localmente no aparelho com foco em ${focus}.`,
      warmup: buildExercisesFromIds(['warm-arm-circles', 'warm-torso-twist'], 'warmup'),
      exercises: chosen,
      cooldown: buildExercisesFromIds(['cool-child-pose', 'cool-cobra'], 'cooldown'),
      muscle_focus: [focus],
      is_ai_generated: true,
      is_custom: true,
      video_url: null,
      created_at: now,
    };
    store.customWorkouts = [workout, ...store.customWorkouts];
    saveStore(store);
    return { workout } as unknown as T;
  }

  if (pathname === '/api/ai/analyze-meal' && method === 'POST') {
    let description = '';
    let imageUrl: string | null = null;
    if (options.body instanceof FormData) {
      description = String(options.body.get('description') || '');
      const img = options.body.get('image');
      if (img instanceof File) {
        imageUrl = await fileToDataUrl(img);
      }
    } else {
      description = String(body.description || '');
    }
    if (!description.trim() && imageUrl) {
      const analysis = {
        title: 'Refeição fotografada (descreva os alimentos)',
        description:
          'Foto salva. No modo offline, escreva os alimentos da foto para calcular os valores nutricionais (TACO/TBCA e cálculo por ingredientes).',
        data_available: false,
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        items: [
          {
            name: 'Alimento não identificado pela foto sem descrição',
            portion: 'Dados não disponíveis',
            calories: 0,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
            fiber_g: 0,
            data_available: false,
          },
        ],
      };
      return { analysis, image_url: imageUrl } as unknown as T;
    }
    const analysis = estimateLocalMealAnalysis(description);
    return { analysis, image_url: imageUrl } as unknown as T;
  }

  if (pathname === '/api/ai/coach' && method === 'GET') {
    return { messages: store.coachMessages } as unknown as T;
  }

  if (pathname === '/api/ai/coach' && method === 'POST') {
    const text = String(body.message || '').trim();
    const now = new Date().toISOString();
    const userMessage: CoachMessage = {
      id: makeId(),
      user_id: store.profile.id,
      role: 'user',
      content: text,
      created_at: now,
    };
    const today = getTodayISO();
    const todayMeals = store.meals.filter((m) => m.date === today);
    const consumed = todayMeals.reduce((acc, m) => acc + Number(m.calories), 0);
    const prot = Math.round(todayMeals.reduce((acc, m) => acc + Number(m.protein_g), 0));
    const water = store.waterLogs[today]?.amount_ml || 0;
    const reply =
      `Modo local ativo no celular: hoje você registrou ${consumed}/${store.profile.daily_calorie_target} kcal, ` +
      `${prot}g/${store.profile.protein_target_g}g de proteína e ${water} ml/${store.profile.water_target_ml} ml de água. ` +
      `Para sua pergunta "${text}", priorize proteínas magras (frango, ovos, iogurte), mantenha constância no plano de treino e hidrate-se ao longo do dia.`;
    const assistantMessage: CoachMessage = {
      id: makeId(),
      user_id: store.profile.id,
      role: 'assistant',
      content: reply,
      created_at: new Date().toISOString(),
    };
    store.coachMessages = [...store.coachMessages, userMessage, assistantMessage];
    saveStore(store);
    return { userMessage, assistantMessage } as unknown as T;
  }

  if (pathname === '/api/ai/coach' && method === 'DELETE') {
    store.coachMessages = [];
    saveStore(store);
    return { ok: true } as unknown as T;
  }

  throw new Error('Funcionalidade indisponível no modo offline do aplicativo.');
}
