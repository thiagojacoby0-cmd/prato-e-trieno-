import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import db from './sqlite';
import { getSupabaseClientForToken } from './supabaseClient';
import { v4Fallback } from './uuidHelper';
import {
  CoachMessage,
  DashboardSummary,
  MealEntry,
  MealPlan,
  ProgressPhoto,
  TrainingPlan,
  TrainingPlanDay,
  UserProfile,
  WaterLog,
  WeightLog,
  WorkoutExercise,
  WorkoutLevel,
  WorkoutLog,
  WorkoutPreferences,
  WorkoutProgram,
} from '../types';
import { calculateNutritionTargets, formatShortWeekday, getLastNDaysISO, getTodayISO } from '../utils/nutrition';
import { DEFAULT_WORKOUT_CATALOG } from './seedWorkouts';
import { buildDefaultTrainingPlan } from '../utils/trainingPlans';
import { buildExercisesFromIds } from '../database/exerciseLibrary';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const CATALOG_BY_ID = new Map(DEFAULT_WORKOUT_CATALOG.map((w) => [w.id, w]));
const CATALOG_BY_TITLE = new Map(DEFAULT_WORKOUT_CATALOG.map((w) => [w.title.trim().toLowerCase(), w]));

function isMissingTableOrColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const code = err.code || '';
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('could not find the')
  );
}

function parseJsonField<T>(val: unknown, fallback: T): T {
  if (val === undefined || val === null) return fallback;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  return val as T;
}

function enrichWorkoutProgram(raw: Record<string, unknown>): WorkoutProgram {
  const id = String(raw.id);
  const title = String(raw.title);
  const catalogMatch = CATALOG_BY_ID.get(id) || CATALOG_BY_TITLE.get(title.trim().toLowerCase());

  const parsedExercises = parseJsonField<WorkoutExercise[]>(raw.exercises, []);
  const parsedWarmup = parseJsonField<WorkoutExercise[]>(raw.warmup, []);
  const parsedCooldown = parseJsonField<WorkoutExercise[]>(raw.cooldown, []);
  const parsedEquipment = parseJsonField<string[]>(raw.equipment, ['Peso corporal']);
  const parsedFocus = parseJsonField<string[]>(raw.muscle_focus, []);

  return {
    id,
    user_id: (raw.user_id as string | null) ?? null,
    title,
    category: catalogMatch ? catalogMatch.category : String(raw.category),
    level: (raw.level as WorkoutLevel) || 'intermediario',
    duration_minutes: Number(raw.duration_minutes),
    estimated_calories: Number(raw.estimated_calories),
    equipment: parsedEquipment.length ? parsedEquipment : catalogMatch?.equipment || ['Peso corporal'],
    description: String(raw.description || catalogMatch?.description || ''),
    warmup:
      parsedWarmup.length > 0
        ? parsedWarmup
        : catalogMatch?.warmup && catalogMatch.warmup.length > 0
          ? catalogMatch.warmup
          : buildExercisesFromIds(['warm-arm-circles', 'warm-torso-twist'], 'warmup'),
    exercises:
      catalogMatch && !raw.user_id ? catalogMatch.exercises : parsedExercises,
    cooldown:
      parsedCooldown.length > 0
        ? parsedCooldown
        : catalogMatch?.cooldown && catalogMatch.cooldown.length > 0
          ? catalogMatch.cooldown
          : buildExercisesFromIds(['cool-child-pose', 'cool-cobra'], 'cooldown'),
    muscle_focus:
      parsedFocus.length > 0 ? parsedFocus : catalogMatch?.muscle_focus || [String(raw.category)],
    is_ai_generated: Boolean(raw.is_ai_generated),
    is_custom: Boolean(raw.is_custom),
    video_url: (raw.video_url as string | null) ?? null,
    created_at: raw.created_at ? String(raw.created_at) : undefined,
  };
}

function parseProfileRow(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    email: String(row.email),
    full_name: String(row.full_name),
    age: Number(row.age),
    sex: (row.sex as UserProfile['sex']) || 'masculino',
    height_cm: Number(row.height_cm),
    current_weight_kg: Number(row.current_weight_kg),
    target_weight_kg: Number(row.target_weight_kg),
    activity_level: (row.activity_level as UserProfile['activity_level']) || 'moderado',
    goal: (row.goal as UserProfile['goal']) || 'emagrecimento',
    dietary_restrictions: parseJsonField<string[]>(row.dietary_restrictions, []),
    workout_level: (row.workout_level as UserProfile['workout_level']) || 'intermediario',
    home_equipment: parseJsonField<string[]>(row.home_equipment, ['Peso corporal']),
    daily_calorie_target: Number(row.daily_calorie_target),
    protein_target_g: Number(row.protein_target_g),
    carbs_target_g: Number(row.carbs_target_g),
    fat_target_g: Number(row.fat_target_g),
    water_target_ml: Number(row.water_target_ml),
    avatar_url: (row.avatar_url as string | null) ?? null,
    onboarding_completed: Boolean(row.onboarding_completed),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function checkTrainingMigrationPending(): Promise<boolean> {
  const sb = getSupabaseClientForToken();
  if (!sb) return false;
  const [plansCheck, prefsCheck] = await Promise.all([
    sb.from('training_plans').select('id').limit(1),
    sb.from('workout_preferences').select('user_id').limit(1),
  ]);
  return Boolean(
    (plansCheck.error && (isMissingTableOrColumnError(plansCheck.error) || plansCheck.status === 404)) ||
      (prefsCheck.error && (isMissingTableOrColumnError(prefsCheck.error) || prefsCheck.status === 404))
  );
}

export async function getProfileById(userId: string): Promise<UserProfile | null> {
  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
    return data ? parseProfileRow(data) : null;
  }
  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(userId) as Record<string, unknown> | undefined;
  return row ? parseProfileRow(row) : null;
}

