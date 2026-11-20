import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { AppLayout, AppRoute } from './components/AppLayout';
import { AuthPage } from './pages/AuthPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { DashboardPage } from './pages/DashboardPage';
import { NutritionPage } from './pages/NutritionPage';
import { WorkoutsPage } from './pages/WorkoutsPage';
import { CoachPage } from './pages/CoachPage';
import { ProgressPage } from './pages/ProgressPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';

const PAGE_TITLES: Record<AppRoute, string> = {
  dashboard: 'Visão Geral',
  nutrition: 'Alimentação & Diário IA',
  workouts: 'Treinos em Casa',
  coach: 'Personal Trainer IA',
  progress: 'Evolução & Medidas',
  profile: 'Meu Perfil',
  settings: 'Configurações',
};

function AppContent() {
  const { profile, loading } = useAuth();
  const [route, setRoute] = useState<AppRoute>('dashboard');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#EBF8F2] to-[#FAFDFC] text-[#0F2A2A] dark:from-[#051011] dark:to-[#0A1E20] dark:text-[#F2FAFA]">
        <div className="flex flex-col items-center text-center">
          <img
            src="/app-logo.png"
            alt="PRATO & TREINO"
            className="mb-3 h-14 w-14 rounded-2xl object-cover shadow-lg shadow-[#12BFA3]/25"
          />
          <p className="font-display text-xl font-bold tracking-tight">PRATO &amp; TREINO</p>
          <p className="mt-2 text-xs text-[#5C7B79]">Carregando sua evolução...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <AuthPage />;
  }

  if (!profile.onboarding_completed) {
    return <OnboardingPage />;
  }

  const primaryAction =
    route !== 'nutrition' ? (
      <button
        type="button"
        onClick={() => setRoute('nutrition')}
        className="inline-flex items-center gap-1.5 rounded-xl bg-[#12BFA3] px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-[#12BFA3]/25 transition-colors hover:bg-[#0EA88F] whitespace-nowrap"
      >
        <Plus className="h-3.5 w-3.5" />
        <span>Registrar prato</span>
      </button>
    ) : undefined;

  return (
    <AppLayout
      currentRoute={route}
      onNavigate={setRoute}
      pageTitle={PAGE_TITLES[route]}
      primaryAction={primaryAction}
    >
      {route === 'dashboard' && <DashboardPage onNavigate={setRoute} />}
      {route === 'nutrition' && <NutritionPage />}
      {route === 'workouts' && <WorkoutsPage />}
      {route === 'coach' && <CoachPage />}
      {route === 'progress' && <ProgressPage />}
      {route === 'profile' && <ProfilePage />}
      {route === 'settings' && <SettingsPage onNavigate={setRoute} />}
    </AppLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
