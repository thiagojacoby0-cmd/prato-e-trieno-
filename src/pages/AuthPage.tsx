import React, { useState } from 'react';
import { ArrowRight, Mail, UserPlus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getHasAccount, getLastEmail } from '../services/apiClient';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { BiologicalSex, GoalType } from '../types';
import { GOAL_LABELS } from '../utils/nutrition';

export function AuthPage() {
  const { sendEmailOtp, verifyEmailOtp, login, register, enterPersonalMode, configInfo, initError } =
    useAuth();
  const hasExistingAccount = typeof window !== 'undefined' && getHasAccount();
  const savedEmail = typeof window !== 'undefined' ? getLastEmail() : '';
  const [mode, setMode] = useState<'register' | 'password' | 'otp'>(
    hasExistingAccount ? 'password' : 'register'
  );

  // Login / OTP fields
  const [email, setEmail] = useState(savedEmail);
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  // Cadastro fields
  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [age, setAge] = useState('28');
  const [sex, setSex] = useState<BiologicalSex>('masculino');
  const [heightCm, setHeightCm] = useState('175');
  const [currentWeight, setCurrentWeight] = useState('78');
  const [targetWeight, setTargetWeight] = useState('72');
  const [goal, setGoal] = useState<GoalType>('emagrecimento');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initError);

  const handleFieldFocus = (e: React.FocusEvent<HTMLElement>) => {
    const target = e.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 220);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(fullName.trim(), regEmail.trim(), regPassword, {
        age: Math.max(14, Math.min(95, Number(age) || 28)),
        sex,
        height_cm: Math.max(120, Math.min(230, Number(heightCm) || 175)),
        current_weight_kg: Math.max(35, Math.min(250, Number(currentWeight) || 78)),
        target_weight_kg: Math.max(35, Math.min(250, Number(targetWeight) || 72)),
        goal,
        onboarding_completed: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir seu cadastro.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await sendEmailOtp(email);
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o código.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await verifyEmailOtp(email, code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido ou expirado.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDirectAccess = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await enterPersonalMode();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar automaticamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onFocusCapture={handleFieldFocus}
      className="pt-safe pb-safe flex min-h-[100dvh] flex-col items-center justify-start bg-gradient-to-br from-[#EBF8F2] via-[#F4FBF8] to-[#FAFDFC] px-4 py-8 text-[#0F2A2A] dark:from-[#051011] dark:via-[#071618] dark:to-[#0A1E20] dark:text-[#F2FAFA] sm:justify-center"
    >
      <div className="w-full max-w-md space-y-5 pb-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/app-logo.png"
              alt="PRATO & TREINO"
              className="h-11 w-11 shrink-0 rounded-2xl object-cover shadow-md shadow-[#12BFA3]/25"
            />
            <div>
              <h1 className="font-display text-lg font-bold tracking-tight text-[#0F2A2A]">
                PRATO &amp; TREINO
              </h1>
              <p className="text-xs text-[#648482]">Cadastro pessoal e metas</p>
            </div>
          </div>
          <PWAInstallButton compact />
        </div>

        <div className="rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_14px_34px_-16px_rgba(15,42,42,0.12)] sm:p-7">
          {(!configInfo?.supabaseConfigured || configInfo?.supabaseServiceRole) && (
            <div className="mb-5">
              <button
                type="button"
                onClick={handleDirectAccess}
                disabled={submitting}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[#12BFA3]/40 bg-[#EBF9F6] px-4 py-3 text-sm font-semibold text-[#0C947E] transition-colors hover:bg-[#DCF4EE] disabled:opacity-60"
              >
                <span>{submitting ? 'Entrando...' : 'Entrar sem senha (acesso rápido)'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-[#EDF7F3] p-1">
            <button
              type="button"
              onClick={() => {
                setMode('password');
                setError(null);
              }}
              className={`min-h-[42px] rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                mode === 'password' ? 'bg-white text-[#0C947E] shadow-xs' : 'text-[#5C7B79] hover:text-[#0F2A2A]'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`min-h-[42px] rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                mode === 'register' ? 'bg-white text-[#0C947E] shadow-xs' : 'text-[#5C7B79] hover:text-[#0F2A2A]'
              }`}
            >
              Criar cadastro
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('otp');
                setError(null);
              }}
              className={`min-h-[42px] rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                mode === 'otp' ? 'bg-white text-[#0C947E] shadow-xs' : 'text-[#5C7B79] hover:text-[#0F2A2A]'
              }`}
            >
              Código
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              {error}
            </div>
          )}

          {mode === 'register' ? (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label htmlFor="reg-name" className="mb-1.5 block text-xs font-medium text-[#2E4A48]">
                  Nome completo
                </label>
                <input
                  id="reg-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome"
                  className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-4 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                />
              </div>

              <div>
                <label htmlFor="reg-email" className="mb-1.5 block text-xs font-medium text-[#2E4A48]">
                  E-mail
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="seuemail@exemplo.com"
                  className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-4 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                />
              </div>

              <div>
                <label htmlFor="reg-password" className="mb-1.5 block text-xs font-medium text-[#2E4A48]">
                  Crie uma senha (mínimo 6 caracteres)
                </label>
                <input
                  id="reg-password"
                  type="password"
                  required
                  minLength={6}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="••••••"
                  className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-4 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-age" className="mb-1.5 block text-xs font-medium text-[#2E4A48]">
                    Idade
                  </label>
                  <input
                    id="reg-age"
                    type="number"
                    inputMode="numeric"
                    min={14}
                    max={95}
                    required
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 font-mono text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="reg-sex" className="mb-1.5 block text-xs font-medium text-[#2E4A48]">
                    Sexo
                  </label>
                  <select
                    id="reg-sex"
                    value={sex}
                    onChange={(e) => setSex(e.target.value as BiologicalSex)}
                    className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                  >
                    <option value="masculino">Masculino</option>
                    <option value="feminino">Feminino</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="reg-height" className="mb-1.5 block text-xs font-medium text-[#2E4A48]">
                    Altura (cm)
                  </label>
                  <input
                    id="reg-height"
                    type="number"
                    inputMode="numeric"
                    min={120}
                    max={230}
                    required
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 font-mono text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="reg-weight" className="mb-1.5 block text-xs font-medium text-[#2E4A48]">
                    Peso atual (kg)
                  </label>
                  <input
                    id="reg-weight"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={35}
                    max={250}
                    required
                    value={currentWeight}
                    onChange={(e) => setCurrentWeight(e.target.value)}
                    className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 font-mono text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="reg-target-weight" className="mb-1.5 block text-xs font-medium text-[#2E4A48]">
                    Peso meta (kg)
                  </label>
                  <input
                    id="reg-target-weight"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={35}
                    max={250}
                    required
                    value={targetWeight}
                    onChange={(e) => setTargetWeight(e.target.value)}
                    className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 font-mono text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="reg-goal" className="mb-1.5 block text-xs font-medium text-[#2E4A48]">
                    Objetivo
                  </label>
                  <select
                    id="reg-goal"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value as GoalType)}
                    className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                  >
                    {Object.entries(GOAL_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#12BFA3] px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-[#12BFA3]/25 transition-colors hover:bg-[#0EA88F] disabled:opacity-60"
              >
                <UserPlus className="h-4 w-4" />
                <span>{submitting ? 'Salvando cadastro...' : 'Cadastrar e entrar no app'}</span>
              </button>
            </form>
          ) : mode === 'otp' ? (
            !otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label htmlFor="otp-email" className="mb-1.5 block text-xs font-medium text-[#2E4A48]">
                    Seu e-mail
                  </label>
                  <input
                    id="otp-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seuemail@exemplo.com"
                    className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-4 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-[#12BFA3]/40 bg-[#EBF9F6] px-4 py-2.5 text-sm font-semibold text-[#0C947E] hover:bg-[#DCF4EE] disabled:opacity-60"
                >
                  <Mail className="h-4 w-4" />
                  <span>{submitting ? 'Enviando...' : 'Enviar código de acesso'}</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <p className="text-xs text-[#5C7B79]">
                  Enviamos um código para <strong className="text-[#0F2A2A]">{email}</strong>. Digite abaixo para entrar:
                </p>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Código de 6 dígitos"
                  className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-4 py-2.5 font-mono text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#12BFA3] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0EA88F] disabled:opacity-60"
                >
                  <span>{submitting ? 'Validando...' : 'Confirmar código'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOtpSent(false)}
                  className="min-h-[40px] w-full text-xs text-[#648482] hover:text-[#0F2A2A]"
                >
                  Reenviar ou trocar e-mail
                </button>
              </form>
            )
          ) : (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-[#2E4A48]">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seuemail@exemplo.com"
                  className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-4 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-[#2E4A48]">
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="min-h-[46px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-4 py-2.5 text-base text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#12BFA3] px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-[#12BFA3]/25 hover:bg-[#0EA88F] disabled:opacity-60"
              >
                <span>{submitting ? 'Entrando...' : 'Entrar'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
