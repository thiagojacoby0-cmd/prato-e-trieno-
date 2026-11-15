import React from 'react';
import {
  Activity,
  Bell,
  Bot,
  Dumbbell,
  LayoutDashboard,
  LogOut,
  TrendingUp,
  User,
  Utensils,
  X,
} from 'lucide-react';
import { useWorkoutReminder } from '../hooks/useWorkoutReminder';
import { useAuth } from '../hooks/useAuth';
import { OfflineIndicator, PWAInstallButton } from './PWAInstallButton';

export type AppRoute = 'dashboard' | 'nutrition' | 'workouts' | 'coach' | 'progress' | 'profile';

interface AppLayoutProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  pageTitle: string;
  primaryAction?: React.ReactNode;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: AppRoute;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Visão Geral', mobileLabel: 'Início', icon: LayoutDashboard },
  { id: 'nutrition', label: 'Alimentação', mobileLabel: 'Prato', icon: Utensils },
  { id: 'workouts', label: 'Treinos em Casa', mobileLabel: 'Treino', icon: Dumbbell },
  { id: 'coach', label: 'Personal IA', mobileLabel: 'Personal', icon: Bot },
  { id: 'progress', label: 'Evolução', mobileLabel: 'Evolução', icon: TrendingUp },
  { id: 'profile', label: 'Meu Perfil', mobileLabel: 'Perfil', icon: User },
];

const MOBILE_BOTTOM_TABS = NAV_ITEMS.slice(0, 5);

export function AppLayout({
  currentRoute,
  onNavigate,
  pageTitle,
  primaryAction,
  children,
}: AppLayoutProps) {
  const { profile, logout, configInfo } = useAuth();
  const { bannerMessage, dismissBanner } = useWorkoutReminder(Boolean(profile));

  return (
    <div className="min-h-screen bg-[#0A0D0B] text-[#F4F7F5] lg:flex">
      {/* Sidebar Desktop 256px */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-white/8 lg:bg-[#0D110E]">
        <div className="flex h-16 items-center border-b border-white/8 px-6">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-2.5 text-left"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#22C55E] text-[#06120A]">
              <Activity className="h-4 w-4 stroke-[2.5]" />
            </span>
            <span className="font-display text-base font-bold tracking-tight text-[#F4F7F5] whitespace-nowrap">
              PRATO &amp; TREINO
            </span>
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-5" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = currentRoute === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#22C55E]/12 text-[#22C55E]'
                    : 'text-[#9AA8A0] hover:bg-white/5 hover:text-[#F4F7F5]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-white/8 p-4">
          <PWAInstallButton />
          <div className="px-2">
            <p className="truncate text-sm font-medium text-[#F4F7F5]">{profile?.full_name}</p>
            <p className="truncate text-xs text-[#7D8C84]">Uso pessoal · {profile?.goal}</p>
          </div>
          {configInfo?.supabaseConfigured && (
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-[#9AA8A0] transition-colors hover:bg-white/5 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              <span>Bloquear sessão</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact Top Bar (<= 52px mobile, 64px desktop) */}
        <header className="sticky top-0 z-30 flex h-[52px] items-center justify-between gap-3 border-b border-white/8 bg-[#0A0D0B]/95 px-4 backdrop-blur-md sm:px-8 lg:h-16">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#22C55E] text-[#06120A] lg:hidden"
              aria-label="Início"
            >
              <Activity className="h-4 w-4 stroke-[2.5]" />
            </button>
            <h1 className="truncate font-display text-base font-semibold text-[#F4F7F5] sm:text-lg">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="lg:hidden">
              <PWAInstallButton compact />
            </div>
            <div className="hidden sm:block">{primaryAction}</div>
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className={`flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border transition-colors lg:hidden ${
                currentRoute === 'profile'
                  ? 'border-[#22C55E] bg-[#22C55E]/15 text-[#22C55E]'
                  : 'border-white/10 bg-[#111613] text-[#C2CCC6]'
              }`}
              aria-label="Meu Perfil"
            >
              <User className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-5 pb-24 sm:px-8 sm:py-8 lg:pb-10">
          {bannerMessage && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/12 px-4 py-3 text-xs text-[#F4F7F5]">
              <div className="flex items-center gap-2.5">
                <Bell className="h-4 w-4 shrink-0 text-[#22C55E]" />
                <span>{bannerMessage}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    dismissBanner();
                    onNavigate('workouts');
                  }}
                  className="rounded-lg bg-[#22C55E] px-2.5 py-1 text-[11px] font-semibold text-[#06120A]"
                >
                  Ir treinar
                </button>
                <button
                  type="button"
                  onClick={dismissBanner}
                  className="rounded-lg p-1 text-[#9AA8A0] hover:text-white"
                  aria-label="Dispensar lembrete"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Fixed Mobile Bottom Tab Bar (Thumb Zone) */}
      <nav
        aria-label="Navegação móvel"
        className="fixed bottom-0 left-0 right-0 z-40 grid h-16 grid-cols-5 items-center border-t border-white/10 bg-[#0D110E]/95 pb-safe backdrop-blur-md lg:hidden"
      >
        {MOBILE_BOTTOM_TABS.map((item) => {
          const Icon = item.icon;
          const active = currentRoute === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 px-1 transition-colors ${
                active ? 'text-[#22C55E]' : 'text-[#8F9E95] active:text-[#F4F7F5]'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium tracking-tight">{item.mobileLabel}</span>
            </button>
          );
        })}
      </nav>

      <OfflineIndicator />
    </div>
  );
}
