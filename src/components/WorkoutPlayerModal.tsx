import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  FastForward,
  Mic,
  MicOff,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Star,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { WorkoutExercise, WorkoutExerciseStage, WorkoutPreferences, WorkoutProgram } from '../types';
import { ExerciseTutorialVideo } from './ExerciseTutorialVideo';
import { findSubstitutesForExercise, pickExercise } from '../database/exerciseLibrary';
import { playCountdownTick, playTone, speakCoachCue, stopVoiceCoach } from '../utils/voiceCoach';

interface QueueItem {
  stage: WorkoutExerciseStage;
  exercise: WorkoutExercise;
  originalId: string;
}

interface WorkoutPlayerModalProps {
  workout: WorkoutProgram;
  preferences: WorkoutPreferences;
  planContext?: { planId: string; dayNumber: number } | null;
  onUpdatePreferences: (patch: Partial<WorkoutPreferences>) => Promise<void>;
  onClose: () => void;
  onComplete: (stats: {
    duration_minutes: number;
    calories_burned: number;
    exercises_completed: number;
    skipped_exercises: number;
    perceived_difficulty: 'facil' | 'ideal' | 'intenso';
    warmup_done: boolean;
    cooldown_done: boolean;
    plan_id?: string | null;
    plan_day_number?: number | null;
  }) => Promise<void>;
}

const STAGE_LABELS: Record<WorkoutExerciseStage, string> = {
  warmup: 'Aquecimento Inicial',
  main: 'Treino Principal',
  cooldown: 'Alongamento Final',
};

