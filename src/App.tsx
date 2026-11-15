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

const PAGE_TITLES: Record<AppRoute, string> = {
  dashboard: 'Visão Geral',
  nutrition: 'Alimentação & Diário IA',
  workouts: 'Treinos em Casa',
  coach: 'Personal Trainer IA',
  progress: 'Evolução & Medidas',
  profile: 'Meu Perfil',
};

function AppContent() {
  const { profile, loading } = useAuth();
  const [route, setRoute] = useState<AppRoute>('dashboard');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0D0B] text-[#F4F7F5]">
        <div className="text-center">
          <p className="font-display text-xl font-bold tracking-tight">PRATO &amp; TREINO</p>
          <p className="mt-2 text-xs text-[#8F9E95]">Carregando sua evolução...</p>
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
        className="inline-flex items-center gap-1.5 rounded-xl bg-[#22C55E] px-3.5 py-2 text-xs font-semibold text-[#06120A] transition-colors hover:bg-[#16A34A] whitespace-nowrap"
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
