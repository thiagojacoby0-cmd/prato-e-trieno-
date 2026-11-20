import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { v4Fallback } from './uuidHelper.ts';
import { DEFAULT_WORKOUT_CATALOG } from './seedWorkouts.ts';
import { getLastNDaysISO, getTodayISO } from '../utils/nutrition.ts';
import { BACKUPS_DIR, DATA_DIR, ensureAppDirectories } from './paths.ts';

ensureAppDirectories();

const DB_PATH = path.join(DATA_DIR, 'prato_treino.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const BACKUP_FILE_RE = /^prato_treino-(\d{4}-\d{2}-\d{2})\.db$/;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
let lastBackupRunMs = 0;
let autoBackupTimer: ReturnType<typeof setInterval> | null = null;

function pruneOldBackups(keepDays: number): void {
  if (!fs.existsSync(BACKUPS_DIR)) return;
  const cutoffMs = Date.now() - Math.max(1, keepDays) * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(BACKUPS_DIR)) {
    const match = BACKUP_FILE_RE.exec(name);
    if (!match) continue;
    const fullPath = path.join(BACKUPS_DIR, name);
    try {
      const stat = fs.statSync(fullPath);
      const dateMs = Date.parse(`${match[1]}T23:59:59.000Z`);
      if (stat.mtimeMs < cutoffMs && (!Number.isFinite(dateMs) || dateMs < cutoffMs)) {
        fs.unlinkSync(fullPath);
      }
    } catch {
      // Ignore cleanup race errors
    }
  }
}

export async function backupDatabase(force = false): Promise<{ created: boolean; path: string | null }> {
  ensureAppDirectories();
  const today = getTodayISO();
  const destPath = path.join(BACKUPS_DIR, `prato_treino-${today}.db`);
  const now = Date.now();

  if (!force) {
    if (lastBackupRunMs > 0 && now - lastBackupRunMs < SIX_HOURS_MS) {
      return { created: false, path: null };
    }
    try {
      let latestMtime = 0;
      for (const name of fs.readdirSync(BACKUPS_DIR)) {
        if (!BACKUP_FILE_RE.test(name)) continue;
        const st = fs.statSync(path.join(BACKUPS_DIR, name));
        if (st.mtimeMs > latestMtime) latestMtime = st.mtimeMs;
      }
      if (latestMtime > 0 && now - latestMtime < SIX_HOURS_MS) {
        lastBackupRunMs = latestMtime;
        return { created: false, path: null };
      }
    } catch {
      // Continue with backup if stat fails
    }
  }

  const tmpPath = `${destPath}.tmp-${process.pid}-${now}`;
  try {
    await db.backup(tmpPath);
    fs.renameSync(tmpPath, destPath);
    lastBackupRunMs = now;
    const keepDays = Math.max(1, Number(process.env.BACKUP_KEEP_DAYS) || 14);
    pruneOldBackups(keepDays);
    return { created: true, path: destPath };
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // Ignore cleanup failure
      }
    }
    throw err;
  }
}

export function startAutoBackup(): void {
  void backupDatabase(false).catch((err) => {
    console.warn('Backup automático inicial falhou:', err instanceof Error ? err.message : err);
  });
  if (autoBackupTimer) return;
  autoBackupTimer = setInterval(() => {
    void backupDatabase(false).catch((err) => {
      console.warn('Backup automático periódico falhou:', err instanceof Error ? err.message : err);
    });
  }, SIX_HOURS_MS);
  if (typeof autoBackupTimer.unref === 'function') {
    autoBackupTimer.unref();
  }
}

