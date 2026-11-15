import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initSqliteDatabase } from './src/database/sqlite';
import {
  getSupabaseAdmin,
  getSupabaseAnon,
  getSupabaseClientForToken,
  hasSupabaseServiceRole,
  isSupabaseConfigured,
  runWithSupabaseToken,
} from './src/database/supabaseClient';
import * as repo from './src/database/repository';
import {
  analyzeMealWithAI,
  chatWithCoachAI,
  generateExerciseTutorialSpecWithAI,
  generateMealPlanWithAI,
  generateWorkoutWithAI,
  isGeminiConfigured,
} from './src/api/geminiService';
import { buildLocalTutorialSpec } from './src/utils/exerciseTutorials';
import { getTodayISO } from './src/utils/nutrition';

initSqliteDatabase();

const app = express();
const PORT = 3000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

function getLocalSessionKey(): string {
  const keyFile = path.resolve(process.cwd(), 'data', '.session_key');
  if (fs.existsSync(keyFile)) {
    return fs.readFileSync(keyFile, 'utf8').trim();
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  fs.writeFileSync(keyFile, generated, 'utf8');
  return generated;
}

const LOCAL_SESSION_KEY = getLocalSessionKey();

function signLocalToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ userId })).toString('base64url');
  const sig = crypto.createHmac('sha256', LOCAL_SESSION_KEY).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyLocalToken(token: string): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', LOCAL_SESSION_KEY).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { userId?: string };
  return parsed.userId || null;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = new Set([
    'https://localhost',
    'http://localhost',
    'http://localhost:3000',
    'capacitor://localhost',
    'ionic://localhost',
  ]);
  if (origin && (allowedOrigins.has(origin) || /^https?:\/\/localhost(:\d+)?$/i.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

interface AuthenticatedRequest extends Request {
  userId?: string;
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Sessão não autenticada. Faça login para continuar.' });
      return;
    }

    const token = authHeader.slice(7);
    if (isSupabaseConfigured()) {
      const sbClient = getSupabaseClientForToken(token) || getSupabaseAdmin() || getSupabaseAnon();
      if (sbClient) {
        const { data, error } = await sbClient.auth.getUser(token);
        if (!error && data.user) {
          req.userId = data.user.id;
          runWithSupabaseToken(token, () => next());
          return;
        }
      }
      res.status(401).json({ error: 'Sessão Supabase inválida ou expirada.' });
      return;
    }

    const localUserId = verifyLocalToken(token);
    if (!localUserId) {
      res.status(401).json({ error: 'Sessão local inválida.' });
      return;
    }
    req.userId = localUserId;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

// --- CONFIG & HEALTH ---
app.get('/api/health', async (_req, res) => {
  let trainingMigrationPending = false;
  try {
    trainingMigrationPending = await repo.checkTrainingMigrationPending();
  } catch {
    trainingMigrationPending = false;
  }
  res.json({
    ok: true,
    storageBackend: isSupabaseConfigured() ? 'supabase' : 'sqlite',
    supabaseConfigured: isSupabaseConfigured(),
    supabaseServiceRole: hasSupabaseServiceRole(),
    geminiConfigured: isGeminiConfigured(),
    trainingMigrationPending,
  });
});

// --- AUTH ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, full_name } = req.body as {
      email?: string;
      password?: string;
      full_name?: string;
    };

    if (!email || !password || !full_name) {
      res.status(400).json({ error: 'Preencha nome completo, e-mail e senha.' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const sbAdmin = getSupabaseAdmin();
    const sbAnon = getSupabaseAnon();

    if (sbAdmin) {
      const { data, error } = await sbAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name.trim() },
      });
      if (error || !data.user) {
        res.status(400).json({ error: error?.message || 'Erro ao criar conta no Supabase.' });
        return;
      }

      const profile = await repo.ensureSupabaseProfile({
        id: data.user.id,
        email: data.user.email || normalizedEmail,
        full_name: full_name.trim(),
      });

      const authClient = sbAnon || sbAdmin;
      let accessToken: string | null = null;
      let refreshToken: string | null = null;

      const { data: signInData } = await authClient.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (signInData?.session) {
        accessToken = signInData.session.access_token;
        refreshToken = signInData.session.refresh_token;
      } else {
        const { data: linkData } = await sbAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: normalizedEmail,
        });
        if (linkData?.properties?.hashed_token) {
          const { data: otpData } = await authClient.auth.verifyOtp({
            token_hash: linkData.properties.hashed_token,
            type: 'magiclink',
          });
          accessToken = otpData?.session?.access_token || null;
          refreshToken = otpData?.session?.refresh_token || null;
        }
      }

      if (!accessToken) {
        res.status(500).json({ error: 'Não foi possível iniciar sessão no Supabase.' });
        return;
      }

      res.json({
        token: accessToken,
        refreshToken,
        profile,
      });
      return;
    }

    if (sbAnon) {
      const { data, error } = await sbAnon.auth.signUp({
        email: normalizedEmail,
        password,
        options: { data: { full_name: full_name.trim() } },
      });
      if (error || !data.user) {
        res.status(400).json({ error: error?.message || 'Erro ao cadastrar usuário no Supabase.' });
        return;
      }
      if (!data.session) {
        res.status(400).json({
          error:
            'Conta criada. Confirme seu e-mail de verificação no Supabase ou use acesso sem senha.',
        });
        return;
      }

      const profile = await runWithSupabaseToken(data.session.access_token, () =>
        repo.ensureSupabaseProfile({
          id: data.user!.id,
          email: data.user!.email || normalizedEmail,
          full_name: full_name.trim(),
        })
      );

      res.json({
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        profile,
      });
      return;
    }

    const profile = await repo.createLocalUserAndProfile({ email, password, full_name });
    const token = signLocalToken(profile.id);
    res.json({ token, profile });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao registrar usuário.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'Informe e-mail e senha.' });
      return;
    }

    const sbAuth = getSupabaseAnon() || getSupabaseAdmin();
    if (sbAuth) {
      const { data, error } = await sbAuth.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error || !data.user || !data.session) {
        res.status(401).json({ error: 'E-mail ou senha inválidos.' });
        return;
      }

      const profile = await runWithSupabaseToken(data.session.access_token, () =>
        repo.ensureSupabaseProfile({
          id: data.user!.id,
          email: data.user!.email || email,
          full_name: (data.user!.user_metadata?.full_name as string) || 'Meu Perfil',
        })
      );

      res.json({
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        profile,
      });
      return;
    }

    const profile = await repo.verifyLocalUserCredentials(email, password);
    const token = signLocalToken(profile.id);
    res.json({ token, profile });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Falha na autenticação.' });
  }
});