export async function createLocalUserAndProfile(params: {
  email: string;
  password: string;
  full_name: string;
}): Promise<UserProfile> {
  const emailLower = params.email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(emailLower);
  if (existing) {
    throw new Error('Já existe uma conta cadastrada com este e-mail.');
  }

  const id = v4Fallback();
  const now = new Date().toISOString();
  const hash = bcrypt.hashSync(params.password, 10);

  db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    emailLower,
    hash,
    now
  );

  const targets = calculateNutritionTargets({
    age: 28,
    sex: 'masculino',
    height_cm: 175,
    current_weight_kg: 78,
    activity_level: 'moderado',
    goal: 'emagrecimento',
  });

  db.prepare(`
    INSERT INTO profiles (
      id, email, full_name, age, sex, height_cm, current_weight_kg, target_weight_kg,
      activity_level, goal, dietary_restrictions, workout_level, home_equipment,
      daily_calorie_target, protein_target_g, carbs_target_g, fat_target_g, water_target_ml,
      onboarding_completed, created_at, updated_at
    ) VALUES (?, ?, ?, 28, 'masculino', 175, 78, 72, 'moderado', 'emagrecimento', '[]', 'intermediario', '["Peso corporal"]', ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    id,
    emailLower,
    params.full_name.trim(),
    targets.daily_calorie_target,
    targets.protein_target_g,
    targets.carbs_target_g,
    targets.fat_target_g,
    targets.water_target_ml,
    now,
    now
  );

  db.prepare('INSERT INTO coach_messages (id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(
    v4Fallback(),
    id,
    'assistant',
    `Bem-vindo(a) ao PRATO & TREINO, ${params.full_name.trim()}! Assim que finalizar seus dados físicos, ajusto suas metas e fico pronto para montar seus treinos e refeições.`,
    now
  );

  const profile = await getProfileById(id);
  return profile!;
}

export async function verifyLocalUserCredentials(email: string, password: string): Promise<UserProfile> {
  const emailLower = email.trim().toLowerCase();
  const userRow = db
    .prepare('SELECT id, password_hash FROM users WHERE email = ?')
    .get(emailLower) as { id: string; password_hash: string } | undefined;

  if (!userRow || !bcrypt.compareSync(password, userRow.password_hash)) {
    throw new Error('E-mail ou senha inválidos.');
  }

  const profile = await getProfileById(userRow.id);
  if (!profile) {
    throw new Error('Perfil do usuário não encontrado.');
  }
  return profile;
}

export async function ensureSupabaseProfile(params: {
  id: string;
  email: string;
  full_name: string;
}): Promise<UserProfile> {
  const sb = getSupabaseClientForToken();
  if (!sb) throw new Error('Supabase não configurado.');

  const existing = await getProfileById(params.id);
  if (existing) return existing;

  const targets = calculateNutritionTargets({
    age: 28,
    sex: 'masculino',
    height_cm: 175,
    current_weight_kg: 78,
    activity_level: 'moderado',
    goal: 'emagrecimento',
  });

  const payload = {
    id: params.id,
    email: params.email,
    full_name: params.full_name || params.email.split('@')[0],
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
    onboarding_completed: false,
  };

  const { data, error } = await sb.from('profiles').insert(payload).select('*').single();
  if (error) {
    if (error.message.includes('public.profiles') || error.message.includes('schema cache')) {
      throw new Error(
        'As tabelas ainda não existem no seu Supabase. Execute o conteúdo de supabase/migrations/001_initial_schema.sql no SQL Editor do Supabase e tente novamente.'
      );
    }
    throw new Error(error.message);
  }
  return parseProfileRow(data);
}

export async function updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
  const current = await getProfileById(userId);
  if (!current) throw new Error('Perfil não encontrado.');

  const merged = {
    ...current,
    ...updates,
  };

  const recalculated = calculateNutritionTargets({
    age: Number(merged.age),
    sex: merged.sex,
    height_cm: Number(merged.height_cm),
    current_weight_kg: Number(merged.current_weight_kg),
    activity_level: merged.activity_level,
    goal: merged.goal,
  });

  const finalCal = updates.daily_calorie_target ?? recalculated.daily_calorie_target;
  const finalProt = updates.protein_target_g ?? recalculated.protein_target_g;
  const finalCarbs = updates.carbs_target_g ?? recalculated.carbs_target_g;
  const finalFat = updates.fat_target_g ?? recalculated.fat_target_g;
  const finalWater = updates.water_target_ml ?? recalculated.water_target_ml;
  const now = new Date().toISOString();

  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data, error } = await sb
      .from('profiles')
      .update({
        full_name: merged.full_name,
        age: merged.age,
        sex: merged.sex,
        height_cm: merged.height_cm,
        current_weight_kg: merged.current_weight_kg,
        target_weight_kg: merged.target_weight_kg,
        activity_level: merged.activity_level,
        goal: merged.goal,
        dietary_restrictions: merged.dietary_restrictions,
        workout_level: merged.workout_level,
        home_equipment: merged.home_equipment,
        daily_calorie_target: finalCal,
        protein_target_g: finalProt,
        carbs_target_g: finalCarbs,
        fat_target_g: finalFat,
        water_target_ml: finalWater,
        avatar_url: merged.avatar_url ?? null,
        onboarding_completed: Boolean(merged.onboarding_completed),
        updated_at: now,
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return parseProfileRow(data);
  }

  db.prepare(`
    UPDATE profiles SET
      full_name = ?, age = ?, sex = ?, height_cm = ?, current_weight_kg = ?, target_weight_kg = ?,
      activity_level = ?, goal = ?, dietary_restrictions = ?, workout_level = ?, home_equipment = ?,
      daily_calorie_target = ?, protein_target_g = ?, carbs_target_g = ?, fat_target_g = ?, water_target_ml = ?,
      avatar_url = ?, onboarding_completed = ?, updated_at = ?
    WHERE id = ?
  `).run(
    merged.full_name,
    merged.age,
    merged.sex,
    merged.height_cm,
    merged.current_weight_kg,
    merged.target_weight_kg,
    merged.activity_level,
    merged.goal,
    JSON.stringify(merged.dietary_restrictions || []),
    merged.workout_level,
    JSON.stringify(merged.home_equipment || ['Peso corporal']),
    finalCal,
    finalProt,
    finalCarbs,
    finalFat,
    finalWater,
    merged.avatar_url ?? null,
    merged.onboarding_completed ? 1 : 0,
    now,
    userId
  );

  const existingWeight = db
    .prepare('SELECT id FROM weight_logs WHERE user_id = ? LIMIT 1')
    .get(userId);
  if (!existingWeight && merged.current_weight_kg > 0) {
    await addWeightLog(userId, {
      date: getTodayISO(),
      weight_kg: Number(merged.current_weight_kg),
      notes: 'Peso inicial registrado no perfil',
    });
  }

  return (await getProfileById(userId))!;
}

// --- MEALS ---
export async function listMeals(userId: string, date?: string): Promise<MealEntry[]> {
  const sb = getSupabaseClientForToken();
  if (sb) {
    let q = sb.from('meals').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (date) q = q.eq('date', date);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as MealEntry[];
  }

  const rows = date
    ? (db
        .prepare('SELECT * FROM meals WHERE user_id = ? AND date = ? ORDER BY created_at DESC')
        .all(userId, date) as Record<string, unknown>[])
    : (db
        .prepare('SELECT * FROM meals WHERE user_id = ? ORDER BY date DESC, created_at DESC LIMIT 100')
        .all(userId) as Record<string, unknown>[]);

  return rows.map((r) => ({
    id: String(r.id),
    user_id: String(r.user_id),
    date: String(r.date),
    category: r.category as MealEntry['category'],
    title: String(r.title),
    description: String(r.description || ''),
    calories: Number(r.calories),
    protein_g: Number(r.protein_g),
    carbs_g: Number(r.carbs_g),
    fat_g: Number(r.fat_g),
    fiber_g: Number(r.fiber_g || 0),
    image_url: (r.image_url as string | null) ?? null,
    items: parseJsonField(r.items, []),
    ai_analyzed: Boolean(r.ai_analyzed),
    created_at: String(r.created_at),
  }));
}

export async function addMeal(userId: string, input: Omit<MealEntry, 'id' | 'user_id' | 'created_at'>): Promise<MealEntry> {
  const id = v4Fallback();
  const now = new Date().toISOString();
  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data, error } = await sb
      .from('meals')
      .insert({
        id,
        user_id: userId,
        date: input.date || getTodayISO(),
        category: input.category,
        title: input.title,
        description: input.description || '',
        calories: Math.round(input.calories),
        protein_g: Number(input.protein_g),
        carbs_g: Number(input.carbs_g),
        fat_g: Number(input.fat_g),
        fiber_g: Number(input.fiber_g || 0),
        image_url: input.image_url || null,
        items: input.items || [],
        ai_analyzed: Boolean(input.ai_analyzed),
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as MealEntry;
  }

  db.prepare(`
    INSERT INTO meals (id, user_id, date, category, title, description, calories, protein_g, carbs_g, fat_g, fiber_g, image_url, items, ai_analyzed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    input.date || getTodayISO(),
    input.category,
    input.title,
    input.description || '',
    Math.round(input.calories),
    Number(input.protein_g),
    Number(input.carbs_g),
    Number(input.fat_g),
    Number(input.fiber_g || 0),
    input.image_url || null,
    JSON.stringify(input.items || []),
    input.ai_analyzed ? 1 : 0,
    now
  );

  return {
    id,
    user_id: userId,
    date: input.date || getTodayISO(),
    category: input.category,
    title: input.title,
    description: input.description || '',
    calories: Math.round(input.calories),
    protein_g: Number(input.protein_g),
    carbs_g: Number(input.carbs_g),
    fat_g: Number(input.fat_g),
    fiber_g: Number(input.fiber_g || 0),
    image_url: input.image_url || null,
    items: input.items || [],
    ai_analyzed: Boolean(input.ai_analyzed),
    created_at: now,
  };
}