function ensureSqliteColumn(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

export function initSqliteDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      full_name TEXT NOT NULL,
      age INTEGER NOT NULL DEFAULT 28,
      sex TEXT NOT NULL DEFAULT 'masculino',
      height_cm REAL NOT NULL DEFAULT 175,
      current_weight_kg REAL NOT NULL DEFAULT 78,
      target_weight_kg REAL NOT NULL DEFAULT 72,
      activity_level TEXT NOT NULL DEFAULT 'moderado',
      goal TEXT NOT NULL DEFAULT 'emagrecimento',
      dietary_restrictions TEXT NOT NULL DEFAULT '[]',
      workout_level TEXT NOT NULL DEFAULT 'intermediario',
      home_equipment TEXT NOT NULL DEFAULT '["Peso corporal"]',
      daily_calorie_target INTEGER NOT NULL DEFAULT 2000,
      protein_target_g INTEGER NOT NULL DEFAULT 150,
      carbs_target_g INTEGER NOT NULL DEFAULT 200,
      fat_target_g INTEGER NOT NULL DEFAULT 60,
      water_target_ml INTEGER NOT NULL DEFAULT 2000,
      avatar_url TEXT,
      onboarding_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      calories INTEGER NOT NULL DEFAULT 0,
      protein_g REAL NOT NULL DEFAULT 0,
      carbs_g REAL NOT NULL DEFAULT 0,
      fat_g REAL NOT NULL DEFAULT 0,
      fiber_g REAL DEFAULT 0,
      image_url TEXT,
      items TEXT DEFAULT '[]',
      ai_analyzed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meal_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      goal TEXT NOT NULL,
      total_calories INTEGER NOT NULL,
      total_protein_g INTEGER NOT NULL,
      total_carbs_g INTEGER NOT NULL,
      total_fat_g INTEGER NOT NULL,
      meals TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      level TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      estimated_calories INTEGER NOT NULL,
      equipment TEXT NOT NULL,
      description TEXT NOT NULL,
      warmup TEXT NOT NULL DEFAULT '[]',
      exercises TEXT NOT NULL,
      cooldown TEXT NOT NULL DEFAULT '[]',
      muscle_focus TEXT NOT NULL DEFAULT '[]',
      is_ai_generated INTEGER NOT NULL DEFAULT 0,
      is_custom INTEGER NOT NULL DEFAULT 0,
      video_url TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workout_id TEXT NOT NULL,
      workout_title TEXT NOT NULL,
      date TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      calories_burned INTEGER NOT NULL,
      exercises_completed INTEGER NOT NULL DEFAULT 0,
      skipped_exercises INTEGER NOT NULL DEFAULT 0,
      plan_id TEXT,
      plan_day_number INTEGER,
      perceived_difficulty TEXT,
      warmup_done INTEGER NOT NULL DEFAULT 1,
      cooldown_done INTEGER NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS training_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      duration_days INTEGER NOT NULL,
      level TEXT NOT NULL,
      goal TEXT NOT NULL,
      current_day INTEGER NOT NULL DEFAULT 1,
      completed_days TEXT NOT NULL DEFAULT '[]',
      schedule TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_preferences (
      user_id TEXT PRIMARY KEY,
      favorite_exercise_ids TEXT NOT NULL DEFAULT '[]',
      substituted_exercises TEXT NOT NULL DEFAULT '{}',
      preferred_level TEXT NOT NULL DEFAULT 'intermediario',
      preferred_duration_min INTEGER NOT NULL DEFAULT 25,
      focus_muscles TEXT NOT NULL DEFAULT '["Corpo inteiro"]',
      voice_enabled INTEGER NOT NULL DEFAULT 1,
      sound_enabled INTEGER NOT NULL DEFAULT 1,
      countdown_seconds INTEGER NOT NULL DEFAULT 5,
      rest_seconds INTEGER NOT NULL DEFAULT 20,
      adaptive_multiplier REAL NOT NULL DEFAULT 1.0,
      reminder_enabled INTEGER NOT NULL DEFAULT 0,
      reminder_time TEXT NOT NULL DEFAULT '07:30',
      reminder_days TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
      reminder_frequency TEXT NOT NULL DEFAULT 'dias_selecionados',
      rest_time_reminder TEXT NOT NULL DEFAULT '22:00',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS weight_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      weight_kg REAL NOT NULL,
      waist_cm REAL,
      chest_cm REAL,
      hip_cm REAL,
      arm_cm REAL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS water_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      amount_ml INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, date)
    );

    CREATE TABLE IF NOT EXISTS progress_photos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      weight_kg REAL,
      caption TEXT DEFAULT '',
      image_url TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coach_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Migrações aditivas seguras em bancos SQLite já existentes
  ensureSqliteColumn('workouts', 'warmup', "TEXT NOT NULL DEFAULT '[]'");
  ensureSqliteColumn('workouts', 'cooldown', "TEXT NOT NULL DEFAULT '[]'");
  ensureSqliteColumn('workouts', 'muscle_focus', "TEXT NOT NULL DEFAULT '[]'");
  ensureSqliteColumn('workouts', 'is_custom', 'INTEGER NOT NULL DEFAULT 0');

  ensureSqliteColumn('workout_logs', 'skipped_exercises', 'INTEGER NOT NULL DEFAULT 0');
  ensureSqliteColumn('workout_logs', 'plan_id', 'TEXT');
  ensureSqliteColumn('workout_logs', 'plan_day_number', 'INTEGER');
  ensureSqliteColumn('workout_logs', 'perceived_difficulty', 'TEXT');
  ensureSqliteColumn('workout_logs', 'warmup_done', 'INTEGER NOT NULL DEFAULT 1');
  ensureSqliteColumn('workout_logs', 'cooldown_done', 'INTEGER NOT NULL DEFAULT 1');

  seedCatalogWorkouts();
  seedDemoUser();
}

