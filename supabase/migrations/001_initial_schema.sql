-- PRATO & TREINO: Schema PostgreSQL completo para Supabase
-- Inclui tabelas, relacionamentos, triggers automáticos, Row Level Security (RLS),
-- seed inicial de treinos em casa e políticas de Storage.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Função auxiliar para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Perfis de Usuários
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  age INTEGER NOT NULL DEFAULT 28,
  sex TEXT NOT NULL DEFAULT 'masculino' CHECK (sex IN ('masculino', 'feminino')),
  height_cm NUMERIC(5,1) NOT NULL DEFAULT 175,
  current_weight_kg NUMERIC(5,2) NOT NULL DEFAULT 78,
  target_weight_kg NUMERIC(5,2) NOT NULL DEFAULT 72,
  activity_level TEXT NOT NULL DEFAULT 'moderado',
  goal TEXT NOT NULL DEFAULT 'emagrecimento',
  dietary_restrictions JSONB NOT NULL DEFAULT '[]'::jsonb,
  workout_level TEXT NOT NULL DEFAULT 'intermediario',
  home_equipment JSONB NOT NULL DEFAULT '["Peso corporal"]'::jsonb,
  daily_calorie_target INTEGER NOT NULL DEFAULT 2000,
  protein_target_g INTEGER NOT NULL DEFAULT 150,
  carbs_target_g INTEGER NOT NULL DEFAULT 200,
  fat_target_g INTEGER NOT NULL DEFAULT 60,
  water_target_ml INTEGER NOT NULL DEFAULT 2700,
  avatar_url TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS on_profiles_updated ON public.profiles;
CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger automático: cria o perfil na tabela public.profiles ao cadastrar usuário no Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email, 'usuario'), '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 2. Diário Alimentar / Refeições
CREATE TABLE IF NOT EXISTS public.meals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL CHECK (category IN ('cafe', 'almoco', 'lanche', 'jantar', 'ceia')),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  calories INTEGER NOT NULL DEFAULT 0,
  protein_g NUMERIC(6,1) NOT NULL DEFAULT 0,
  carbs_g NUMERIC(6,1) NOT NULL DEFAULT 0,
  fat_g NUMERIC(6,1) NOT NULL DEFAULT 0,
  fiber_g NUMERIC(6,1) DEFAULT 0,
  image_url TEXT,
  items JSONB DEFAULT '[]'::jsonb,
  ai_analyzed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meals_user_date ON public.meals(user_id, date DESC);

-- 3. Cardápios Gerados com IA
CREATE TABLE IF NOT EXISTS public.meal_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  total_calories INTEGER NOT NULL,
  total_protein_g INTEGER NOT NULL,
  total_carbs_g INTEGER NOT NULL,
  total_fat_g INTEGER NOT NULL,
  meals JSONB NOT NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Treinos (Catálogo Global user_id IS NULL + Treinos Personalizados IA)
CREATE TABLE IF NOT EXISTS public.workouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('iniciante', 'intermediario', 'avancado')),
  duration_minutes INTEGER NOT NULL,
  estimated_calories INTEGER NOT NULL,
  equipment JSONB NOT NULL DEFAULT '[]'::jsonb,
  description TEXT NOT NULL,
  exercises JSONB NOT NULL,
  is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  video_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Histórico de Treinos Concluídos
CREATE TABLE IF NOT EXISTS public.workout_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workout_id TEXT NOT NULL,
  workout_title TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  duration_minutes INTEGER NOT NULL,
  calories_burned INTEGER NOT NULL,
  exercises_completed INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date ON public.workout_logs(user_id, date DESC);

-- 6. Registros de Peso e Medidas Corporais
CREATE TABLE IF NOT EXISTS public.weight_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg NUMERIC(5,2) NOT NULL,
  waist_cm NUMERIC(5,1),
  chest_cm NUMERIC(5,1),
  hip_cm NUMERIC(5,1),
  arm_cm NUMERIC(5,1),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date ON public.weight_logs(user_id, date DESC);

-- 7. Hidratação Diária
CREATE TABLE IF NOT EXISTS public.water_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_ml INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- 8. Fotos de Evolução
CREATE TABLE IF NOT EXISTS public.progress_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg NUMERIC(5,2),
  caption TEXT DEFAULT '',
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Histórico do Personal Trainer & Nutricionista IA
CREATE TABLE IF NOT EXISTS public.coach_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coach_messages_user ON public.coach_messages(user_id, created_at ASC);

-- Ativar Row Level Security (RLS) em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;

-- Políticas de Segurança RLS
DROP POLICY IF EXISTS "Users manage own profile" ON public.profiles;
CREATE POLICY "Users manage own profile" ON public.profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users manage own meals" ON public.meals;
CREATE POLICY "Users manage own meals" ON public.meals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own meal plans" ON public.meal_plans;
CREATE POLICY "Users manage own meal plans" ON public.meal_plans
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view catalog or own workouts" ON public.workouts;
CREATE POLICY "Users view catalog or own workouts" ON public.workouts
  FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own workouts" ON public.workouts;
CREATE POLICY "Users manage own workouts" ON public.workouts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own workouts" ON public.workouts;
CREATE POLICY "Users delete own workouts" ON public.workouts
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own workout logs" ON public.workout_logs;
CREATE POLICY "Users manage own workout logs" ON public.workout_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own weight logs" ON public.weight_logs;
CREATE POLICY "Users manage own weight logs" ON public.weight_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own water logs" ON public.water_logs;
CREATE POLICY "Users manage own water logs" ON public.water_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own progress photos" ON public.progress_photos;
CREATE POLICY "Users manage own progress photos" ON public.progress_photos
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own coach messages" ON public.coach_messages;
CREATE POLICY "Users manage own coach messages" ON public.coach_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Bucket privado/público controlado no Supabase Storage para fotos de refeições e evolução
INSERT INTO storage.buckets (id, name, public)
VALUES ('prato-treino-media', 'prato-treino-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users upload own media folder" ON storage.objects;
CREATE POLICY "Users upload own media folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'prato-treino-media'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

DROP POLICY IF EXISTS "Users delete own media folder" ON storage.objects;
CREATE POLICY "Users delete own media folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'prato-treino-media'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

DROP POLICY IF EXISTS "Public can view prato-treino media" ON storage.objects;
CREATE POLICY "Public can view prato-treino media" ON storage.objects
  FOR SELECT USING (bucket_id = 'prato-treino-media');
