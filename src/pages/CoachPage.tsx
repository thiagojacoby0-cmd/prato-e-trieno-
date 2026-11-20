import React, { useEffect, useRef, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { apiRequest } from '../services/apiClient';
import { CoachMessage } from '../types';
import { useAuth } from '../hooks/useAuth';
import coachAvatarImg from '../assets/images/coach_ai_avatar_1794693853091.jpg';

const QUICK_PROMPTS = [
  'O que comer no jantar hoje para bater minha meta de proteína?',
  'Monte um treino rápido de 20 minutos sem impacto nos joelhos',
  'Como ajustar minhas calorias nos fins de semana sem perder resultado?',
  'Sugira 3 lanches práticos com menos de 200 kcal',
];

export function CoachPage() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    apiRequest<{ messages: CoachMessage[] }>('/api/ai/coach')
      .then((res) => setMessages(res.messages))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erro ao carregar histórico do Personal Trainer IA.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || sending) return;
    setError(null);
    setSending(true);
    const optimisticUser: CoachMessage = {
      id: `temp-${Date.now()}`,
      user_id: profile?.id || '',
      role: 'user',
      content: text.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput('');

    try {
      const res = await apiRequest<{ userMessage: CoachMessage; assistantMessage: CoachMessage }>(
        '/api/ai/coach',
        {
          method: 'POST',
          body: JSON.stringify({ message: text.trim() }),
        }
      );
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticUser.id),
        res.userMessage,
        res.assistantMessage,
      ]);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
      setError(err instanceof Error ? err.message : 'Erro ao consultar o Personal Trainer IA.');
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    setError(null);
    try {
      await apiRequest('/api/ai/coach', { method: 'DELETE' });
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao limpar histórico.');
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* Coach Context Sidebar */}
      <aside className="order-2 space-y-4 lg:order-1 lg:col-span-4">
        <div className="rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] sm:p-6">
          <div className="flex items-center gap-4">
            <img
              src={coachAvatarImg}
              alt="Personal Trainer IA PRATO & TREINO"
              referrerPolicy="no-referrer"
              className="h-14 w-14 rounded-2xl border border-[#DCECE6] object-cover"
            />
            <div>
              <h2 className="font-display text-lg font-bold text-[#0F2A2A]">Personal &amp; Nutri IA</h2>
              <p className="text-xs font-semibold text-[#0C947E]">Sincronizado com seu diário</p>
            </div>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-[#4B6B68]">
            Suas perguntas consideram automaticamente seu peso atual ({profile?.current_weight_kg} kg), sua meta de{' '}
            <span className="font-mono font-bold text-[#0F2A2A] tabular-nums">{profile?.daily_calorie_target} kcal</span> e o que você já registrou hoje.
          </p>

          <div className="mt-5 border-t border-[#E1EEE9] pt-4">
            <p className="mb-2.5 text-xs font-semibold text-[#2E4A48]">Perguntas rápidas</p>
            <div className="space-y-2">
              {QUICK_PROMPTS.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => sendMessage(q)}
                  disabled={sending}
                  className="w-full rounded-2xl border border-[#DCECE6] bg-[#F4FAF7] px-3.5 py-3 text-left text-xs font-medium text-[#2E4A48] transition-colors hover:border-[#12BFA3] hover:bg-[#E7F4EF] hover:text-[#0F2A2A] disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Chat Viewport */}
      <section className="order-1 flex h-[calc(100dvh-13.5rem)] min-h-[430px] flex-col rounded-3xl border border-[#E1EEE9] bg-white shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] lg:order-2 lg:col-span-8 lg:h-[640px]">
        <div className="flex items-center justify-between border-b border-[#E1EEE9] px-4 py-3.5 sm:px-6 sm:py-4">
          <div>
            <h3 className="font-display text-base font-bold text-[#0F2A2A]">Atendimento contínuo</h3>
            <p className="text-xs text-[#5C7B79]">Histórico salvo na sua conta</p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3 py-1.5 text-xs font-medium text-[#4B6B68] hover:bg-[#E7F4EF] hover:text-[#0F2A2A]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar
            </button>
          )}
        </div>

        <div className="flex-1 space-y-3.5 overflow-y-auto p-4 sm:space-y-4 sm:p-6">
          {loading ? (
            <div className="h-24 animate-pulse rounded-2xl bg-[#EDF7F3]" />
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-sm font-bold text-[#0F2A2A]">Inicie uma conversa com seu Personal IA</p>
              <p className="mt-1 max-w-md text-xs text-[#5C7B79]">
                Peça substituições de alimentos, ajustes de macros, treinos rápidos em casa ou orientações de execução.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap sm:max-w-[85%] ${
                    msg.role === 'user'
                      ? 'bg-[#12BFA3] font-medium text-white shadow-sm'
                      : 'border border-[#DCECE6] bg-[#F4FAF7] text-[#0F2A2A]'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-[#DCECE6] bg-[#F4FAF7] px-4 py-3 text-xs text-[#5C7B79]">
                Analisando seu perfil e preparando resposta...
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Mobile Quick Prompts Strip */}
        <div className="flex gap-2 overflow-x-auto border-t border-[#E1EEE9] px-3.5 py-2.5 no-scrollbar lg:hidden">
          {QUICK_PROMPTS.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => sendMessage(q)}
              disabled={sending}
              className="shrink-0 rounded-xl border border-[#DCECE6] bg-[#F4FAF7] px-3 py-2 text-xs font-medium text-[#2E4A48] active:border-[#12BFA3] disabled:opacity-50"
            >
              {q.length > 42 ? `${q.slice(0, 42)}...` : q}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex items-center gap-2.5 border-t border-[#E1EEE9] p-3 sm:gap-3 sm:p-4"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escreva sua dúvida sobre treino ou dieta..."
            className="min-h-[44px] flex-1 rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 text-base text-[#0F2A2A] placeholder-[#7C9A98] focus:border-[#12BFA3] focus:outline-none sm:text-sm"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl bg-[#12BFA3] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0EA88F] disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </form>
      </section>
    </div>
  );
}