app.post('/api/auth/otp-send', async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email || !email.trim()) {
      res.status(400).json({ error: 'Informe seu e-mail para receber o código de acesso.' });
      return;
    }
    const sbAuth = getSupabaseAnon() || getSupabaseAdmin();
    if (!sbAuth) {
      res.status(400).json({ error: 'Supabase não configurado.' });
      return;
    }
    const { error } = await sbAuth.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ ok: true, message: 'Código enviado para o seu e-mail.' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao enviar código.' });
  }
});

app.post('/api/auth/otp-verify', async (req, res) => {
  try {
    const { email, code } = req.body as { email?: string; code?: string };
    if (!email || !code) {
      res.status(400).json({ error: 'Informe o e-mail e o código recebido.' });
      return;
    }
    const sbAuth = getSupabaseAnon() || getSupabaseAdmin();
    if (!sbAuth) {
      res.status(400).json({ error: 'Supabase não configurado.' });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await sbAuth.auth.verifyOtp({
      email: normalizedEmail,
      token: code.trim(),
      type: 'email',
    });
    if (error || !data.session || !data.user) {
      res.status(401).json({ error: error?.message || 'Código inválido ou expirado.' });
      return;
    }

    const profile = await runWithSupabaseToken(data.session.access_token, () =>
      repo.ensureSupabaseProfile({
        id: data.user!.id,
        email: data.user!.email || normalizedEmail,
        full_name: (data.user!.user_metadata?.full_name as string) || normalizedEmail.split('@')[0],
      })
    );

    res.json({
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      profile,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Falha ao verificar código.' });
  }
});

async function issuePersonalSupabaseSession() {
  const sbAdmin = getSupabaseAdmin();
  const sbAuth = getSupabaseAnon() || sbAdmin;
  if (!sbAdmin || !sbAuth) {
    throw new Error(
      'Acesso automático sem senha requer SUPABASE_SERVICE_ROLE_KEY no servidor, ou use o código enviado por e-mail.'
    );
  }

  const defaultEmail = (process.env.PERSONAL_OWNER_EMAIL || 'thiagojacoby0@gmail.com').trim().toLowerCase();
  const { data: listData, error: listErr } = await sbAdmin.auth.admin.listUsers({ page: 1, perPage: 20 });
  if (listErr) {
    throw new Error(listErr.message);
  }

  const existing =
    listData?.users?.find((u) => u.email?.toLowerCase() === defaultEmail) || listData?.users?.[0];

  let ownerEmail = existing?.email || defaultEmail;
  if (!existing) {
    const { data: created, error: createErr } = await sbAdmin.auth.admin.createUser({
      email: defaultEmail,
      email_confirm: true,
      user_metadata: { full_name: 'Thiago' },
    });
    if (createErr || !created.user) {
      throw new Error(createErr?.message || 'Erro ao criar conta pessoal no Supabase.');
    }
    ownerEmail = created.user.email || defaultEmail;
  }

  const { data: linkData, error: linkErr } = await sbAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: ownerEmail,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    throw new Error(linkErr?.message || 'Não foi possível gerar sessão automática.');
  }

  const { data: sessionData, error: otpErr } = await sbAuth.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (otpErr || !sessionData.session || !sessionData.user) {
    throw new Error(otpErr?.message || 'Erro ao iniciar sessão pessoal no Supabase.');
  }

  const profile = await runWithSupabaseToken(sessionData.session.access_token, () =>
    repo.ensureSupabaseProfile({
      id: sessionData.user!.id,
      email: sessionData.user!.email || ownerEmail,
      full_name: (sessionData.user!.user_metadata?.full_name as string) || 'Thiago',
    })
  );

  return {
    token: sessionData.session.access_token,
    refreshToken: sessionData.session.refresh_token,
    profile,
  };
}

app.post('/api/auth/personal', async (_req, res) => {
  try {
    if (isSupabaseConfigured()) {
      const sbAdmin = getSupabaseAdmin();
      const sbAuth = getSupabaseAnon() || sbAdmin;
      if (!sbAdmin || !sbAuth) {
        res.status(400).json({
          error:
            'Acesso automático sem senha requer SUPABASE_SERVICE_ROLE_KEY no servidor, ou use o código enviado por e-mail.',
        });
        return;
      }

      const result = await issuePersonalSupabaseSession();
      res.json(result);
      return;
    }

    const profile = await repo.verifyLocalUserCredentials('demo@pratotreino.com.br', 'Demo@123');
    const token = signLocalToken(profile.id);
    res.json({ token, refreshToken: null, profile });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao acessar perfil pessoal.' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken, allowPersonalFallback } = (req.body || {}) as {
      refreshToken?: string;
      allowPersonalFallback?: boolean;
    };

    if (isSupabaseConfigured()) {
      const sbAuth = getSupabaseAnon() || getSupabaseAdmin();
      if (sbAuth && refreshToken) {
        const { data, error } = await sbAuth.auth.refreshSession({ refresh_token: refreshToken });
        if (!error && data.session && data.user) {
          const profile = await runWithSupabaseToken(data.session.access_token, () =>
            repo.ensureSupabaseProfile({
              id: data.user!.id,
              email: data.user!.email || '',
              full_name: (data.user!.user_metadata?.full_name as string) || 'Meu Perfil',
            })
          );
          res.json({
            token: data.session.access_token,
            refreshToken: data.session.refresh_token,
            profile,
          });
          return;
        }
      }

      if (allowPersonalFallback !== false && hasSupabaseServiceRole()) {
        const result = await issuePersonalSupabaseSession();
        res.json(result);
        return;
      }

      res.status(401).json({ error: 'Sessão Supabase expirada. Faça login novamente.' });
      return;
    }

    const profile = await repo.verifyLocalUserCredentials('demo@pratotreino.com.br', 'Demo@123');
    const token = signLocalToken(profile.id);
    res.json({ token, refreshToken: null, profile });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Não foi possível renovar a sessão.' });
  }
});

app.post('/api/auth/demo', async (_req, res) => {
  try {
    if (isSupabaseConfigured()) {
      res.status(400).json({ error: 'Use seu cadastro ou login quando conectado ao Supabase.' });
      return;
    }
    const profile = await repo.verifyLocalUserCredentials('demo@pratotreino.com.br', 'Demo@123');
    const token = signLocalToken(profile.id);
    res.json({ token, profile });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao acessar conta demo.' });
  }
});

app.get('/api/auth/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  const profile = await repo.getProfileById(req.userId!);
  if (!profile) {
    res.status(404).json({ error: 'Perfil não encontrado.' });
    return;
  }
  res.json({ profile });
});