export async function deleteMeal(userId: string, mealId: string): Promise<void> {
  const sb = getSupabaseClientForToken();
  if (sb) {
    await sb.from('meals').delete().eq('id', mealId).eq('user_id', userId);
    return;
  }
  db.prepare('DELETE FROM meals WHERE id = ? AND user_id = ?').run(mealId, userId);
}

// --- MEAL PLANS ---
export async function listMealPlans(userId: string): Promise<MealPlan[]> {
  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data } = await sb.from('meal_plans').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    return (data || []) as MealPlan[];
  }
  const rows = db
    .prepare('SELECT * FROM meal_plans WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(userId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    user_id: String(r.user_id),
    title: String(r.title),
    goal: r.goal as MealPlan['goal'],
    total_calories: Number(r.total_calories),
    total_protein_g: Number(r.total_protein_g),
    total_carbs_g: Number(r.total_carbs_g),
    total_fat_g: Number(r.total_fat_g),
    meals: parseJsonField(r.meals, []),
    notes: String(r.notes || ''),
    created_at: String(r.created_at),
  }));
}

export async function saveMealPlan(userId: string, plan: Omit<MealPlan, 'id' | 'user_id' | 'created_at'>): Promise<MealPlan> {
  const id = v4Fallback();
  const now = new Date().toISOString();
  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data, error } = await sb
      .from('meal_plans')
      .insert({ id, user_id: userId, ...plan })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as MealPlan;
  }
  db.prepare(`
    INSERT INTO meal_plans (id, user_id, title, goal, total_calories, total_protein_g, total_carbs_g, total_fat_g, meals, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    plan.title,
    plan.goal,
    plan.total_calories,
    plan.total_protein_g,
    plan.total_carbs_g,
    plan.total_fat_g,
    JSON.stringify(plan.meals),
    plan.notes,
    now
  );
  return { id, user_id: userId, ...plan, created_at: now };
}

// --- WORKOUTS ---
export async function listWorkouts(userId: string): Promise<WorkoutProgram[]> {
  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data } = await sb
      .from('workouts')
      .select('*')
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    const remoteRows = (data || []).map((row) => enrichWorkoutProgram(row as Record<string, unknown>));

    // Mescla treinos do usuário salvos em fallback SQLite caso existam
    const localUserRows = (
      db
        .prepare('SELECT * FROM workouts WHERE user_id = ? ORDER BY created_at DESC')
        .all(userId) as Record<string, unknown>[]
    ).map(enrichWorkoutProgram);

    const userWorkoutsMap = new Map<string, WorkoutProgram>();
    for (const w of remoteRows.filter((r) => Boolean(r.user_id))) {
      userWorkoutsMap.set(w.id, w);
    }
    for (const w of localUserRows) {
      if (!userWorkoutsMap.has(w.id)) userWorkoutsMap.set(w.id, w);
    }

    // Garante todos os 20 programas completos em 10 categorias
    const seenIds = new Set<string>();
    const combined: WorkoutProgram[] = [];
    for (const uw of userWorkoutsMap.values()) {
      seenIds.add(uw.id);
      combined.push(uw);
    }
    for (const cat of DEFAULT_WORKOUT_CATALOG) {
      if (!seenIds.has(cat.id)) {
        seenIds.add(cat.id);
        combined.push(cat);
      }
    }
    return combined;
  }

  const rows = db
    .prepare('SELECT * FROM workouts WHERE user_id IS NULL OR user_id = ? ORDER BY is_custom DESC, is_ai_generated DESC, created_at DESC')
    .all(userId) as Record<string, unknown>[];

  return rows.map(enrichWorkoutProgram);
}

export async function saveWorkout(userId: string, workout: Omit<WorkoutProgram, 'id' | 'user_id' | 'created_at'>): Promise<WorkoutProgram> {
  const id = v4Fallback();
  const now = new Date().toISOString();
  const enrichedWarmup =
    workout.warmup && workout.warmup.length > 0
      ? workout.warmup
      : buildExercisesFromIds(['warm-arm-circles', 'warm-torso-twist'], 'warmup');
  const enrichedCooldown =
    workout.cooldown && workout.cooldown.length > 0
      ? workout.cooldown
      : buildExercisesFromIds(['cool-child-pose', 'cool-cobra'], 'cooldown');
  const focusArr = workout.muscle_focus && workout.muscle_focus.length ? workout.muscle_focus : [workout.category];

  const sb = getSupabaseClientForToken();
  if (sb) {
    const fullInsert = await sb
      .from('workouts')
      .insert({
        id,
        user_id: userId,
        title: workout.title,
        category: workout.category,
        level: workout.level,
        duration_minutes: workout.duration_minutes,
        estimated_calories: workout.estimated_calories,
        equipment: workout.equipment,
        description: workout.description,
        warmup: enrichedWarmup,
        exercises: workout.exercises,
        cooldown: enrichedCooldown,
        muscle_focus: focusArr,
        is_ai_generated: Boolean(workout.is_ai_generated),
        is_custom: Boolean(workout.is_custom),
        video_url: workout.video_url || null,
      })
      .select('*')
      .single();

    if (!fullInsert.error && fullInsert.data) {
      return enrichWorkoutProgram(fullInsert.data as Record<string, unknown>);
    }

    if (isMissingTableOrColumnError(fullInsert.error)) {
      // Fallback para colunas 001 no Supabase enquanto 002 não foi executada
      const baseInsert = await sb
        .from('workouts')
        .insert({
          id,
          user_id: userId,
          title: workout.title,
          category: workout.category,
          level: workout.level,
          duration_minutes: workout.duration_minutes,
          estimated_calories: workout.estimated_calories,
          equipment: workout.equipment,
          description: workout.description,
          exercises: workout.exercises,
          is_ai_generated: Boolean(workout.is_ai_generated),
          video_url: workout.video_url || null,
        })
        .select('*')
        .single();

      if (!baseInsert.error && baseInsert.data) {
        return {
          ...enrichWorkoutProgram(baseInsert.data as Record<string, unknown>),
          warmup: enrichedWarmup,
          cooldown: enrichedCooldown,
          muscle_focus: focusArr,
          is_custom: Boolean(workout.is_custom),
        };
      }
    }

    throw new Error(fullInsert.error?.message || 'Erro ao salvar treino no Supabase.');
  }

  db.prepare(`
    INSERT INTO workouts (
      id, user_id, title, category, level, duration_minutes, estimated_calories,
      equipment, description, warmup, exercises, cooldown, muscle_focus,
      is_ai_generated, is_custom, video_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    workout.title,
    workout.category,
    workout.level,
    workout.duration_minutes,
    workout.estimated_calories,
    JSON.stringify(workout.equipment),
    workout.description,
    JSON.stringify(enrichedWarmup),
    JSON.stringify(workout.exercises),
    JSON.stringify(enrichedCooldown),
    JSON.stringify(focusArr),
    workout.is_ai_generated ? 1 : 0,
    workout.is_custom ? 1 : 0,
    workout.video_url || null,
    now
  );

  return {
    id,
    user_id: userId,
    ...workout,
    warmup: enrichedWarmup,
    cooldown: enrichedCooldown,
    muscle_focus: focusArr,
    created_at: now,
  };
}

