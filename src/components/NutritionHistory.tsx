import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Droplets,
  ExternalLink,
  Repeat,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { apiRequest } from '../services/apiClient';
import {
  MealEntry,
  NutritionBackupPayload,
  NutritionDayStatus,
  NutritionHistoryDay,
  NutritionHistoryResponse,
  NutritionRestoreResult,
} from '../types';
import { formatDateBR, formatShortWeekday, getTodayISO, MEAL_CATEGORY_LABELS } from '../utils/nutrition';
import { sanitizeNutritionBackup, shiftDateISO } from '../utils/nutritionHistory';
import {
  overwriteLocalNutritionMirror,
  syncLocalNutritionMirror,
} from '../utils/localNutritionMirror';

const PERIOD_OPTIONS: Array<{ days: 7 | 30 | 90 | 365; label: string }> = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 365, label: '1 ano' },
];

interface ChartBucket {
  key: string;
  label: string;
  shortLabel: string;
  calories: number;
  target: number;
  status: NutritionDayStatus;
  loggedDays: number;
  subtitle: string;
}

const STATUS_COLOR: Record<NutritionDayStatus, string> = {
  on_target: '#16A34A', // Verde: na meta (±10%)
  above: '#F59E2D', // Laranja: acima
  below: '#0EA5E9', // Azul: abaixo
  empty: 'rgba(15,42,42,0.08)',
};

const STATUS_TEXT: Record<NutritionDayStatus, string> = {
  on_target: 'Na meta',
  above: 'Acima da meta',
  below: 'Abaixo da meta',
  empty: 'Sem registro',
};

const STATUS_TEXT_CLASS: Record<NutritionDayStatus, string> = {
  on_target: 'text-emerald-700',
  above: 'text-amber-700',
  below: 'text-sky-700',
  empty: 'text-[#648482]',
};

function buildChartBuckets(history: NutritionHistoryResponse): { buckets: ChartBucket[]; isWeekly: boolean } {
  const { days_requested, from_date, to_date } = history.summary;
  const target = history.target_calories || 2000;
  const dayMap = new Map<string, NutritionHistoryDay>(history.days.map((d) => [d.date, d]));
  const isWeekly = days_requested > 92;

  const allDates: string[] = [];
  for (let i = 0; i < days_requested; i++) {
    const d = shiftDateISO(from_date, i);
    if (d > to_date) break;
    allDates.push(d);
  }

  if (!isWeekly) {
    const buckets: ChartBucket[] = allDates.map((date) => {
      const entry = dayMap.get(date);
      const calories = entry?.meals_count ? entry.calories : 0;
      const status: NutritionDayStatus = entry?.meals_count ? entry.status : 'empty';
      return {
        key: date,
        label: `${formatShortWeekday(date).toUpperCase()} · ${formatDateBR(date)}`,
        shortLabel: days_requested <= 7 ? formatShortWeekday(date) : formatDateBR(date).slice(0, 5),
        calories,
        target,
        status,
        loggedDays: entry?.meals_count ? 1 : 0,
        subtitle: entry?.meals_count
          ? `${entry.meals_count} ${entry.meals_count === 1 ? 'refeição' : 'refeições'} · P ${entry.protein_g}g`
          : 'Sem refeições registradas',
      };
    });
    return { buckets, isWeekly: false };
  }

  // > 92 dias: agrupa em semanas de 7 dias com média por dia registrado na semana
  const buckets: ChartBucket[] = [];
  for (let i = 0; i < allDates.length; i += 7) {
    const slice = allDates.slice(i, i + 7);
    const first = slice[0];
    const last = slice[slice.length - 1];
    const logged = slice
      .map((d) => dayMap.get(d))
      .filter((d): d is NutritionHistoryDay => Boolean(d && d.meals_count > 0));

    const avgCalories =
      logged.length > 0 ? Math.round(logged.reduce((acc, d) => acc + d.calories, 0) / logged.length) : 0;
    let status: NutritionDayStatus = 'empty';
    if (logged.length > 0) {
      if (avgCalories >= target * 0.9 - 1e-6 && avgCalories <= target * 1.1 + 1e-6) {
        status = 'on_target';
      } else {
        status = avgCalories > target * 1.1 ? 'above' : 'below';
      }
    }

    buckets.push({
      key: `${first}_${last}`,
      label: `Semana ${formatDateBR(first).slice(0, 5)} a ${formatDateBR(last).slice(0, 5)}`,
      shortLabel: formatDateBR(first).slice(0, 5),
      calories: avgCalories,
      target,
      status,
      loggedDays: logged.length,
      subtitle:
        logged.length > 0
          ? `Média em ${logged.length} ${logged.length === 1 ? 'dia registrado' : 'dias registrados'}`
          : 'Sem registros nesta semana',
    });
  }
  return { buckets, isWeekly: true };
}