// --- PROFILE ---
app.put('/api/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const updated = await repo.updateProfile(req.userId!, req.body);
    res.json({ profile: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao atualizar perfil.' });
  }
});

// --- DASHBOARD ---
app.get('/api/dashboard', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : getTodayISO();
    const summary = await repo.getDashboardSummary(req.userId!, date);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao carregar dashboard.' });
  }
});

// --- MEALS & MEAL PLANS ---
app.get('/api/meals', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const meals = await repo.listMeals(req.userId!, date);
    res.json({ meals });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao listar refeições.' });
  }
});

app.post('/api/meals', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const meal = await repo.addMeal(req.userId!, req.body);
    res.json({ meal });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao registrar refeição.' });
  }
});

app.delete('/api/meals/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await repo.deleteMeal(req.userId!, String(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao excluir refeição.' });
  }
});

app.get('/api/meal-plans', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const plans = await repo.listMealPlans(req.userId!);
    res.json({ plans });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao carregar cardápios.' });
  }
});

// --- WORKOUTS & TRAINING MODULE ---
app.get('/api/workouts', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workouts = await repo.listWorkouts(req.userId!);
    const logs = await repo.listWorkoutLogs(req.userId!);
    res.json({ workouts, logs });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao carregar treinos.' });
  }
});