export async function deleteWorkout(userId: string, workoutId: string): Promise<void> {
  const sb = getSupabaseClientForToken();
  if (sb) {
    await sb.from('workouts').delete().eq('id', workoutId).eq('user_id', userId);
  }
  db.prepare('DELETE FROM workouts WHERE id = ? AND user_id = ?').run(workoutId, userId);
}

// --- WORKOUT LOGS ---
export async function listWorkoutLogs(userId: string): Promise<WorkoutLog[]> {
  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data } = await sb
      .from('workout_logs')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(120);
    return (data || []) as WorkoutLog[];
  }
  return db
    .prepare('SELECT * FROM workout_logs WHERE user_id = ? ORDER BY date DESC, created_at DESC LIMIT 120')
    .all(userId) as WorkoutLog[];
}

export async function addWorkoutLog(userId: string, log: Omit<WorkoutLog, 'id' | 'user_id' | 'created_at'>): Promise<WorkoutLog> {
  const id = v4Fallback();
  const now = new Date().toISOString();
  const date = log.date || getTodayISO();
  const sb = getSupabaseClientForToken();
  if (sb) {
    const fullAttempt = await sb
      .from('workout_logs')
      .insert({
        id,
        user_id: userId,
        workout_id: log.workout_id,
        workout_title: log.workout_title,
        date,
        duration_minutes: log.duration_minutes,
        calories_burned: log.calories_burned,
        exercises_completed: log.exercises_completed,
        skipped_exercises: log.skipped_exercises ?? 0,
        plan_id: log.plan_id ?? null,
        plan_day_number: log.plan_day_number ?? null,
        perceived_difficulty: log.perceived_difficulty ?? null,
        warmup_done: log.warmup_done ?? true,
        cooldown_done: log.cooldown_done ?? true,
        notes: log.notes || '',
      })
      .select('*')
      .single();

    if (!fullAttempt.error && fullAttempt.data) {
      return fullAttempt.data as WorkoutLog;
    }

    if (isMissingTableOrColumnError(fullAttempt.error)) {
      const baseAttempt = await sb
        .from('workout_logs')
        .insert({
          id,
          user_id: userId,
          workout_id: log.workout_id,
          workout_title: log.workout_title,
          date,
          duration_minutes: log.duration_minutes,
          calories_burned: log.calories_burned,
          exercises_completed: log.exercises_completed,
          notes: log.notes || '',
        })
        .select('*')
        .single();
      if (!baseAttempt.error && baseAttempt.data) {
        return {
          ...(baseAttempt.data as WorkoutLog),
          skipped_exercises: log.skipped_exercises ?? 0,
          plan_id: log.plan_id ?? null,
          plan_day_number: log.plan_day_number ?? null,
          perceived_difficulty: log.perceived_difficulty ?? null,
        };
      }
      throw new Error(baseAttempt.error?.message || 'Erro ao registrar treino.');
    }

    throw new Error(fullAttempt.error?.message || 'Erro ao registrar treino.');
  }

  db.prepare(`
    INSERT INTO workout_logs (
      id, user_id, workout_id, workout_title, date, duration_minutes, calories_burned,
      exercises_completed, skipped_exercises, plan_id, plan_day_number, perceived_difficulty,
      warmup_done, cooldown_done, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    log.workout_id,
    log.workout_title,
    date,
    log.duration_minutes,
    log.calories_burned,
    log.exercises_completed,
    log.skipped_exercises ?? 0,
    log.plan_id ?? null,
    log.plan_day_number ?? null,
    log.perceived_difficulty ?? null,
    log.warmup_done === false ? 0 : 1,
    log.cooldown_done === false ? 0 : 1,
    log.notes || '',
    now
  );
  return { id, user_id: userId, ...log, date, created_at: now };
}

// --- WORKOUT PREFERENCES & REMINDERS ---
function defaultWorkoutPreferences(userId: string, level: WorkoutLevel = 'intermediario'): WorkoutPreferences {
  return {
    user_id: userId,
    favorite_exercise_ids: [],
    substituted_exercises: {},
    preferred_level: level,
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
    updated_at: new Date().toISOString(),
  };
}

function parsePreferencesRow(userId: string, row: Record<string, unknown>): WorkoutPreferences {
  return {
    user_id: userId,
    favorite_exercise_ids: parseJsonField<string[]>(row.favorite_exercise_ids, []),
    substituted_exercises: parseJsonField<Record<string, string>>(row.substituted_exercises, {}),
    preferred_level: (row.preferred_level as WorkoutLevel) || 'intermediario',
    preferred_duration_min: Number(row.preferred_duration_min ?? 25),
    focus_muscles: parseJsonField<string[]>(row.focus_muscles, ['Corpo inteiro']),
    voice_enabled: row.voice_enabled === undefined ? true : Boolean(row.voice_enabled),
    sound_enabled: row.sound_enabled === undefined ? true : Boolean(row.sound_enabled),
    countdown_seconds: Number(row.countdown_seconds ?? 5),
    rest_seconds: Number(row.rest_seconds ?? 20),
    adaptive_multiplier: Number(row.adaptive_multiplier ?? 1.0),
    reminder_enabled: Boolean(row.reminder_enabled),
    reminder_time: String(row.reminder_time || '07:30'),
    reminder_days: parseJsonField<number[]>(row.reminder_days, [1, 2, 3, 4, 5]),
    reminder_frequency: (row.reminder_frequency as WorkoutPreferences['reminder_frequency']) || 'dias_selecionados',
    rest_time_reminder: String(row.rest_time_reminder || '22:00'),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function getWorkoutPreferences(userId: string, fallbackLevel: WorkoutLevel = 'intermediario'): Promise<WorkoutPreferences> {
  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data, error } = await sb
      .from('workout_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error) {
      if (data) return parsePreferencesRow(userId, data as Record<string, unknown>);
      const initial = defaultWorkoutPreferences(userId, fallbackLevel);
      const created = await sb
        .from('workout_preferences')
        .upsert(initial, { onConflict: 'user_id' })
        .select('*')
        .single();
      if (!created.error && created.data) {
        return parsePreferencesRow(userId, created.data as Record<string, unknown>);
      }
      return initial;
    }
    if (!isMissingTableOrColumnError(error)) {
      return defaultWorkoutPreferences(userId, fallbackLevel);
    }
  }

  const row = db
    .prepare('SELECT * FROM workout_preferences WHERE user_id = ?')
    .get(userId) as Record<string, unknown> | undefined;
  if (row) return parsePreferencesRow(userId, row);

  const initial = defaultWorkoutPreferences(userId, fallbackLevel);
  db.prepare(`
    INSERT INTO workout_preferences (
      user_id, favorite_exercise_ids, substituted_exercises, preferred_level, preferred_duration_min,
      focus_muscles, voice_enabled, sound_enabled, countdown_seconds, rest_seconds,
      adaptive_multiplier, reminder_enabled, reminder_time, reminder_days, reminder_frequency,
      rest_time_reminder, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    JSON.stringify(initial.favorite_exercise_ids),
    JSON.stringify(initial.substituted_exercises),
    initial.preferred_level,
    initial.preferred_duration_min,
    JSON.stringify(initial.focus_muscles),
    initial.voice_enabled ? 1 : 0,
    initial.sound_enabled ? 1 : 0,
    initial.countdown_seconds,
    initial.rest_seconds,
    initial.adaptive_multiplier,
    initial.reminder_enabled ? 1 : 0,
    initial.reminder_time,
    JSON.stringify(initial.reminder_days),
    initial.reminder_frequency,
    initial.rest_time_reminder,
    initial.updated_at
  );
  return initial;
}

export async function updateWorkoutPreferences(
  userId: string,
  patch: Partial<WorkoutPreferences>
): Promise<WorkoutPreferences> {
  const current = await getWorkoutPreferences(userId);
  const now = new Date().toISOString();
  const next: WorkoutPreferences = {
    ...current,
    ...patch,
    user_id: userId,
    updated_at: now,
  };

  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data, error } = await sb
      .from('workout_preferences')
      .upsert(next, { onConflict: 'user_id' })
      .select('*')
      .single();

    if (!error && data) {
      return parsePreferencesRow(userId, data as Record<string, unknown>);
    }
    if (error && !isMissingTableOrColumnError(error)) {
      throw new Error(error.message);
    }
  }

  db.prepare(`
    INSERT INTO workout_preferences (
      user_id, favorite_exercise_ids, substituted_exercises, preferred_level, preferred_duration_min,
      focus_muscles, voice_enabled, sound_enabled, countdown_seconds, rest_seconds,
      adaptive_multiplier, reminder_enabled, reminder_time, reminder_days, reminder_frequency,
      rest_time_reminder, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      favorite_exercise_ids = excluded.favorite_exercise_ids,
      substituted_exercises = excluded.substituted_exercises,
      preferred_level = excluded.preferred_level,
      preferred_duration_min = excluded.preferred_duration_min,
      focus_muscles = excluded.focus_muscles,
      voice_enabled = excluded.voice_enabled,
      sound_enabled = excluded.sound_enabled,
      countdown_seconds = excluded.countdown_seconds,
      rest_seconds = excluded.rest_seconds,
      adaptive_multiplier = excluded.adaptive_multiplier,
      reminder_enabled = excluded.reminder_enabled,
      reminder_time = excluded.reminder_time,
      reminder_days = excluded.reminder_days,
      reminder_frequency = excluded.reminder_frequency,
      rest_time_reminder = excluded.rest_time_reminder,
      updated_at = excluded.updated_at
  `).run(
    userId,
    JSON.stringify(next.favorite_exercise_ids),
    JSON.stringify(next.substituted_exercises),
    next.preferred_level,
    next.preferred_duration_min,
    JSON.stringify(next.focus_muscles),
    next.voice_enabled ? 1 : 0,
    next.sound_enabled ? 1 : 0,
    next.countdown_seconds,
    next.rest_seconds,
    next.adaptive_multiplier,
    next.reminder_enabled ? 1 : 0,
    next.reminder_time,
    JSON.stringify(next.reminder_days),
    next.reminder_frequency,
    next.rest_time_reminder,
    now
  );

  return next;
}

