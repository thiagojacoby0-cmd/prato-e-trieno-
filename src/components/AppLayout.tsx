import React, { useEffect, useState } from 'react';
import {
  Bell,
  Bot,
  Dumbbell,
  LayoutDashboard,
  Moon,
  Settings,
  Sun,
  TrendingUp,
  User,
  Utensils,
  X,
} from 'lucide-react';
import { useWorkoutReminder } from '../hooks/useWorkoutReminder';
import { useAuth } from '../hooks/useAuth';
import { useAppSettings } from '../utils/appSettings';
import { OfflineIndicator, PWAInstallButton } from './PWAInstallButton';

export type AppRoute = 'dashboard' | 'nutrition' | 'workouts' | 'coach' | 'progress' | 'profile' | 'settings';

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
  { id: 'settings', label: 'Configurações', mobileLabel: 'Config', icon: Settings },
];

const MOBILE_BOTTOM_TABS = NAV_ITEMS.slice(0, 5);

export function AppLayout({
  currentRoute,
  onNavigate,
  pageTitle,
  primaryAction,
  children,
}: AppLayoutProps) {
  const { profile } = useAuth();
  const { settings, updateSettings } = useAppSettings();
  const { bannerMessage, dismissBanner } = useWorkoutReminder(Boolean(profile));
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const isDark = settings.theme === 'dark';

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isEditableElement = (el: EventTarget | null): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === 'TEXTAREA' || el.isContentEditable) return true;
      if (tag === 'INPUT') {
        const inputType = (el as HTMLInputElement).type;
        return !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color'].includes(inputType);
      }
      return false;
    };

    let baselineHeight = window.visualViewport?.height || window.innerHeight;
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    let blurTimer: ReturnType<typeof setTimeout> | null = null;

    const handleFocusIn = (e: FocusEvent) => {
      if (!isEditableElement(e.target)) return;
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }
      setKeyboardOpen(true);
      const target = e.target;
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 220);
    };

    const handleFocusOut = () => {
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (!isEditableElement(document.activeElement)) {
          setKeyboardOpen(false);
        }
      }, 140);
    };

    const handleViewportResize = () => {
      if (!window.visualViewport) return;
      const vvHeight = window.visualViewport.height;
      if (!isEditableElement(document.activeElement)) {
        baselineHeight = Math.max(baselineHeight, vvHeight);
      }
      const heightDiff = baselineHeight - vvHeight;
      if (heightDiff > 140) {
        setKeyboardOpen(true);
      } else if (!isEditableElement(document.activeElement)) {
        baselineHeight = vvHeight;
        setKeyboardOpen(false);
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    window.visualViewport?.addEventListener('resize', handleViewportResize);

    return () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      if (blurTimer) clearTimeout(blurTimer);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-br from-[#EAF7F1] via-[#F3FBF7] to-[#FAFDFC] text-[#0F2A2A] transition-colors dark:from-[#051011] dark:via-[#071618] dark:to-[#0A1E20] dark:text-[#F2FAFA]">
      {/* Subtle studio mint decorative curve */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-[420px] bg-[radial-gradient(ellipse_at_68%_22%,rgba(21,200,170,0.09),transparent_62%)]"
      />

      {/* Compact Full-Width Top Header */}
      <header className="sticky top-0 z-30 border-b border-[#E1EEE9] bg-white/85 pt-safe backdrop-blur-md">
        <div className="mx-auto flex min-h-[62px] max-w-[1260px] items-center justify-between gap-3 px-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-sm shadow-[#12BFA3]/25 transition-transform hover:scale-[1.03]"
              aria-label="Início"
            >
              <img src="/app-logo.png" alt="PRATO & TREINO" className="h-10 w-10 object-cover" />
            </button>
            <h1 className="truncate font-display text-lg font-bold tracking-tight text-[#0F2A2A] sm:text-xl">
              {pageTitle}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <PWAInstallButton compact />
            <div className="hidden sm:block">{primaryAction}</div>
            <button
              type="button"
              onClick={() => updateSettings({ theme: isDark ? 'light' : 'dark' })}
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-[#DCECE6] bg-white text-[#3E5C5B] transition-colors hover:bg-[#F2F9F6]"
              aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
              title={isDark ? 'Modo claro' : 'Modo escuro'}
            >
              {isDark ? <Sun className="h-4 w-4 text-[#F59E2D]" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className={`flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border transition-colors ${
                currentRoute === 'settings'
                  ? 'border-[#12BFA3] bg-[#12BFA3]/15 text-[#0B8A74]'
                  : 'border-[#DCECE6] bg-white text-[#3E5C5B] hover:bg-[#F2F9F6]'
              }`}
              aria-label="Configurações"
              title="Configurações"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className={`flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full border transition-colors ${
                currentRoute === 'profile'
                  ? 'border-[#12BFA3] bg-[#12BFA3]/15 text-[#0B8A74]'
                  : 'border-[#DCECE6] bg-white text-[#3E5C5B] hover:bg-[#F2F9F6]'
              }`}
              aria-label="Meu Perfil"
              title={profile?.full_name || 'Meu Perfil'}
            >
              <User className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main
        className={`relative z-10 mx-auto w-full max-w-[1260px] px-3.5 pt-5 sm:px-6 sm:pt-7 lg:px-8 ${
          keyboardOpen ? 'pb-8' : 'pb-28'
        }`}
      >
        {bannerMessage && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-[#12BFA3]/35 bg-white px-4 py-3 text-xs text-[#0F2A2A] shadow-sm">
            <div className="flex items-center gap-2.5">
              <Bell className="h-4 w-4 shrink-0 text-[#F59E2D]" />
              <span>{bannerMessage}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  dismissBanner();
                  onNavigate('workouts');
                }}
                className="rounded-lg bg-[#12BFA3] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0EA88F]"
              >
                Ir treinar
              </button>
              <button
                type="button"
                onClick={dismissBanner}
                className="rounded-lg p-1.5 text-[#648482] hover:bg-[#F2F9F6] hover:text-[#0F2A2A]"
                aria-label="Dispensar lembrete"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        {children}
      </main>

      {/* Fixed Centered Bottom Tab Bar (Desktop & Mobile, hidden while virtual keyboard is open) */}
      {!keyboardOpen && (
        <nav
          aria-label="Navegação principal"
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E1EEE9] bg-white/95 pb-safe shadow-[0_-6px_24px_-10px_rgba(15,42,42,0.08)] backdrop-blur-md"
        >
          <div className="mx-auto grid min-h-[64px] max-w-3xl grid-cols-5 items-center px-2">
            {MOBILE_BOTTOM_TABS.map((item) => {
              const Icon = item.icon;
              const active = currentRoute === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 transition-colors hover:bg-[#F4FAF7] active:bg-[#EDF7F3] ${
                    active ? 'text-[#0C947E]' : 'text-[#5C7B79] hover:text-[#0F2A2A]'
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 ${
                      active
                        ? 'text-[#0C947E]'
                        : item.id === 'dashboard' || item.id === 'coach'
                          ? 'text-[#F59E2D]'
                          : 'text-[#4B6B68]'
                    }`}
                  />
                  <span className={`text-[11px] tracking-tight ${active ? 'font-bold text-[#0C947E]' : 'font-medium'}`}>
                    {item.mobileLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <OfflineIndicator />
    </div>
  );
}