app.get('/api/training/hub', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const profile = await repo.getProfileById(req.userId!);
    const [workouts, logs, preferences, trainingPlan, trainingMigrationPending] = await Promise.all([
      repo.listWorkouts(req.userId!),
      repo.listWorkoutLogs(req.userId!),
      repo.getWorkoutPreferences(req.userId!, profile?.workout_level || 'intermediario'),
      repo.getActiveTrainingPlan(req.userId!, {
        workout_level: profile?.workout_level || 'intermediario',
        goal: profile?.goal || 'emagrecimento',
      }),
      repo.checkTrainingMigrationPending(),
    ]);
    const stats = repo.computeWorkoutEvolutionStats(logs);
    res.json({
      workouts,
      logs,
      preferences,
      trainingPlan,
      stats,
      trainingMigrationPending,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao carregar central de treino.' });
  }
});

app.post('/api/training/plans', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const profile = await repo.getProfileById(req.userId!);
    const { duration_days, level, goal } = req.body as {
      duration_days?: number;
      level?: 'iniciante' | 'intermediario' | 'avancado';
      goal?: string;
    };
    const validDays = ([7, 14, 30, 60].includes(Number(duration_days))
      ? Number(duration_days)
      : 30) as 7 | 14 | 30 | 60;
    const plan = await repo.createTrainingPlan(req.userId!, {
      duration_days: validDays,
      level: level || profile?.workout_level || 'intermediario',
      goal: goal || profile?.goal || 'emagrecimento',
    });
    res.json({ trainingPlan: plan });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao criar plano de treino.' });
  }
});

app.post('/api/training/plans/:id/complete-day', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { day_number } = req.body as { day_number: number };
    const plan = await repo.completeTrainingPlanDay(req.userId!, String(req.params.id), Number(day_number));
    res.json({ trainingPlan: plan });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao concluir dia do plano.' });
  }
});

app.get('/api/training/preferences', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const preferences = await repo.getWorkoutPreferences(req.userId!);
    res.json({ preferences });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao carregar preferências.' });
  }
});

app.put('/api/training/preferences', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const preferences = await repo.updateWorkoutPreferences(req.userId!, req.body);
    res.json({ preferences });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao salvar preferências.' });
  }
});

app.post('/api/workouts/custom', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const payload = req.body;
    if (!payload?.title || !Array.isArray(payload.exercises) || payload.exercises.length === 0) {
      res.status(400).json({ error: 'Informe um título e pelo menos 1 exercício.' });
      return;
    }
    const workout = await repo.saveWorkout(req.userId!, {
      title: String(payload.title).trim(),
      category: payload.category || 'Corpo inteiro',
      level: payload.level || 'intermediario',
      duration_minutes: Number(payload.duration_minutes || 20),
      estimated_calories: Number(payload.estimated_calories || 180),
      equipment: Array.isArray(payload.equipment) ? payload.equipment : ['Peso corporal'],
      description: String(payload.description || 'Treino personalizado criado no PRATO & TREINO.'),
      warmup: Array.isArray(payload.warmup) ? payload.warmup : undefined,
      exercises: payload.exercises,
      cooldown: Array.isArray(payload.cooldown) ? payload.cooldown : undefined,
      muscle_focus: Array.isArray(payload.muscle_focus) ? payload.muscle_focus : [payload.category || 'Corpo inteiro'],
      is_ai_generated: false,
      is_custom: true,
      video_url: null,
    });
    res.json({ workout });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao criar treino personalizado.' });
  }
});