export async function applyWorkoutAdaptation(
  userId: string,
  perceivedDifficulty: 'facil' | 'ideal' | 'intenso'
): Promise<WorkoutPreferences> {
  const prefs = await getWorkoutPreferences(userId);
  let nextMult = prefs.adaptive_multiplier;
  if (perceivedDifficulty === 'facil') {
    nextMult = Math.min(1.45, Number((prefs.adaptive_multiplier + 0.08).toFixed(2)));
  } else if (perceivedDifficulty === 'intenso') {
    nextMult = Math.max(0.75, Number((prefs.adaptive_multiplier - 0.08).toFixed(2)));
  }
  if (nextMult === prefs.adaptive_multiplier) return prefs;
  return updateWorkoutPreferences(userId, { adaptive_multiplier: nextMult });
}

// --- TRAINING PLANS (7, 14, 30, 60 DAYS) ---
function parseTrainingPlanRow(row: Record<string, unknown>): TrainingPlan {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    title: String(row.title),
    duration_days: Number(row.duration_days) as TrainingPlan['duration_days'],
    level: (row.level as WorkoutLevel) || 'intermediario',
    goal: String(row.goal || 'emagrecimento'),
    current_day: Number(row.current_day || 1),
    completed_days: parseJsonField<number[]>(row.completed_days, []),
    schedule: parseJsonField<TrainingPlanDay[]>(row.schedule, []),
    active: Boolean(row.active),
    started_at: String(row.started_at || new Date().toISOString()),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function getActiveTrainingPlan(
  userId: string,
  profile?: { workout_level: WorkoutLevel; goal: string }
): Promise<TrainingPlan> {
  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data, error } = await sb
      .from('training_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error) {
      if (data) return parseTrainingPlanRow(data as Record<string, unknown>);
      return createTrainingPlan(userId, {
        duration_days: 30,
        level: profile?.workout_level || 'intermediario',
        goal: profile?.goal || 'emagrecimento',
      });
    }
    if (!isMissingTableOrColumnError(error)) {
      throw new Error(error.message);
    }
  }

  const row = db
    .prepare('SELECT * FROM training_plans WHERE user_id = ? AND active = 1 ORDER BY started_at DESC LIMIT 1')
    .get(userId) as Record<string, unknown> | undefined;
  if (row) return parseTrainingPlanRow(row);

  return createTrainingPlan(userId, {
    duration_days: 30,
    level: profile?.workout_level || 'intermediario',
    goal: profile?.goal || 'emagrecimento',
  });
}

