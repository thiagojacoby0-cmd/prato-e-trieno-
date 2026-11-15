import React, { useState } from 'react';
import { Activity, ArrowRight, Mail } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { PWAInstallButton } from '../components/PWAInstallButton';

export function AuthPage() {
  const { sendEmailOtp, verifyEmailOtp, login, enterPersonalMode, configInfo, initError } = useAuth();
  const [mode, setMode] = useState<'otp' | 'password'>('otp');
  const [email, setEmail] = useState('thiagojacoby0@gmail.com');
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initError);

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0D0B] px-4 py-10 text-[#F4F7F5]">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#22C55E] text-[#06120A]">
              <Activity className="h-5 w-5 stroke-[2.5]" />
            </span>
            <div>
              <h1 className="font-display text-lg font-bold tracking-tight text-[#F4F7F5]">
                PRATO &amp; TREINO
              </h1>
              <p className="text-xs text-[#8F9E95]">Uso pessoal · Acesso sem senha</p>
            </div>
          </div>
          <PWAInstallButton compact />
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#111613] p-6 sm:p-7">
          {(!configInfo?.supabaseConfigured || configInfo?.supabaseServiceRole) && (
            <div className="mb-5">
              <button
                type="button"
                onClick={handleDirectAccess}
                disabled={submitting}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] px-4 py-3 text-sm font-semibold text-[#06120A] transition-colors hover:bg-[#16A34A] disabled:opacity-60"
              >
                <span>{submitting ? 'Entrando...' : 'Entrar no meu app agora (sem senha)'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="mb-5 flex items-center gap-1 rounded-xl bg-[#0A0D0B] p-1">
            <button
              type="button"
              onClick={() => {
                setMode('otp');
                setError(null);
              }}
              className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                mode === 'otp' ? 'bg-[#1A231D] text-[#F4F7F5]' : 'text-[#8F9E95] hover:text-white'
              }`}
            >
              Código por e-mail (sem senha)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('password');
                setError(null);
              }}
              className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                mode === 'password' ? 'bg-[#1A231D] text-[#F4F7F5]' : 'text-[#8F9E95] hover:text-white'
              }`}
            >
              Entrar com senha
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
              {error}
            </div>
          )}

          {mode === 'otp' ? (
            !otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label htmlFor="otp-email" className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">
                    Seu e-mail
                  </label>
                  <input
                    id="otp-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-4 py-2.5 text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/15 px-4 py-2.5 text-sm font-semibold text-[#22C55E] hover:bg-[#22C55E]/25 disabled:opacity-60"
                >
                  <Mail className="h-4 w-4" />
                  <span>{submitting ? 'Enviando...' : 'Enviar código de acesso'}</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <p className="text-xs text-[#9AA8A0]">
                  Enviamos um código para <strong className="text-[#F4F7F5]">{email}</strong>. Digite abaixo para manter sua sessão conectada no celular:
                </p>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Código de 6 dígitos"
                  className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-4 py-2.5 font-mono text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] px-4 py-2.5 text-sm font-semibold text-[#06120A] hover:bg-[#16A34A] disabled:opacity-60"
                >
                  <span>{submitting ? 'Validando...' : 'Confirmar código'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOtpSent(false)}
                  className="w-full text-xs text-[#8F9E95] hover:text-white"
                >
                  Reenviar ou trocar e-mail
                </button>
              </form>
            )
          ) : (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-4 py-2.5 text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-4 py-2.5 text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] px-4 py-2.5 text-sm font-semibold text-[#06120A] hover:bg-[#16A34A] disabled:opacity-60"
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