app.delete('/api/workouts/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await repo.deleteWorkout(req.userId!, String(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao excluir treino.' });
  }
});

app.post('/api/workout-logs', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const log = await repo.addWorkoutLog(req.userId!, req.body);
    let trainingPlan = null;
    if (req.body.plan_id && req.body.plan_day_number) {
      trainingPlan = await repo.completeTrainingPlanDay(
        req.userId!,
        String(req.body.plan_id),
        Number(req.body.plan_day_number)
      );
    }
    let preferences = null;
    if (req.body.perceived_difficulty) {
      preferences = await repo.applyWorkoutAdaptation(req.userId!, req.body.perceived_difficulty);
    }
    res.json({ log, trainingPlan, preferences });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao registrar treino.' });
  }
});

// --- WEIGHT & BODY MEASUREMENTS ---
app.get('/api/weight', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const logs = await repo.listWeightLogs(req.userId!);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao listar registros de peso.' });
  }
});

app.post('/api/weight', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const log = await repo.addWeightLog(req.userId!, req.body);
    const profile = await repo.getProfileById(req.userId!);
    res.json({ log, profile });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao salvar peso.' });
  }
});

app.delete('/api/weight/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await repo.deleteWeightLog(req.userId!, String(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao remover registro.' });
  }
});

// --- WATER ---
app.get('/api/water', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : getTodayISO();
    const water = await repo.getWaterLog(req.userId!, date);
    res.json({ water });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao carregar hidratação.' });
  }
});

app.post('/api/water', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { date, delta_ml } = req.body as { date?: string; delta_ml: number };
    const water = await repo.incrementWaterLog(req.userId!, date || getTodayISO(), Number(delta_ml || 0));
    res.json({ water });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao atualizar hidratação.' });
  }
});

// --- PROGRESS PHOTOS & STORAGE ---
app.post('/api/storage/upload', requireAuth, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      return;
    }
    const folder = (req.body.folder as 'meals' | 'progress' | 'avatars') || 'progress';
    const url = await repo.uploadImageAsset({
      userId: req.userId!,
      folder,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
    });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro no upload.' });
  }
});

app.get('/api/progress-photos', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const photos = await repo.listProgressPhotos(req.userId!);
    res.json({ photos });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao listar fotos.' });
  }
});

app.post('/api/progress-photos', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const photo = await repo.addProgressPhoto(req.userId!, req.body);
    res.json({ photo });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao salvar foto.' });
  }
});

app.delete('/api/progress-photos/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await repo.deleteProgressPhoto(req.userId!, String(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao excluir foto.' });
  }
});

// --- AI FEATURES (GEMINI) ---
app.post('/api/ai/analyze-meal', requireAuth, upload.single('image'), async (req: AuthenticatedRequest, res) => {
  try {
    const description = typeof req.body.description === 'string' ? req.body.description : '';
    let imageBase64: string | undefined;
    let mimeType: string | undefined;
    let uploadedUrl: string | null = null;

    if (req.file) {
      imageBase64 = req.file.buffer.toString('base64');
      mimeType = req.file.mimetype;
      uploadedUrl = await repo.uploadImageAsset({
        userId: req.userId!,
        folder: 'meals',
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
      });
    } else if (typeof req.body.imageBase64 === 'string' && req.body.imageBase64.length > 0) {
      imageBase64 = req.body.imageBase64;
      mimeType = req.body.mimeType || 'image/jpeg';
    }

    if (!description && !imageBase64) {
      res.status(400).json({ error: 'Descreva o prato ou envie uma foto da refeição.' });
      return;
    }

    const analysis = await analyzeMealWithAI({ description, imageBase64, mimeType });
    res.json({ analysis, image_url: uploadedUrl });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Falha ao analisar refeição com inteligência artificial.',
    });
  }
});