export async function createTrainingPlan(
  userId: string,
  params: { duration_days: 7 | 14 | 30 | 60; level: WorkoutLevel; goal: string }
): Promise<TrainingPlan> {
  const planDraft = buildDefaultTrainingPlan({
    userId,
    durationDays: params.duration_days,
    level: params.level,
    goal: params.goal,
  });
  const id = v4Fallback();
  const now = new Date().toISOString();

  const plan: TrainingPlan = {
    id,
    ...planDraft,
    started_at: now,
    updated_at: now,
  };

  const sb = getSupabaseClientForToken();
  if (sb) {
    const deactivate = await sb
      .from('training_plans')
      .update({ active: false })
      .eq('user_id', userId)
      .eq('active', true);

    if (!deactivate.error || isMissingTableOrColumnError(deactivate.error)) {
      const inserted = await sb
        .from('training_plans')
        .insert({
          id,
          user_id: userId,
          title: plan.title,
          duration_days: plan.duration_days,
          level: plan.level,
          goal: plan.goal,
          current_day: plan.current_day,
          completed_days: plan.completed_days,
          schedule: plan.schedule,
          active: true,
          started_at: now,
        })
        .select('*')
        .single();

      if (!inserted.error && inserted.data) {
        return parseTrainingPlanRow(inserted.data as Record<string, unknown>);
      }
      if (inserted.error && !isMissingTableOrColumnError(inserted.error)) {
        throw new Error(inserted.error.message);
      }
    }
  }

  db.prepare('UPDATE training_plans SET active = 0 WHERE user_id = ?').run(userId);
  db.prepare(`
    INSERT INTO training_plans (
      id, user_id, title, duration_days, level, goal, current_day,
      completed_days, schedule, active, started_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id,
    userId,
    plan.title,
    plan.duration_days,
    plan.level,
    plan.goal,
    plan.current_day,
    JSON.stringify(plan.completed_days),
    JSON.stringify(plan.schedule),
    now,
    now
  );

  return plan;
}

export async function completeTrainingPlanDay(
  userId: string,
  planId: string,
  dayNumber: number
): Promise<TrainingPlan | null> {
  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data, error } = await sb
      .from('training_plans')
      .select('*')
      .eq('id', planId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      const plan = parseTrainingPlanRow(data as Record<string, unknown>);
      const completed = Array.from(new Set([...plan.completed_days, dayNumber])).sort((a, b) => a - b);
      const nextDay = Math.min(plan.duration_days, Math.max(plan.current_day, dayNumber + 1));
      const { data: updated } = await sb
        .from('training_plans')
        .update({ completed_days: completed, current_day: nextDay, updated_at: new Date().toISOString() })
        .eq('id', planId)
        .eq('user_id', userId)
        .select('*')
        .single();
      return updated ? parseTrainingPlanRow(updated as Record<string, unknown>) : { ...plan, completed_days: completed, current_day: nextDay };
    }
    if (error && !isMissingTableOrColumnError(error)) {
      return null;
    }
  }

  const row = db
    .prepare('SELECT * FROM training_plans WHERE id = ? AND user_id = ?')
    .get(planId, userId) as Record<string, unknown> | undefined;
  if (!row) return null;

  const plan = parseTrainingPlanRow(row);
  const completed = Array.from(new Set([...plan.completed_days, dayNumber])).sort((a, b) => a - b);
  const nextDay = Math.min(plan.duration_days, Math.max(plan.current_day, dayNumber + 1));
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE training_plans SET completed_days = ?, current_day = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(JSON.stringify(completed), nextDay, now, planId, userId);

  return { ...plan, completed_days: completed, current_day: nextDay, updated_at: now };
}

export interface WorkoutEvolutionStats {
  total_workouts: number;
  total_minutes: number;
  total_calories: number;
  total_exercises: number;
  weekly_frequency: number;
  streak_days: number;
  active_dates: string[];
  weekly_series: Array<{ date: string; label: string; minutes: number; calories: number; sessions: number }>;
  monthly_series: Array<{ label: string; minutes: number; calories: number; sessions: number }>;
}

export function computeWorkoutEvolutionStats(logs: WorkoutLog[]): WorkoutEvolutionStats {
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

  // Agrupa últimos 28 dias em 4 semanas (Sem 1..Sem 4)
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

// --- WEIGHT LOGS ---
export async function listWeightLogs(userId: string): Promise<WeightLog[]> {
  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data } = await sb
      .from('weight_logs')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .limit(90);
    return (data || []) as WeightLog[];
  }
  return db
    .prepare('SELECT * FROM weight_logs WHERE user_id = ? ORDER BY date ASC, created_at ASC LIMIT 90')
    .all(userId) as WeightLog[];
}

export async function addWeightLog(
  userId: string,
  input: Omit<WeightLog, 'id' | 'user_id' | 'created_at'>
): Promise<WeightLog> {
  const id = v4Fallback();
  const now = new Date().toISOString();
  const date = input.date || getTodayISO();
  const sb = getSupabaseClientForToken();

  if (sb) {
    const { data, error } = await sb
      .from('weight_logs')
      .insert({ id, user_id: userId, ...input, date })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    await sb.from('profiles').update({ current_weight_kg: input.weight_kg, updated_at: now }).eq('id', userId);
    return data as WeightLog;
  }

  db.prepare(`
    INSERT INTO weight_logs (id, user_id, date, weight_kg, waist_cm, chest_cm, hip_cm, arm_cm, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    date,
    input.weight_kg,
    input.waist_cm ?? null,
    input.chest_cm ?? null,
    input.hip_cm ?? null,
    input.arm_cm ?? null,
    input.notes || '',
    now
  );
  db.prepare('UPDATE profiles SET current_weight_kg = ?, updated_at = ? WHERE id = ?').run(input.weight_kg, now, userId);

  return { id, user_id: userId, ...input, date, created_at: now };
}

export async function deleteWeightLog(userId: string, logId: string): Promise<void> {
  const sb = getSupabaseClientForToken();
  if (sb) {
    await sb.from('weight_logs').delete().eq('id', logId).eq('user_id', userId);
    return;
  }
  db.prepare('DELETE FROM weight_logs WHERE id = ? AND user_id = ?').run(logId, userId);
}

// --- WATER LOGS ---
export async function getWaterLog(userId: string, date: string): Promise<WaterLog> {
  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data } = await sb.from('water_logs').select('*').eq('user_id', userId).eq('date', date).maybeSingle();
    if (data) return data as WaterLog;
    return { id: '', user_id: userId, date, amount_ml: 0, updated_at: new Date().toISOString() };
  }
  const row = db
    .prepare('SELECT * FROM water_logs WHERE user_id = ? AND date = ?')
    .get(userId, date) as WaterLog | undefined;
  return row ?? { id: '', user_id: userId, date, amount_ml: 0, updated_at: new Date().toISOString() };
}

