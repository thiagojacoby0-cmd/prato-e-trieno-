import React, { useEffect, useRef, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { apiRequest } from '../services/apiClient';
import { CoachMessage } from '../types';
import { useAuth } from '../hooks/useAuth';

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
      .catch(() => {})
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
    await apiRequest('/api/ai/coach', { method: 'DELETE' });
    setMessages([]);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Coach Context Sidebar */}
      <aside className="space-y-4 lg:col-span-4">
        <div className="rounded-2xl border border-white/8 bg-[#111613] p-6">
          <div className="flex items-center gap-4">
            <img
              src="/src/assets/images/coach_ai_avatar_1794693853091.jpg"
              alt="Personal Trainer IA PRATO & TREINO"
              referrerPolicy="no-referrer"
              className="h-14 w-14 rounded-2xl border border-white/10 object-cover"
            />
            <div>
              <h2 className="font-display text-lg font-semibold text-[#F4F7F5]">Personal &amp; Nutri IA</h2>
              <p className="text-xs text-[#22C55E]">Sincronizado com seu diário</p>
            </div>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-[#9AA8A0]">
            Suas perguntas consideram automaticamente seu peso atual ({profile?.current_weight_kg} kg), sua meta de{' '}
            <span className="font-mono text-[#F4F7F5] tabular-nums">{profile?.daily_calorie_target} kcal</span> e o que você já registrou hoje.
          </p>

          <div className="mt-5 border-t border-white/8 pt-4">
            <p className="mb-2.5 text-xs font-medium text-[#C2CCC6]">Perguntas rápidas</p>
            <div className="space-y-2">
              {QUICK_PROMPTS.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => sendMessage(q)}
                  disabled={sending}
                  className="w-full rounded-xl border border-white/8 bg-[#0A0D0B] px-3.5 py-2.5 text-left text-xs text-[#C2CCC6] transition-colors hover:border-[#22C55E]/40 hover:text-white disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Chat Viewport */}
      <section className="flex h-[640px] flex-col rounded-2xl border border-white/8 bg-[#111613] lg:col-span-8">
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
          <div>
            <h3 className="font-display text-base font-semibold text-[#F4F7F5]">Atendimento contínuo</h3>
            <p className="text-xs text-[#8F9E95]">Histórico salvo na sua conta</p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#9AA8A0] hover:bg-white/5 hover:text-white"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar histórico
            </button>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {loading ? (
            <div className="h-24 animate-pulse rounded-xl bg-white/5" />
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-[#F4F7F5]">Inicie uma conversa com seu Personal IA</p>
              <p className="mt-1 max-w-md text-xs text-[#8F9E95]">
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
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#22C55E] font-medium text-[#06120A]'
                      : 'border border-white/8 bg-[#0C100E] text-[#E6ECE8]'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-white/8 bg-[#0C100E] px-4 py-3 text-xs text-[#8F9E95]">
                Analisando seu perfil e preparando resposta...
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex items-center gap-3 border-t border-white/8 p-4"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escreva sua dúvida sobre treino, dieta ou substituição de alimentos..."
            className="flex-1 rounded-xl border border-white/10 bg-[#0A0D0B] px-4 py-2.5 text-sm text-[#F4F7F5] placeholder-[#5F6E65] focus:border-[#22C55E] focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#22C55E] px-4 py-2.5 text-sm font-semibold text-[#06120A] transition-colors hover:bg-[#16A34A] disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </form>
      </section>
    </div>
  );
}