function seedCatalogWorkouts() {
  const now = new Date().toISOString();
  const upsertStmt = db.prepare(`
    INSERT INTO workouts (
      id, user_id, title, category, level, duration_minutes, estimated_calories,
      equipment, description, warmup, exercises, cooldown, muscle_focus,
      is_ai_generated, is_custom, video_url, created_at
    ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      category = excluded.category,
      level = excluded.level,
      duration_minutes = excluded.duration_minutes,
      estimated_calories = excluded.estimated_calories,
      equipment = excluded.equipment,
      description = excluded.description,
      warmup = excluded.warmup,
      exercises = excluded.exercises,
      cooldown = excluded.cooldown,
      muscle_focus = excluded.muscle_focus
    WHERE user_id IS NULL
  `);

  for (const w of DEFAULT_WORKOUT_CATALOG) {
    upsertStmt.run(
      w.id,
      w.title,
      w.category,
      w.level,
      w.duration_minutes,
      w.estimated_calories,
      JSON.stringify(w.equipment),
      w.description,
      JSON.stringify(w.warmup || []),
      JSON.stringify(w.exercises),
      JSON.stringify(w.cooldown || []),
      JSON.stringify(w.muscle_focus || [w.category]),
      now
    );
  }
}

function seedDemoUser() {
  const demoEmail = 'demo@pratotreino.com.br';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(demoEmail) as { id: string } | undefined;
  if (existing) return;

  const demoId = 'demo-user-prato-treino';
  const now = new Date().toISOString();
  const today = getTodayISO();
  const last7 = getLastNDaysISO(7);
  const hash = bcrypt.hashSync('Demo@123', 10);

  db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
    demoId,
    demoEmail,
    hash,
    now
  );

  db.prepare(`
    INSERT INTO profiles (
      id, email, full_name, age, sex, height_cm, current_weight_kg, target_weight_kg,
      activity_level, goal, dietary_restrictions, workout_level, home_equipment,
      daily_calorie_target, protein_target_g, carbs_target_g, fat_target_g, water_target_ml,
      onboarding_completed, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    demoId,
    demoEmail,
    'Meu Perfil',
    30,
    'masculino',
    177,
    79.4,
    74.0,
    'moderado',
    'emagrecimento',
    JSON.stringify(['Sem açúcar refinado']),
    'intermediario',
    JSON.stringify(['Peso corporal', 'Tapete', 'Halteres leves']),
    2050,
    160,
    205,
    58,
    2000,
    now,
    now
  );

  const weights = [81.2, 80.9, 80.5, 80.3, 79.9, 79.6, 79.4];
  const insertWeight = db.prepare(`
    INSERT INTO weight_logs (id, user_id, date, weight_kg, waist_cm, chest_cm, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  last7.forEach((d, idx) => {
    insertWeight.run(
      v4Fallback(),
      demoId,
      d,
      weights[idx],
      89.5 - idx * 0.3,
      101.0,
      idx === 6 ? 'Pesagem matinal em jejum' : '',
      now
    );
  });

  const insertMeal = db.prepare(`
    INSERT INTO meals (id, user_id, date, category, title, description, calories, protein_g, carbs_g, fat_g, fiber_g, items, ai_analyzed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const dailyTotals = [1980, 2040, 1890, 2110, 1950, 2010];
  for (let i = 0; i < 6; i++) {
    const d = last7[i];
    insertMeal.run(
      v4Fallback(),
      demoId,
      d,
      'almoco',
      'Prato equilibrado do dia',
      'Frango grelhado, arroz integral, feijão e salada',
      Math.round(dailyTotals[i] * 0.45),
      68,
      82,
      21,
      9,
      '[]',
      0,
      now
    );
    insertMeal.run(
      v4Fallback(),
      demoId,
      d,
      'jantar',
      'Omelete proteico com legumes e batata-doce',
      'Jantar leve e rico em proteínas',
      Math.round(dailyTotals[i] * 0.55),
      78,
      95,
      28,
      7,
      '[]',
      0,
      now
    );
  }

  insertMeal.run(
    v4Fallback(),
    demoId,
    today,
    'cafe',
    'Ovos mexidos com pão integral e mamão',
    '3 ovos mexidos, 2 fatias de pão 100% integral, 150g de mamão com chia e café preto',
    435,
    27,
    42,
    17,
    6,
    JSON.stringify([
      { name: 'Ovos mexidos (3 unidades)', portion: '150g', calories: 225, protein_g: 19, carbs_g: 2, fat_g: 15 },
      { name: 'Pão integral', portion: '2 fatias (50g)', calories: 130, protein_g: 6, carbs_g: 24, fat_g: 2 },
      { name: 'Mamão papaia com chia', portion: '150g', calories: 80, protein_g: 2, carbs_g: 16, fat_g: 0 },
    ]),
    1,
    now
  );

  insertMeal.run(
    v4Fallback(),
    demoId,
    today,
    'almoco',
    'Bowl Brasileiro Proteico',
    '160g de peito de frango grelhado, 120g de arroz integral, 90g de feijão preto, 100g de batata-doce e salada verde',
    645,
    56,
    68,
    14,
    11,
    JSON.stringify([
      { name: 'Peito de frango grelhado', portion: '160g', calories: 260, protein_g: 48, carbs_g: 0, fat_g: 6 },
      { name: 'Arroz integral', portion: '120g', calories: 150, protein_g: 3, carbs_g: 31, fat_g: 1 },
      { name: 'Feijão preto cozido', portion: '90g', calories: 115, protein_g: 5, carbs_g: 20, fat_g: 1 },
      { name: 'Batata-doce assada e salada', portion: '180g', calories: 120, protein_g: 2, carbs_g: 17, fat_g: 6 },
    ]),
    1,
    now
  );

  db.prepare('INSERT INTO water_logs (id, user_id, date, amount_ml, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    v4Fallback(),
    demoId,
    today,
    1750,
    now
  );

  const insertWorkoutLog = db.prepare(`
    INSERT INTO workout_logs (id, user_id, workout_id, workout_title, date, duration_minutes, calories_burned, exercises_completed, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertWorkoutLog.run(v4Fallback(), demoId, 'wkt-emagrecimento-hiit-20', 'HIIT Queima Rápida em Casa', last7[1], 18, 225, 5, 'Ritmo intenso', now);
  insertWorkoutLog.run(v4Fallback(), demoId, 'wkt-corpo-iniciante', 'Corpo Inteiro Fundamental', last7[3], 25, 220, 6, 'Boa evolução nas flexões', now);
  insertWorkoutLog.run(v4Fallback(), demoId, 'wkt-gluteos-modelador', 'Glúteos Firmes & Levantados', last7[5], 20, 175, 4, 'Treino completo', now);

  db.prepare('INSERT INTO coach_messages (id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(
    v4Fallback(),
    demoId,
    'assistant',
    'Olá! Seu plano pessoal está configurado para 2.050 kcal/dia com 160 g de proteína. Como posso ajudar no seu treino ou alimentação hoje?',
    now
  );
}

export default db;