export async function incrementWaterLog(userId: string, date: string, deltaMl: number): Promise<WaterLog> {
  const current = await getWaterLog(userId, date);
  const nextAmount = Math.max(0, current.amount_ml + deltaMl);
  const now = new Date().toISOString();
  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data, error } = await sb
      .from('water_logs')
      .upsert(
        { id: current.id || v4Fallback(), user_id: userId, date, amount_ml: nextAmount, updated_at: now },
        { onConflict: 'user_id,date' }
      )
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as WaterLog;
  }

  if (current.id) {
    db.prepare('UPDATE water_logs SET amount_ml = ?, updated_at = ? WHERE id = ?').run(nextAmount, now, current.id);
    return { ...current, amount_ml: nextAmount, updated_at: now };
  } else {
    const id = v4Fallback();
    db.prepare('INSERT INTO water_logs (id, user_id, date, amount_ml, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      id,
      userId,
      date,
      nextAmount,
      now
    );
    return { id, user_id: userId, date, amount_ml: nextAmount, updated_at: now };
  }
}

// --- PROGRESS PHOTOS ---
export async function listProgressPhotos(userId: string): Promise<ProgressPhoto[]> {
  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data } = await sb
      .from('progress_photos')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });
    return (data || []) as ProgressPhoto[];
  }
  return db
    .prepare('SELECT * FROM progress_photos WHERE user_id = ? ORDER BY date DESC, created_at DESC')
    .all(userId) as ProgressPhoto[];
}