export function NutritionHistory({
  onOpenDateInDiary,
  onMealRepeatedToday,
}: {
  onOpenDateInDiary: (date: string) => void;
  onMealRepeatedToday?: () => void;
}) {
  const [periodDays, setPeriodDays] = useState<7 | 30 | 90 | 365>(30);
  const [history, setHistory] = useState<NutritionHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [hoveredBucketIdx, setHoveredBucketIdx] = useState<number | null>(null);

  const [localMirror, setLocalMirror] = useState<NutritionBackupPayload | null>(null);
  const [missingOnServer, setMissingOnServer] = useState(false);
  const [missingMealsCount, setMissingMealsCount] = useState(0);

  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [repeatingMealId, setRepeatingMealId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const todayISO = getTodayISO();

  const loadHistoryAndMirror = useCallback(async (daysToFetch: number) => {
    setLoading(true);
    setError(null);
    try {
      const [historyRes, backupRes] = await Promise.all([
        apiRequest<NutritionHistoryResponse>(`/api/nutrition/history?days=${daysToFetch}`),
        apiRequest<NutritionBackupPayload>('/api/nutrition/backup'),
      ]);
      setHistory(historyRes);
      setHoveredBucketIdx(null);

      // Expande automaticamente o dia mais recente com refeições na carga inicial
      if (historyRes.days.length > 0) {
        const firstDate = historyRes.days[0].date;
        setExpandedDays((prev) => (Object.keys(prev).length === 0 ? { [firstDate]: true } : prev));
      }

      const sync = syncLocalNutritionMirror(backupRes);
      setLocalMirror(sync.mirror);
      setMissingOnServer(sync.missingOnServer);
      setMissingMealsCount(sync.missingMealsCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar histórico nutricional.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistoryAndMirror(periodDays);
  }, [loadHistoryAndMirror, periodDays]);

  const { buckets, isWeekly } = useMemo(() => {
    if (!history) return { buckets: [] as ChartBucket[], isWeekly: false };
    return buildChartBuckets(history);
  }, [history]);

  const activeBucket = useMemo(() => {
    if (buckets.length === 0) return null;
    if (hoveredBucketIdx !== null && buckets[hoveredBucketIdx]) {
      return buckets[hoveredBucketIdx];
    }
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (buckets[i].calories > 0) return buckets[i];
    }
    return buckets[buckets.length - 1];
  }, [buckets, hoveredBucketIdx]);

  const toggleDayExpand = (date: string) => {
    setExpandedDays((prev) => ({ ...prev, [date]: !prev[date] }));
  };

  const handleRepeatMealToday = async (meal: MealEntry) => {
    setRepeatingMealId(meal.id);
    setError(null);
    setFeedback(null);
    try {
      await apiRequest('/api/meals', {
        method: 'POST',
        body: JSON.stringify({
          date: todayISO,
          category: meal.category,
          title: meal.title,
          description: meal.description || 'Repetida a partir do histórico',
          calories: meal.calories,
          protein_g: meal.protein_g,
          carbs_g: meal.carbs_g,
          fat_g: meal.fat_g,
          fiber_g: meal.fiber_g ?? 0,
          image_url: meal.image_url || null,
          items: meal.items || [],
          ai_analyzed: Boolean(meal.ai_analyzed),
        }),
      });
      setFeedback(`"${meal.title}" repetida no diário de hoje.`);
      await loadHistoryAndMirror(periodDays);
      onMealRepeatedToday?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível repetir a refeição hoje.');
    } finally {
      setRepeatingMealId(null);
    }
  };

  const handleDownloadBackup = async () => {
    setDownloadingBackup(true);
    setError(null);
    setFeedback(null);
    try {
      const backup = await apiRequest<NutritionBackupPayload>('/api/nutrition/backup');
      overwriteLocalNutritionMirror(backup);
      setLocalMirror(backup);

      const jsonStr = JSON.stringify(backup, null, 2);
      const fileName = `prato-treino-backup-${todayISO}.json`;
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const file = new File([blob], fileName, { type: 'application/json' });

      let shared = false;
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        const canShareFile = typeof navigator.canShare === 'function' ? navigator.canShare({ files: [file] }) : true;
        if (canShareFile) {
          try {
            await navigator.share({
              title: 'Backup Nutricional · PRATO & TREINO',
              text: `Backup com ${backup.meals.length} refeições registradas.`,
              files: [file],
            });
            shared = true;
          } catch (shareErr) {
            if (shareErr instanceof DOMException && shareErr.name === 'AbortError') {
              shared = true;
            }
          }
        }
      }

      if (!shared) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      setFeedback(`Backup pronto (${backup.meals.length} refeições salvas em ${fileName}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível gerar o backup.');
    } finally {
      setDownloadingBackup(false);
    }
  };

  const restorePayloadToServer = async (payload: unknown, sourceLabel: string) => {
    const sanitized = sanitizeNutritionBackup(payload);
    if (!sanitized) {
      setError('Arquivo de backup inválido. Selecione um JSON exportado pelo PRATO & TREINO.');
      return;
    }

    setRestoringBackup(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await apiRequest<{ ok: boolean } & NutritionRestoreResult>('/api/nutrition/restore', {
        method: 'POST',
        body: JSON.stringify(sanitized),
      });

      const refreshedBackup = await apiRequest<NutritionBackupPayload>('/api/nutrition/backup');
      overwriteLocalNutritionMirror(refreshedBackup);
      setLocalMirror(refreshedBackup);
      setMissingOnServer(false);
      setMissingMealsCount(0);

      await loadHistoryAndMirror(periodDays);
      onMealRepeatedToday?.();

      setFeedback(
        `${sourceLabel}: ${res.meals_added} refeições restauradas` +
          (res.meals_skipped > 0 ? `, ${res.meals_skipped} já existentes` : '') +
          (res.water_days_merged > 0 ? `, ${res.water_days_merged} dias de água atualizados` : '') +
          (res.plans_added > 0 ? `, ${res.plans_added} cardápios` : '') +
          (res.weights_added > 0 ? `, ${res.weights_added} pesos` : '') +
          '.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao restaurar o backup nutricional.');
    } finally {
      setRestoringBackup(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      await restorePayloadToServer(parsed, 'Restauração concluída');
    } catch {
      setError('Não foi possível ler este arquivo JSON. Verifique se o backup não está corrompido.');
    }
  };

  const handleRestoreFromLocalMirror = async () => {
    if (!localMirror) return;
    await restorePayloadToServer(localMirror, 'Histórico do aparelho restaurado');
  };

  // Dimensões SVG
  const chartW = 680;
  const chartH = 228;
  const padL = 46;
  const padR = 16;
  const padT = 18;
  const padB = 34;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;
  const maxChartCal = useMemo(() => {
    const target = history?.target_calories || 2000;
    const peak = Math.max(...buckets.map((b) => b.calories), target * 1.15, 1800);
    return Math.ceil(peak / 200) * 200;
  }, [buckets, history?.target_calories]);

  const targetCal = history?.target_calories || 2000;
  const targetLineY = padT + (1 - Math.min(1, targetCal / maxChartCal)) * innerH;
  const slotW = buckets.length > 0 ? innerW / buckets.length : innerW;
  const barW = Math.max(3, Math.min(28, slotW * 0.66));
  const labelStride = Math.max(1, Math.ceil(buckets.length / 8));

  return (
    <div className="space-y-6">
      {/* Controles de período + Backup/Restauração */}
      <div className="flex flex-col gap-3 rounded-3xl border border-[#E1EEE9] bg-white p-4 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-[#DCECE6] bg-[#EDF7F3] p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              type="button"
              onClick={() => setPeriodDays(opt.days)}
              className={`min-h-[40px] shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                periodDays === opt.days
                  ? 'bg-[#15C8AA] text-[#062924] shadow-sm'
                  : 'text-[#4B6B68] hover:text-[#0F2A2A]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadBackup}
            disabled={downloadingBackup || restoringBackup}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-[#BCE6DC] bg-[#E3F7F2] px-4 py-2 text-xs font-semibold text-[#0B7C6A] transition-colors hover:bg-[#D4F3EA] disabled:opacity-60 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            {downloadingBackup ? 'Preparando...' : 'Baixar backup'}
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={restoringBackup || downloadingBackup}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-4 py-2 text-xs font-semibold text-[#0F2A2A] transition-colors hover:border-[#12BFA3] hover:bg-[#E7F4EF] disabled:opacity-60 whitespace-nowrap"
          >
            <Upload className="h-4 w-4 text-[#0C947E]" />
            {restoringBackup ? 'Restaurando...' : 'Restaurar de arquivo'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileSelected}
            className="hidden"
          />
        </div>
      </div>

      {/* Aviso amarelo quando parte do histórico local não está no servidor */}
      {missingOnServer && missingMealsCount >= 3 && (
        <div
          role="alert"
          className="flex flex-col justify-between gap-4 rounded-2xl border border-[#F7D79C] bg-[#FFF8EB] p-4 sm:flex-row sm:items-center"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#D97706]" />
            <div>
              <p className="text-sm font-bold text-[#7C470A]">
                Parte do seu histórico não está no servidor
              </p>
              <p className="mt-0.5 text-xs text-[#9A5B13]">
                Encontramos {missingMealsCount} refeições salvas neste aparelho que ainda não aparecem no banco atual. A cópia local foi preservada.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRestoreFromLocalMirror}
            disabled={restoringBackup}
            className="inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#F59E2D] px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#E08A1A] disabled:opacity-60 whitespace-nowrap"
          >
            <RotateCcw className="h-4 w-4" />
            Restaurar {missingMealsCount} refeições
          </button>
        </div>
      )}

      {feedback && (
        <div className="flex items-center gap-2 rounded-xl border border-[#BCE6DC] bg-[#E3F7F2] px-4 py-3 text-xs font-medium text-[#0B7C6A]">
          <Check className="h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {loading && !history ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((k) => (
              <div key={k} className="h-24 animate-pulse rounded-3xl border border-[#E1EEE9] bg-white" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-3xl border border-[#E1EEE9] bg-white" />
        </div>
      ) : history ? (
        <>
          {/* 4 Cards de Resumo */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-3xl border border-[#E1EEE9] bg-white p-4 shadow-[0_8px_22px_-14px_rgba(15,42,42,0.08)]">
              <p className="text-xs font-medium text-[#5C7B79]">Média por dia</p>
              <p className="mt-1.5 font-mono text-2xl font-bold text-[#0F2A2A] tabular-nums">
                {history.summary.avg_calories.toLocaleString('pt-BR')} <span className="text-xs font-normal text-[#5C7B79]">kcal</span>
              </p>
              <p className="mt-1 text-[11px] text-[#648482] tabular-nums">
                Meta: {history.summary.target_calories.toLocaleString('pt-BR')} kcal
              </p>
            </div>

            <div className="rounded-3xl border border-[#E1EEE9] bg-white p-4 shadow-[0_8px_22px_-14px_rgba(15,42,42,0.08)]">
              <p className="text-xs font-medium text-[#5C7B79]">Dias registrados</p>
              <p className="mt-1.5 font-mono text-2xl font-bold text-[#0F2A2A] tabular-nums">
                {history.summary.logged_days}
              </p>
              <p className="mt-1 text-[11px] text-[#648482] tabular-nums">
                {history.summary.total_meals} {history.summary.total_meals === 1 ? 'refeição' : 'refeições'} no período
              </p>
            </div>

            <div className="rounded-3xl border border-[#E1EEE9] bg-white p-4 shadow-[0_8px_22px_-14px_rgba(15,42,42,0.08)]">
              <p className="text-xs font-medium text-[#5C7B79]">Dias na meta</p>
              <p className="mt-1.5 font-mono text-2xl font-bold text-emerald-600 tabular-nums">
                {history.summary.days_on_target}
              </p>
              <p className="mt-1 text-[11px] text-[#648482]">
                Faixa de ±10% da meta diária
              </p>
            </div>

            <div className="rounded-3xl border border-[#E1EEE9] bg-white p-4 shadow-[0_8px_22px_-14px_rgba(15,42,42,0.08)]">
              <p className="text-xs font-medium text-[#5C7B79]">Proteína média</p>
              <p className="mt-1.5 font-mono text-2xl font-bold text-[#0C947E] tabular-nums">
                {history.summary.avg_protein_g}g
              </p>
              <p className="mt-1 text-[11px] text-[#648482] tabular-nums">
                Carbo {history.summary.avg_carbs_g}g · Gord {history.summary.avg_fat_g}g
              </p>
            </div>
          </div>

          {/* Gráfico SVG de Calorias */}
          <section className="rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-[#0F2A2A]">
                  {isWeekly ? 'Média semanal de calorias' : 'Calorias por dia'}
                </h3>
                <p className="mt-0.5 text-xs text-[#5C7B79]">
                  {formatDateBR(history.summary.from_date)} até {formatDateBR(history.summary.to_date)}
                  {isWeekly ? ' · Agrupado por semana (períodos acima de 92 dias)' : ''}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-[#4B6B68]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#16A34A]" />
                  Na meta
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#F59E2D]" />
                  Acima
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#0EA5E9]" />
                  Abaixo
                </span>
              </div>
            </div>

            {activeBucket && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#DCECE6] bg-[#F4FAF7] px-3.5 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-[#2E4A48]">
                  <span className="font-semibold text-[#0F2A2A]">{activeBucket.label}</span>
                  <span aria-hidden="true" className="text-[#7C9A98]">·</span>
                  <span>{activeBucket.subtitle}</span>
                </div>
                <div className="flex items-center gap-2 font-mono tabular-nums">
                  <strong className="text-[#0F2A2A]">
                    {activeBucket.calories.toLocaleString('pt-BR')} kcal
                  </strong>
                  <span className={`font-semibold ${STATUS_TEXT_CLASS[activeBucket.status]}`}>
                    {STATUS_TEXT[activeBucket.status]}
                  </span>
                </div>
              </div>
            )}

            <div className="mt-4">
              <svg
                viewBox={`0 0 ${chartW} ${chartH}`}
                className="h-56 w-full overflow-visible"
                role="img"
                aria-label="Gráfico histórico de calorias por período"
              >
                {[0, 0.5, 1].map((t, idx) => {
                  const val = Math.round(maxChartCal * (1 - t));
                  const y = padT + t * innerH;
                  return (
                    <g key={idx}>
                      <line
                        x1={padL}
                        y1={y}
                        x2={chartW - padR}
                        y2={y}
                        stroke="rgba(15,42,42,0.08)"
                        strokeWidth="1"
                      />
                      <text
                        x={padL - 8}
                        y={y + 4}
                        textAnchor="end"
                        className="fill-[#648482] font-mono text-[10px]"
                      >
                        {val}
                      </text>
                    </g>
                  );
                })}

                {/* Linha tracejada da meta */}
                <line
                  x1={padL}
                  y1={targetLineY}
                  x2={chartW - padR}
                  y2={targetLineY}
                  stroke="#0C947E"
                  strokeOpacity="0.7"
                  strokeDasharray="5 4"
                  strokeWidth="1.5"
                />
                <text
                  x={chartW - padR}
                  y={Math.max(padT + 10, targetLineY - 6)}
                  textAnchor="end"
                  className="fill-[#0C947E] font-mono text-[10px] font-semibold"
                >
                  Meta {targetCal} kcal
                </text>

                {buckets.map((b, idx) => {
                  const cx = padL + idx * slotW + slotW / 2;
                  const barH = b.calories > 0 ? Math.max(4, (b.calories / maxChartCal) * innerH) : 3;
                  const barY = padT + innerH - barH;
                  const isActive = hoveredBucketIdx === idx;
                  const showTick = idx === 0 || idx === buckets.length - 1 || idx % labelStride === 0;

                  return (
                    <g
                      key={b.key}
                      onMouseEnter={() => setHoveredBucketIdx(idx)}
                      onMouseLeave={() => setHoveredBucketIdx(null)}
                      onClick={() => setHoveredBucketIdx((prev) => (prev === idx ? null : idx))}
                      className="cursor-pointer"
                    >
                      <rect x={cx - slotW / 2} y={padT} width={slotW} height={innerH} fill="transparent" />
                      <rect
                        x={cx - barW / 2}
                        y={barY}
                        width={barW}
                        height={barH}
                        rx={Math.min(4, barW / 2)}
                        fill={STATUS_COLOR[b.status]}
                        fillOpacity={isActive ? 1 : b.status === 'empty' ? 0.8 : 0.9}
                      />
                      {showTick && (
                        <text
                          x={cx}
                          y={chartH - 10}
                          textAnchor="middle"
                          className={`font-mono text-[10px] ${isActive ? 'fill-[#0F2A2A] font-semibold' : 'fill-[#648482]'}`}
                        >
                          {b.shortLabel}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </section>

          {/* Lista de Dias Expansíveis */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-bold text-[#0F2A2A]">
                Registros diários ({history.days.length})
              </h3>
              <span className="text-xs text-[#5C7B79]">Mais recentes primeiro</span>
            </div>

            {history.days.length === 0 ? (
              <div className="rounded-3xl border border-[#E1EEE9] bg-white p-10 text-center">
                <Calendar className="mx-auto h-8 w-8 text-[#7C9A98]" />
                <p className="mt-3 text-sm font-semibold text-[#0F2A2A]">
                  Nenhum registro encontrado nos últimos {periodDays} dias
                </p>
                <p className="mt-1 text-xs text-[#5C7B79]">
                  Registre suas refeições no diário ou restaure um arquivo de backup acima.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.days.map((day) => {
                  const isExpanded = Boolean(expandedDays[day.date]);
                  const isToday = day.date === todayISO;
                  return (
                    <div
                      key={day.date}
                      className="overflow-hidden rounded-3xl border border-[#E1EEE9] bg-white shadow-[0_6px_20px_-14px_rgba(15,42,42,0.08)]"
                    >
                      <button
                        type="button"
                        onClick={() => toggleDayExpand(day.date)}
                        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-[#F4FAF7]/60"
                        aria-expanded={isExpanded}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#0F2A2A]">
                            <span>{formatDateBR(day.date)}</span>
                            <span className="text-xs font-medium text-[#5C7B79]">
                              {isToday ? 'Hoje' : formatShortWeekday(day.date).toUpperCase()}
                            </span>
                            <span aria-hidden="true" className="text-[#7C9A98]">·</span>
                            <span className={`text-xs font-semibold ${STATUS_TEXT_CLASS[day.status]}`}>
                              {STATUS_TEXT[day.status]}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-[#5C7B79] tabular-nums">
                            <span>
                              {day.meals_count} {day.meals_count === 1 ? 'refeição' : 'refeições'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              C {day.carbs_g}g · P {day.protein_g}g · G {day.fat_g}g
                            </span>
                            {day.water_ml > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 font-semibold text-sky-600">
                                  <Droplets className="h-3 w-3" />
                                  {day.water_ml} ml
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                          <span className="font-mono text-base font-bold text-[#0F2A2A] tabular-nums">
                            {day.calories.toLocaleString('pt-BR')} kcal
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-[#5C7B79]" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-[#5C7B79]" />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="space-y-3 border-t border-[#E1EEE9] bg-[#F4FAF7] px-5 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                            <span className="font-mono text-xs text-[#5C7B79] tabular-nums">
                              Fibras: {day.fiber_g}g · Água: {day.water_ml} ml
                            </span>
                            <button
                              type="button"
                              onClick={() => onOpenDateInDiary(day.date)}
                              className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-[#0C947E] hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Abrir este dia no diário
                            </button>
                          </div>

                          {day.meals.length === 0 ? (
                            <p className="text-xs text-[#5C7B79]">
                              Apenas hidratação registrada neste dia ({day.water_ml} ml).
                            </p>
                          ) : (
                            <div className="space-y-2.5">
                              {day.meals.map((meal) => (
                                <div
                                  key={meal.id}
                                  className="flex flex-col justify-between gap-3 rounded-2xl border border-[#DCECE6] bg-white p-3.5 sm:flex-row sm:items-center"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-[11px] text-[#5C7B79]">
                                      <span className="font-semibold text-[#0C947E]">
                                        {MEAL_CATEGORY_LABELS[meal.category] || meal.category}
                                      </span>
                                      {meal.ai_analyzed && (
                                        <>
                                          <span aria-hidden="true">·</span>
                                          <span>TACO + Cálculo IA</span>
                                        </>
                                      )}
                                    </div>
                                    <p className="mt-0.5 truncate text-sm font-bold text-[#0F2A2A]">
                                      {meal.title}
                                    </p>
                                    {meal.description && (
                                      <p className="mt-0.5 line-clamp-1 text-xs text-[#5C7B79]">
                                        {meal.description}
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                                    <div className="text-right font-mono tabular-nums">
                                      <p className="text-sm font-bold text-[#0F2A2A]">
                                        {meal.calories} kcal
                                      </p>
                                      <p className="text-[11px] text-[#5C7B79]">
                                        C {meal.carbs_g}g · P {meal.protein_g}g · G {meal.fat_g}g
                                      </p>
                                    </div>

                                    {meal.date !== todayISO && (
                                      <button
                                        type="button"
                                        onClick={() => handleRepeatMealToday(meal)}
                                        disabled={repeatingMealId === meal.id}
                                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-[#BCE6DC] bg-[#E3F7F2] px-3 py-1.5 text-xs font-semibold text-[#0B7C6A] transition-colors hover:bg-[#D4F3EA] disabled:opacity-60 whitespace-nowrap"
                                      >
                                        <Repeat className="h-3.5 w-3.5" />
                                        {repeatingMealId === meal.id ? 'Copiando...' : 'Repetir hoje'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