app.post('/api/ai/meal-plan', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const profile = await repo.getProfileById(req.userId!);
    if (!profile) {
      res.status(404).json({ error: 'Perfil não encontrado.' });
      return;
    }
    const { preferences } = req.body as { preferences?: string };
    const generated = await generateMealPlanWithAI({ profile, preferences });
    const saved = await repo.saveMealPlan(req.userId!, {
      title: generated.title,
      goal: profile.goal,
      total_calories: generated.total_calories,
      total_protein_g: generated.total_protein_g,
      total_carbs_g: generated.total_carbs_g,
      total_fat_g: generated.total_fat_g,
      meals: generated.meals,
      notes: generated.notes,
    });
    res.json({ plan: saved });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao gerar cardápio personalizado.',
    });
  }
});

app.post('/api/ai/workout', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const profile = await repo.getProfileById(req.userId!);
    if (!profile) {
      res.status(404).json({ error: 'Perfil não encontrado.' });
      return;
    }
    const { focus, duration_minutes, equipment } = req.body as {
      focus?: string;
      duration_minutes?: number;
      equipment?: string[];
    };

    const generated = await generateWorkoutWithAI({
      profile,
      focus: focus || 'Corpo inteiro equilibrado',
      durationMinutes: Number(duration_minutes || 25),
      equipment: equipment && equipment.length ? equipment : profile.home_equipment,
    });

    const saved = await repo.saveWorkout(req.userId!, {
      title: generated.title,
      category: generated.category,
      level: generated.level || profile.workout_level,
      duration_minutes: generated.duration_minutes,
      estimated_calories: generated.estimated_calories,
      equipment: equipment && equipment.length ? equipment : profile.home_equipment,
      description: generated.description,
      warmup: generated.warmup,
      exercises: generated.exercises,
      cooldown: generated.cooldown,
      muscle_focus: generated.muscle_focus || [generated.category],
      is_ai_generated: true,
      is_custom: true,
      video_url: null,
    });
    res.json({ workout: saved });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao gerar treino personalizado.',
    });
  }
});

app.get('/api/ai/coach', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const messages = await repo.listCoachMessages(req.userId!);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao carregar histórico.' });
  }
});

app.post('/api/ai/coach', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { message } = req.body as { message?: string };
    if (!message || !message.trim()) {
      res.status(400).json({ error: 'Digite sua pergunta para o Personal Trainer IA.' });
      return;
    }

    const profile = await repo.getProfileById(req.userId!);
    if (!profile) {
      res.status(404).json({ error: 'Perfil não encontrado.' });
      return;
    }

    const history = await repo.listCoachMessages(req.userId!);
    const summary = await repo.getDashboardSummary(req.userId!, getTodayISO());

    const userMsg = await repo.addCoachMessage(req.userId!, 'user', message.trim());
    const replyText = await chatWithCoachAI({
      profile,
      todayStats: {
        caloriesConsumed: summary.calories_consumed,
        proteinG: summary.protein_g,
        carbsG: summary.carbs_g,
        fatG: summary.fat_g,
        waterMl: summary.water_ml,
        workoutsToday: summary.workouts_today,
      },
      history,
      userMessage: message.trim(),
    });

    const assistantMsg = await repo.addCoachMessage(req.userId!, 'assistant', replyText);
    res.json({ userMessage: userMsg, assistantMessage: assistantMsg });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao consultar o Personal Trainer IA.',
    });
  }
});

app.delete('/api/ai/coach', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await repo.clearCoachMessages(req.userId!);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao limpar conversa.' });
  }
});

app.post('/api/ai/exercise-tutorial', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { exercise_name, muscle_group, instructions } = req.body as {
      exercise_name?: string;
      muscle_group?: string;
      instructions?: string;
    };
    if (!exercise_name || !exercise_name.trim()) {
      res.status(400).json({ error: 'Nome do exercício não informado.' });
      return;
    }

    const name = exercise_name.trim();
    const muscle = (muscle_group || 'Corpo inteiro').trim();
    const instr = (instructions || '').trim();

    if (!isGeminiConfigured()) {
      res.json({ spec: buildLocalTutorialSpec(name, muscle, instr), source: 'local' });
      return;
    }

    try {
      const spec = await generateExerciseTutorialSpecWithAI(name, muscle, instr);
      res.json({ spec, source: 'gemini' });
    } catch {
      res.json({ spec: buildLocalTutorialSpec(name, muscle, instr), source: 'local' });
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao montar tutorial.' });
  }
});

async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: { server: httpServer } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`PRATO & TREINO server running at http://localhost:${PORT}`);
  });
}

startServer();