export async function addProgressPhoto(
  userId: string,
  input: Omit<ProgressPhoto, 'id' | 'user_id' | 'created_at'>
): Promise<ProgressPhoto> {
  const id = v4Fallback();
  const now = new Date().toISOString();
  const date = input.date || getTodayISO();
  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data, error } = await sb
      .from('progress_photos')
      .insert({ id, user_id: userId, ...input, date })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as ProgressPhoto;
  }
  db.prepare(`
    INSERT INTO progress_photos (id, user_id, date, weight_kg, caption, image_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, date, input.weight_kg ?? null, input.caption || '', input.image_url, now);
  return { id, user_id: userId, ...input, date, created_at: now };
}

export async function deleteProgressPhoto(userId: string, photoId: string): Promise<void> {
  const sb = getSupabaseClientForToken();
  if (sb) {
    await sb.from('progress_photos').delete().eq('id', photoId).eq('user_id', userId);
    return;
  }
  db.prepare('DELETE FROM progress_photos WHERE id = ? AND user_id = ?').run(photoId, userId);
}

// --- COACH MESSAGES ---
export async function listCoachMessages(userId: string): Promise<CoachMessage[]> {
  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data } = await sb
      .from('coach_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(60);
    return (data || []) as CoachMessage[];
  }
  return db
    .prepare('SELECT * FROM coach_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 60')
    .all(userId) as CoachMessage[];
}

export async function addCoachMessage(userId: string, role: 'user' | 'assistant', content: string): Promise<CoachMessage> {
  const id = v4Fallback();
  const now = new Date().toISOString();
  const sb = getSupabaseClientForToken();
  if (sb) {
    const { data, error } = await sb
      .from('coach_messages')
      .insert({ id, user_id: userId, role, content })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as CoachMessage;
  }
  db.prepare('INSERT INTO coach_messages (id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    userId,
    role,
    content,
    now
  );
  return { id, user_id: userId, role, content, created_at: now };
}

export async function clearCoachMessages(userId: string): Promise<void> {
  const sb = getSupabaseClientForToken();
  if (sb) {
    await sb.from('coach_messages').delete().eq('user_id', userId);
    return;
  }
  db.prepare('DELETE FROM coach_messages WHERE user_id = ?').run(userId);
}

// --- STORAGE ---
export async function uploadImageAsset(params: {
  userId: string;
  folder: 'meals' | 'progress' | 'avatars';
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}): Promise<string> {
  const ext = path.extname(params.originalName) || (params.mimeType.includes('png') ? '.png' : '.jpg');
  const filename = `${params.folder}/${params.userId}/${Date.now()}-${v4Fallback().slice(0, 8)}${ext}`;

  const sb = getSupabaseClientForToken();
  if (sb) {
    const { error } = await sb.storage.from('prato-treino-media').upload(filename, params.buffer, {
      contentType: params.mimeType,
      upsert: false,
    });
    if (!error) {
      const { data } = sb.storage.from('prato-treino-media').getPublicUrl(filename);
      return data.publicUrl;
    }
  }

  const localFolder = path.join(UPLOADS_DIR, params.folder);
  if (!fs.existsSync(localFolder)) {
    fs.mkdirSync(localFolder, { recursive: true });
  }
  const safeName = `${Date.now()}-${v4Fallback().slice(0, 8)}${ext}`;
  const fullPath = path.join(localFolder, safeName);
  fs.writeFileSync(fullPath, params.buffer);
  return `/uploads/${params.folder}/${safeName}`;
}

// --- DASHBOARD SUMMARY ---
export async function getDashboardSummary(userId: string, date = getTodayISO()): Promise<DashboardSummary> {
  const profile = await getProfileById(userId);
  const targetCalories = profile?.daily_calorie_target ?? 2000;

  const allMeals = await listMeals(userId);
  const todayMeals = allMeals.filter((m) => m.date === date);
  const allWorkouts = await listWorkoutLogs(userId);
  const todayWorkouts = allWorkouts.filter((w) => w.date === date);
  const water = await getWaterLog(userId, date);
  const weights = await listWeightLogs(userId);

  const last7 = getLastNDaysISO(7);
  const weekly_calories = last7.map((d) => {
    const dayMeals = allMeals.filter((m) => m.date === d);
    const dayWorkouts = allWorkouts.filter((w) => w.date === d);
    return {
      date: d,
      label: formatShortWeekday(d),
      consumed: dayMeals.reduce((acc, m) => acc + Number(m.calories), 0),
      burned: dayWorkouts.reduce((acc, w) => acc + Number(w.calories_burned), 0),
      target: targetCalories,
    };
  });

  const activeDates = new Set<string>([
    ...allMeals.map((m) => m.date),
    ...allWorkouts.map((w) => w.date),
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

  return {
    date,
    calories_consumed: todayMeals.reduce((acc, m) => acc + Number(m.calories), 0),
    calories_burned: todayWorkouts.reduce((acc, w) => acc + Number(w.calories_burned), 0),
    protein_g: Math.round(todayMeals.reduce((acc, m) => acc + Number(m.protein_g), 0)),
    carbs_g: Math.round(todayMeals.reduce((acc, m) => acc + Number(m.carbs_g), 0)),
    fat_g: Math.round(todayMeals.reduce((acc, m) => acc + Number(m.fat_g), 0)),
    water_ml: water.amount_ml,
    workouts_today: todayWorkouts.length,
    weekly_calories,
    weight_history: weights,
    streak_days,
  };
}