export function WorkoutPlayerModal({
  workout,
  preferences,
  planContext = null,
  onUpdatePreferences,
  onClose,
  onComplete,
}: WorkoutPlayerModalProps) {
  // Monta fila completa: Aquecimento -> Exercícios Principais (com substituições salvas) -> Alongamento Final
  const initialQueue = useMemo<QueueItem[]>(() => {
    const items: QueueItem[] = [];
    const warmup = workout.warmup && workout.warmup.length > 0 ? workout.warmup : [];
    const cooldown = workout.cooldown && workout.cooldown.length > 0 ? workout.cooldown : [];

    warmup.forEach((ex) => items.push({ stage: 'warmup', exercise: ex, originalId: ex.id }));
    workout.exercises.forEach((ex) => {
      const subId = preferences.substituted_exercises?.[ex.id];
      const resolved = subId ? pickExercise(subId, { stage: 'main' }) : ex;
      items.push({ stage: 'main', exercise: resolved, originalId: ex.id });
    });
    cooldown.forEach((ex) => items.push({ stage: 'cooldown', exercise: ex, originalId: ex.id }));
    return items;
  }, [workout, preferences.substituted_exercises]);

  const [queue, setQueue] = useState<QueueItem[]>(initialQueue);
  const [exIndex, setExIndex] = useState(0);
  const [setIndex, setSetIndex] = useState(1);

  const prepCountdown = Math.max(3, Math.min(10, preferences.countdown_seconds || 5));
  const [phase, setPhase] = useState<'countdown' | 'work' | 'rest' | 'finished'>('countdown');
  const [secondsLeft, setSecondsLeft] = useState(prepCountdown);
  const [running, setRunning] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(preferences.sound_enabled ?? true);
  const [voiceEnabled, setVoiceEnabled] = useState(preferences.voice_enabled ?? true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [difficulty, setDifficulty] = useState<'facil' | 'ideal' | 'intenso'>('ideal');
  const [saving, setSaving] = useState(false);
  const [showSubstitutes, setShowSubstitutes] = useState(false);

  const currentItem = queue[exIndex];
  const currentExercise = currentItem?.exercise;
  const currentStage = currentItem?.stage || 'main';
  const nextItem = queue[exIndex + 1];

  const getAdjustedDuration = (ex: WorkoutExercise, stage: WorkoutExerciseStage) => {
    const mult = stage === 'main' ? preferences.adaptive_multiplier || 1 : 1;
    return Math.max(15, Math.round((ex.duration_seconds || 35) * mult));
  };

  const getRestSeconds = (ex: WorkoutExercise) => {
    return ex.rest_seconds > 0 ? ex.rest_seconds : preferences.rest_seconds || 20;
  };

  const spokenKeyRef = useRef<string>('');

  // Falar orientação inicial ao abrir o player
  useEffect(() => {
    if (!currentExercise) return;
    if (phase === 'countdown') {
      const key = `prep-${exIndex}-${setIndex}`;
      if (spokenKeyRef.current !== key) {
        spokenKeyRef.current = key;
        speakCoachCue(`Prepare-se para começar. ${currentExercise.name}.`, voiceEnabled);
      }
    }
    return () => {
      stopVoiceCoach();
    };
  }, []);

  // Cronômetro principal
  useEffect(() => {
    if (!running || phase === 'finished' || !currentExercise) return;

    const timer = setInterval(() => {
      if (phase === 'work') {
        setElapsedSeconds((prev) => prev + 1);
      }

      setSecondsLeft((prev) => {
        // Beep nos últimos 3 segundos
        if (prev <= 4 && prev > 1) {
          playCountdownTick(prev - 1, soundEnabled);
        }

        // Aviso de voz aos 10 segundos restantes em exercícios longos
        if (phase === 'work' && prev === 11) {
          speakCoachCue('Faltam dez segundos.', voiceEnabled);
        }

        if (prev > 1) {
          return prev - 1;
        }

        // Transição ao zerar cronômetro
        if (phase === 'countdown') {
          playCountdownTick(0, soundEnabled);
          speakCoachCue(`Comece agora. ${currentExercise.name}.`, voiceEnabled);
          setPhase('work');
          return getAdjustedDuration(currentExercise, currentStage);
        }

        if (phase === 'work') {
          playTone(540, 180, soundEnabled);
          if (setIndex < currentExercise.sets) {
            const restSec = getRestSeconds(currentExercise);
            setPhase('rest');
            speakCoachCue(`Descanse por ${restSec} segundos.`, voiceEnabled);
            return restSec;
          }
          if (exIndex + 1 < queue.length) {
            const restSec = getRestSeconds(currentExercise);
            const upcoming = queue[exIndex + 1];
            setPhase('rest');
            if (upcoming.stage !== currentStage && upcoming.stage === 'main') {
              speakCoachCue(
                `Aquecimento concluído. Descanse por ${restSec} segundos. Próximo exercício: ${upcoming.exercise.name}.`,
                voiceEnabled
              );
            } else {
              speakCoachCue(
                `Descanse por ${restSec} segundos. Próximo exercício: ${upcoming.exercise.name}.`,
                voiceEnabled
              );
            }
            return restSec;
          }
          setPhase('finished');
          setRunning(false);
          playTone(880, 280, soundEnabled);
          speakCoachCue('Treino concluído. Parabéns!', voiceEnabled);
          return 0;
        }

        // Termina descanso -> avança série ou próximo exercício
        playCountdownTick(0, soundEnabled);
        if (setIndex < currentExercise.sets) {
          setSetIndex((s) => s + 1);
          setPhase('work');
          speakCoachCue(`Comece agora. Série ${setIndex + 1}.`, voiceEnabled);
          return getAdjustedDuration(currentExercise, currentStage);
        }
        const nextIdx = exIndex + 1;
        if (nextIdx < queue.length) {
          const nextEx = queue[nextIdx];
          setExIndex(nextIdx);
          setSetIndex(1);
          setPhase('work');
          speakCoachCue(`Próximo exercício. ${nextEx.exercise.name}. Comece agora.`, voiceEnabled);
          return getAdjustedDuration(nextEx.exercise, nextEx.stage);
        }

        setPhase('finished');
        setRunning(false);
        speakCoachCue('Treino concluído. Parabéns!', voiceEnabled);
        return 0;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [running, phase, exIndex, setIndex, currentExercise, currentStage, queue, soundEnabled, voiceEnabled]);

  const advanceToNextStep = (isSkipExercise: boolean) => {
    setShowSubstitutes(false);
    if (!currentExercise) return;

    if (isSkipExercise) {
      setSkippedCount((c) => c + 1);
      const nextIdx = exIndex + 1;
      if (nextIdx < queue.length) {
        const upcoming = queue[nextIdx];
        setExIndex(nextIdx);
        setSetIndex(1);
        setPhase('countdown');
        setSecondsLeft(3);
        speakCoachCue(`Próximo exercício. ${upcoming.exercise.name}. Prepare-se.`, voiceEnabled);
      } else {
        setPhase('finished');
        setRunning(false);
        speakCoachCue('Treino concluído. Parabéns!', voiceEnabled);
      }
      return;
    }

    if (phase === 'countdown') {
      setPhase('work');
      setSecondsLeft(getAdjustedDuration(currentExercise, currentStage));
      speakCoachCue(`Comece agora. ${currentExercise.name}.`, voiceEnabled);
      return;
    }

    if (phase === 'rest') {
      if (setIndex < currentExercise.sets) {
        setSetIndex((s) => s + 1);
        setPhase('work');
        setSecondsLeft(getAdjustedDuration(currentExercise, currentStage));
        speakCoachCue(`Comece agora.`, voiceEnabled);
      } else if (exIndex + 1 < queue.length) {
        const nextIdx = exIndex + 1;
        const upcoming = queue[nextIdx];
        setExIndex(nextIdx);
        setSetIndex(1);
        setPhase('work');
        setSecondsLeft(getAdjustedDuration(upcoming.exercise, upcoming.stage));
        speakCoachCue(`Próximo exercício. ${upcoming.exercise.name}.`, voiceEnabled);
      } else {
        setPhase('finished');
        setRunning(false);
        speakCoachCue('Treino concluído. Parabéns!', voiceEnabled);
      }
      return;
    }

    // Avançar durante work vai direto para descanso ou próximo exercício
    if (setIndex < currentExercise.sets) {
      setPhase('rest');
      setSecondsLeft(getRestSeconds(currentExercise));
    } else if (exIndex + 1 < queue.length) {
      const nextIdx = exIndex + 1;
      const upcoming = queue[nextIdx];
      setExIndex(nextIdx);
      setSetIndex(1);
      setPhase('countdown');
      setSecondsLeft(3);
      speakCoachCue(`Próximo exercício. ${upcoming.exercise.name}.`, voiceEnabled);
    } else {
      setPhase('finished');
      setRunning(false);
      speakCoachCue('Treino concluído. Parabéns!', voiceEnabled);
    }
  };

  const handleSubstituteExercise = async (replacement: WorkoutExercise) => {
    const item = queue[exIndex];
    if (!item) return;
    setQueue((prev) =>
      prev.map((q, i) => (i === exIndex ? { ...q, exercise: { ...replacement, sets: q.exercise.sets } } : q))
    );
    setShowSubstitutes(false);
    const updatedMap = {
      ...(preferences.substituted_exercises || {}),
      [item.originalId]: replacement.id,
    };
    await onUpdatePreferences({ substituted_exercises: updatedMap }).catch(() => {});
  };

  const handleToggleFavorite = async () => {
    if (!currentExercise) return;
    const exists = preferences.favorite_exercise_ids.includes(currentExercise.id);
    const nextFavs = exists
      ? preferences.favorite_exercise_ids.filter((id) => id !== currentExercise.id)
      : [...preferences.favorite_exercise_ids, currentExercise.id];
    await onUpdatePreferences({ favorite_exercise_ids: nextFavs }).catch(() => {});
  };

  const handleToggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    if (!next) stopVoiceCoach();
    onUpdatePreferences({ voice_enabled: next }).catch(() => {});
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    onUpdatePreferences({ sound_enabled: next }).catch(() => {});
  };

  const handleReset = () => {
    stopVoiceCoach();
    setExIndex(0);
    setSetIndex(1);
    setPhase('countdown');
    setSecondsLeft(prepCountdown);
    setElapsedSeconds(0);
    setSkippedCount(0);
    setRunning(false);
  };

  const handleFinishAndSave = async () => {
    setSaving(true);
    try {
      const minutes = Math.max(1, Math.round(elapsedSeconds / 60) || workout.duration_minutes);
      const ratio = Math.max(0.35, (queue.length - skippedCount) / Math.max(1, queue.length));
      const calories = Math.round(
        Math.max(40, workout.estimated_calories * ratio * (preferences.adaptive_multiplier || 1))
      );
      await onComplete({
        duration_minutes: minutes,
        calories_burned: calories,
        exercises_completed: Math.max(1, queue.length - skippedCount),
        skipped_exercises: skippedCount,
        perceived_difficulty: difficulty,
        warmup_done: queue.some((q) => q.stage === 'warmup'),
        cooldown_done: queue.some((q) => q.stage === 'cooldown'),
        plan_id: planContext?.planId ?? null,
        plan_day_number: planContext?.dayNumber ?? null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const totalSteps = queue.reduce((acc, q) => acc + q.exercise.sets, 0);
  const completedSteps =
    queue.slice(0, exIndex).reduce((acc, q) => acc + q.exercise.sets, 0) + (setIndex - 1);
  const progressPct = phase === 'finished' ? 100 : Math.round((completedSteps / Math.max(1, totalSteps)) * 100);
  const isFavorite = currentExercise ? preferences.favorite_exercise_ids.includes(currentExercise.id) : false;
  const substitutes = currentExercise ? findSubstitutesForExercise(currentExercise) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2 sm:p-4">
      <div className="flex max-h-[96vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111613] shadow-2xl">
        {/* Top Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[#22C55E]">
              {STAGE_LABELS[currentStage]} · {workout.category}
            </p>
            <h3 className="truncate text-base font-semibold text-[#F4F7F5] sm:text-lg">{workout.title}</h3>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleToggleVoice}
              className={`rounded-lg border p-2 text-xs transition-colors ${
                voiceEnabled
                  ? 'border-[#22C55E]/40 bg-[#22C55E]/15 text-[#22C55E]'
                  : 'border-white/10 text-[#9AA8A0] hover:text-white'
              }`}
              title={voiceEnabled ? 'Desativar treinador por voz (pt-BR)' : 'Ativar treinador por voz (pt-BR)'}
            >
              {voiceEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={handleToggleSound}
              className="rounded-lg border border-white/10 p-2 text-[#9AA8A0] transition-colors hover:bg-white/5 hover:text-white"
              title={soundEnabled ? 'Desativar bipes' : 'Ativar bipes'}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                stopVoiceCoach();
                onClose();
              }}
              className="rounded-lg border border-white/10 p-2 text-[#9AA8A0] transition-colors hover:bg-white/5 hover:text-white"
              aria-label="Fechar treino"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="border-b border-white/6 bg-[#0D110E] px-4 py-2.5 sm:px-6">
          <div className="mb-1 flex items-center justify-between text-[11px] text-[#9AA8A0]">
            <span>
              Movimento {Math.min(exIndex + 1, queue.length)} de {queue.length}
              {currentExercise ? ` · Série ${setIndex}/${currentExercise.sets}` : ''}
            </span>
            <span className="font-mono font-semibold text-[#22C55E] tabular-nums">{progressPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-[#22C55E] transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {phase === 'finished' ? (
            <div className="my-4 flex flex-col items-center text-center">
              <CheckCircle2 className="h-14 w-14 text-[#22C55E]" />
              <h4 className="mt-3 font-display text-2xl font-semibold text-[#F4F7F5]">Treino concluído. Parabéns!</h4>
              <p className="mt-1.5 max-w-md text-xs text-[#9AA8A0]">
                Sua sessão será salva no histórico e usada para ajustar automaticamente a intensidade dos próximos treinos.
              </p>

              <div className="mt-5 grid w-full max-w-md grid-cols-3 gap-3 rounded-xl border border-white/8 bg-[#0C100E] p-4">
                <div>
                  <p className="text-[11px] text-[#8F9E95]">Duração</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-[#F4F7F5] tabular-nums">
                    {Math.max(1, Math.round(elapsedSeconds / 60))} min
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#8F9E95]">Exercícios</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-[#F4F7F5] tabular-nums">
                    {Math.max(1, queue.length - skippedCount)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#8F9E95]">Calorias</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-[#22C55E] tabular-nums">
                    ~{workout.estimated_calories} kcal
                  </p>
                </div>
              </div>

              <div className="mt-5 w-full max-w-md rounded-xl border border-white/8 bg-[#0C100E] p-4 text-left">
                <p className="text-xs font-medium text-[#C2CCC6]">Como você sentiu este treino?</p>
                <p className="mt-0.5 text-[11px] text-[#8F9E95]">Ajusta automaticamente o ritmo das próximas sessões.</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { id: 'facil' as const, label: 'Fácil' },
                    { id: 'ideal' as const, label: 'Ideal' },
                    { id: 'intenso' as const, label: 'Intenso' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDifficulty(opt.id)}
                      className={`rounded-xl border py-2 text-xs font-semibold transition-colors ${
                        difficulty === opt.id
                          ? 'border-[#22C55E] bg-[#22C55E]/15 text-[#22C55E]'
                          : 'border-white/10 text-[#9AA8A0] hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleFinishAndSave}
                disabled={saving}
                className="mt-6 w-full max-w-md rounded-xl bg-[#22C55E] px-6 py-3 text-sm font-semibold text-[#06120A] transition-colors hover:bg-[#16A34A] disabled:opacity-60"
              >
                {saving ? 'Salvando evolução...' : 'Concluir e salvar evolução'}
              </button>
            </div>
          ) : currentExercise ? (
            <div className="space-y-4">
              {/* 3D Exercise Visualization occupying main focal area */}
              {phase === 'rest' && nextItem ? (
                <div className="space-y-3">
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-amber-400/30 bg-[#0D1310] p-6 text-center">
                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                      Descanso automático
                    </span>
                    <div className="my-3 font-mono text-6xl font-bold tracking-tight text-[#F4F7F5] tabular-nums">
                      00:{String(secondsLeft).padStart(2, '0')}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSecondsLeft((s) => s + 15)}
                        className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-1.5 text-xs text-[#C2CCC6] hover:bg-white/5"
                      >
                        <Plus className="h-3.5 w-3.5 text-[#22C55E]" />
                        15 seg
                      </button>
                      <button
                        type="button"
                        onClick={() => advanceToNextStep(false)}
                        className="inline-flex items-center gap-1 rounded-xl bg-[#22C55E] px-4 py-1.5 text-xs font-semibold text-[#06120A] hover:bg-[#16A34A]"
                      >
                        Pular descanso
                      </button>
                    </div>
                  </div>

                  {/* Prévia visual 3D do próximo movimento durante o descanso */}
                  <div className="rounded-xl border border-white/8 bg-[#0C100E] p-3">
                    <p className="mb-2 text-xs text-[#9AA8A0]">
                      A seguir: <strong className="text-[#F4F7F5]">{setIndex < currentExercise.sets ? `${currentExercise.name} (Série ${setIndex + 1})` : nextItem.exercise.name}</strong>
                    </p>
                    <ExerciseTutorialVideo
                      exerciseName={setIndex < currentExercise.sets ? currentExercise.name : nextItem.exercise.name}
                      muscleGroup={setIndex < currentExercise.sets ? currentExercise.muscle_group : nextItem.exercise.muscle_group}
                      instructions={setIndex < currentExercise.sets ? currentExercise.instructions : nextItem.exercise.instructions}
                      explicitArchetype={setIndex < currentExercise.sets ? currentExercise.demo_archetype : nextItem.exercise.demo_archetype}
                      hideTextGuide
                      heightClass="h-52 sm:h-60"
                    />
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <ExerciseTutorialVideo
                    exerciseName={currentExercise.name}
                    muscleGroup={currentExercise.muscle_group}
                    instructions={currentExercise.instructions}
                    explicitArchetype={currentExercise.demo_archetype}
                    hideTextGuide
                    playing={running}
                    onTogglePlaying={() => setRunning((r) => !r)}
                    heightClass="h-64 sm:h-72"
                  />

                  {phase === 'countdown' && (
                    <div className="mt-3 flex items-center justify-between rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/12 px-4 py-3">
                      <div>
                        <p className="text-xs font-semibold text-[#22C55E]">Prepare-se para começar</p>
                        <p className="text-xs text-[#C2CCC6]">{currentExercise.correct_position || currentExercise.instructions}</p>
                      </div>
                      <span className="font-mono text-4xl font-bold text-[#F4F7F5] tabular-nums">
                        {secondsLeft}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Active Exercise Telemetry & Instructions */}
              <div className="rounded-2xl border border-white/8 bg-[#0C100E] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-lg font-semibold text-[#F4F7F5] sm:text-xl">{currentExercise.name}</h4>
                      <button
                        type="button"
                        onClick={handleToggleFavorite}
                        className={`rounded-lg border p-1.5 transition-colors ${
                          isFavorite
                            ? 'border-amber-400/50 bg-amber-400/15 text-amber-300'
                            : 'border-white/10 text-[#8F9E95] hover:text-white'
                        }`}
                        title={isFavorite ? 'Remover dos favoritos' : 'Marcar como favorito'}
                      >
                        <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-amber-300' : ''}`} />
                      </button>
                    </div>
                    <p className="mt-0.5 text-xs text-[#8F9E95]">
                      {currentExercise.muscle_group} · <span className="font-mono text-[#22C55E]">{currentExercise.reps_or_duration}</span>
                    </p>
                  </div>

                  {phase !== 'rest' && (
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-wider text-[#8F9E95]">
                        {phase === 'countdown' ? 'Início em' : 'Tempo restante'}
                      </p>
                      <p className="font-mono text-3xl font-bold text-[#F4F7F5] tabular-nums sm:text-4xl">
                        00:{String(secondsLeft).padStart(2, '0')}
                      </p>
                    </div>
                  )}
                </div>

                <p className="mt-3 text-xs leading-relaxed text-[#C2CCC6]">
                  {currentExercise.instructions}
                </p>

                {showSubstitutes && substitutes.length > 0 && (
                  <div className="mt-3 rounded-xl border border-white/10 bg-[#121915] p-3">
                    <p className="text-xs font-medium text-[#22C55E]">Substituir exercício mantendo o foco muscular:</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {substitutes.map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => handleSubstituteExercise(sub)}
                          className="rounded-lg border border-white/10 bg-[#0A0D0B] px-3 py-2 text-left text-xs text-[#F4F7F5] transition-colors hover:border-[#22C55E]"
                        >
                          <div className="font-medium">{sub.name}</div>
                          <div className="text-[11px] text-[#8F9E95]">{sub.muscle_group}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Bottom Guided Controls Dock */}
        {phase !== 'finished' && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 bg-[#0D110E] px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setRunning((r) => !r)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#22C55E] px-5 py-2.5 text-sm font-semibold text-[#06120A] transition-colors hover:bg-[#16A34A]"
              >
                {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {running ? 'Pausar' : 'Continuar'}
              </button>

              <button
                type="button"
                onClick={() => advanceToNextStep(false)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3.5 py-2.5 text-xs font-medium text-[#F4F7F5] transition-colors hover:bg-white/5"
              >
                <SkipForward className="h-4 w-4 text-[#22C55E]" />
                Próximo exercício
              </button>

              <button
                type="button"
                onClick={() => advanceToNextStep(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2.5 text-xs text-[#C2CCC6] transition-colors hover:bg-white/5"
              >
                <FastForward className="h-3.5 w-3.5" />
                Pular
              </button>

              {substitutes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSubstitutes((s) => !s)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2.5 text-xs text-[#C2CCC6] transition-colors hover:bg-white/5"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5 text-[#22C55E]" />
                  Substituir
                </button>
              )}

              <button
                type="button"
                onClick={handleReset}
                className="rounded-xl border border-white/10 p-2.5 text-[#9AA8A0] hover:bg-white/5 hover:text-white"
                title="Reiniciar treino"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                stopVoiceCoach();
                setPhase('finished');
                setRunning(false);
              }}
              className="rounded-xl border border-[#22C55E]/40 px-4 py-2 text-xs font-medium text-[#22C55E] transition-colors hover:bg-[#22C55E]/10"
            >
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
