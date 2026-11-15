-- PRATO & TREINO: Migração aditiva 002 — Módulo completo de Treinamento em Casa
-- Preserva integralmente todas as tabelas e dados existentes (profiles, meals, meal_plans,
-- workouts, workout_logs, weight_logs, water_logs, progress_photos, coach_messages).

-- 1. Colunas adicionais opcionais em public.workouts (aquecimento, alongamento, foco e treinos customizados)
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS warmup JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cooldown JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS muscle_focus JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT FALSE;

-- Política de atualização para treinos criados pelo usuário
DROP POLICY IF EXISTS "Users update own workouts" ON public.workouts;
CREATE POLICY "Users update own workouts" ON public.workouts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Colunas adicionais opcionais em public.workout_logs (vínculo com plano de dias e métricas da sessão)
ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS plan_id UUID,
  ADD COLUMN IF NOT EXISTS plan_day_number INTEGER,
  ADD COLUMN IF NOT EXISTS skipped_exercises INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS perceived_difficulty TEXT CHECK (perceived_difficulty IN ('facil', 'ideal', 'intenso')),
  ADD COLUMN IF NOT EXISTS warmup_done BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS cooldown_done BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. Planos de Treinamento (7, 14, 30 e 60 dias)
CREATE TABLE IF NOT EXISTS public.training_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  duration_days INTEGER NOT NULL CHECK (duration_days IN (7, 14, 30, 60)),
  level TEXT NOT NULL CHECK (level IN ('iniciante', 'intermediario', 'avancado')),
  goal TEXT NOT NULL DEFAULT 'emagrecimento',
  current_day INTEGER NOT NULL DEFAULT 1,
  completed_days JSONB NOT NULL DEFAULT '[]'::jsonb,
  schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_plans_user ON public.training_plans(user_id, active DESC, started_at DESC);

DROP TRIGGER IF EXISTS on_training_plans_updated ON public.training_plans;
CREATE TRIGGER on_training_plans_updated
  BEFORE UPDATE ON public.training_plans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own training plans" ON public.training_plans;
CREATE POLICY "Users manage own training plans" ON public.training_plans
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Preferências, Favoritos, Substituições e Lembretes de Treino
CREATE TABLE IF NOT EXISTS public.workout_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  favorite_exercise_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  substituted_exercises JSONB NOT NULL DEFAULT '{}'::jsonb,
  preferred_level TEXT NOT NULL DEFAULT 'intermediario' CHECK (preferred_level IN ('iniciante', 'intermediario', 'avancado')),
  preferred_duration_min INTEGER NOT NULL DEFAULT 25,
  focus_muscles JSONB NOT NULL DEFAULT '["Corpo inteiro"]'::jsonb,
  voice_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  countdown_seconds INTEGER NOT NULL DEFAULT 5,
  rest_seconds INTEGER NOT NULL DEFAULT 20,
  adaptive_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_time TEXT NOT NULL DEFAULT '07:30',
  reminder_days JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  reminder_frequency TEXT NOT NULL DEFAULT 'dias_selecionados' CHECK (reminder_frequency IN ('diario', 'dias_selecionados', 'alternado')),
  rest_time_reminder TEXT NOT NULL DEFAULT '22:00',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS on_workout_preferences_updated ON public.workout_preferences;
CREATE TRIGGER on_workout_preferences_updated
  BEFORE UPDATE ON public.workout_preferences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.workout_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own workout preferences" ON public.workout_preferences;
CREATE POLICY "Users manage own workout preferences" ON public.workout_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
