import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Star,
  ThumbsDown,
  ThumbsUp,
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
  initialCountdownSeconds?: number;
  prototypeMode?: boolean;
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
  warmup: 'Aquecimento',
  main: 'Treino Principal',
  cooldown: 'Alongamento',
};

function parseExerciseTarget(
  ex: WorkoutExercise,
  stage: WorkoutExerciseStage
): { isRepBased: boolean; repCount: number | null } {
  const raw = (ex.reps_or_duration || '').toLowerCase();
  if (stage === 'warmup' || stage === 'cooldown' || raw.includes('isometria')) {
    return { isRepBased: false, repCount: null };
  }
  const repMatch = raw.match(/(\d+)\s*reps?\b/i) || raw.match(/[×x]\s*(\d+)/i);
  if (repMatch) {
    return { isRepBased: true, repCount: Number(repMatch[1]) };
  }
  return { isRepBased: false, repCount: null };
}

function formatMMSS(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function WorkoutPlayerModal({
  workout,
  preferences,
  planContext = null,
  initialCountdownSeconds,
  prototypeMode = false,
  onUpdatePreferences,
  onClose,
  onComplete,
}: WorkoutPlayerModalProps) {
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

  const prepCountdown = initialCountdownSeconds
    ? Math.max(1, Math.min(12, initialCountdownSeconds))
    : Math.max(5, Math.min(12, preferences.countdown_seconds || 10));
  const [phase, setPhase] = useState<'countdown' | 'work' | 'rest' | 'finished'>('countdown');
  const [secondsLeft, setSecondsLeft] = useState(prepCountdown);
  const [running, setRunning] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(preferences.sound_enabled ?? true);
  const [voiceEnabled, setVoiceEnabled] = useState(preferences.voice_enabled ?? true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [workSecondsElapsed, setWorkSecondsElapsed] = useState(0);
  const [executedReps, setExecutedReps] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [difficulty, setDifficulty] = useState<'facil' | 'ideal' | 'intenso'>('ideal');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [modeOverride, setModeOverride] = useState<'auto' | 'reps' | 'time'>('auto');
  const [showRestEditor, setShowRestEditor] = useState(false);
  const [exerciseVotes, setExerciseVotes] = useState<Record<string, 'up' | 'down'>>({});

  const currentItem = queue[exIndex];
  const currentExercise = currentItem?.exercise;
  const currentStage = currentItem?.stage || 'main';
  const nextItem = queue[exIndex + 1];

  const baseTarget = useMemo(() => {
    if (!currentExercise) return { isRepBased: false, repCount: null };
    return parseExerciseTarget(currentExercise, currentStage);
  }, [currentExercise, currentStage]);

  const getAdjustedDuration = (ex: WorkoutExercise, stage: WorkoutExerciseStage) => {
    const mult = stage === 'main' ? preferences.adaptive_multiplier || 1 : 1;
    return Math.max(15, Math.round((ex.duration_seconds || 30) * mult));
  };

  const targetInfo = useMemo(() => {
    if (!currentExercise) return { isRepBased: false, repCount: null };
    const fallbackReps =
      baseTarget.repCount || Math.max(8, Math.round(getAdjustedDuration(currentExercise, currentStage) / 3));
    if (modeOverride === 'reps') {
      return { isRepBased: true, repCount: fallbackReps };
    }
    if (modeOverride === 'time') {
      return { isRepBased: false, repCount: baseTarget.repCount };
    }
    return baseTarget;
  }, [baseTarget, modeOverride, currentExercise, currentStage]);

  const isEachSideExercise = useMemo(() => {
    if (!currentExercise) return false;
    const text = `${currentExercise.name} ${currentExercise.instructions} ${currentExercise.reps_or_duration}`.toLowerCase();
    return text.includes('cada lado') || text.includes('lado esquerdo') || text.includes('lado direito');
  }, [currentExercise]);

  useEffect(() => {
    setModeOverride('auto');
  }, [exIndex, setIndex]);

  const getRestSeconds = (ex: WorkoutExercise) => {
    return ex.rest_seconds > 0 ? ex.rest_seconds : preferences.rest_seconds || 20;
  };

  const spokenKeyRef = useRef<string>('');
  const secondsLeftRef = useRef(secondsLeft);
  secondsLeftRef.current = secondsLeft;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const exIndexRef = useRef(exIndex);
  exIndexRef.current = exIndex;
  const setIndexRef = useRef(setIndex);
  setIndexRef.current = setIndex;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const targetIsRepRef = useRef(targetInfo.isRepBased);
  targetIsRepRef.current = targetInfo.isRepBased;
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  const voiceRef = useRef(voiceEnabled);
  voiceRef.current = voiceEnabled;

  useEffect(() => {
    if (!currentExercise || phase !== 'countdown') return;
    const key = `prep-${exIndex}-${setIndex}`;
    if (spokenKeyRef.current !== key) {
      spokenKeyRef.current = key;
      speakCoachCue(`Preparado para começar. ${currentExercise.name}.`, voiceEnabled);
    }
  }, [phase, exIndex, setIndex, currentExercise, voiceEnabled]);

  useEffect(() => {
    setExecutedReps(0);
    setWorkSecondsElapsed(0);
  }, [exIndex, setIndex, phase]);

  useEffect(() => {
    return () => {
      stopVoiceCoach();
      if (autoAdvanceTimerRef.current) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
    };
  }, []);

  // Cronômetro principal sem efeitos colaterais dentro de updaters do React
  useEffect(() => {
    if (!running || phase === 'finished' || !currentExercise) return;

    const timer = window.setInterval(() => {
      const curPhase = phaseRef.current;
      const curExIdx = exIndexRef.current;
      const curSetIdx = setIndexRef.current;
      const curQueue = queueRef.current;
      const curItem = curQueue[curExIdx];
      const curEx = curItem?.exercise;
      if (!curEx || curPhase === 'finished') return;

      if (curPhase === 'work') {
        setElapsedSeconds((prev) => prev + 1);
        setWorkSecondsElapsed((prev) => prev + 1);
      }

      // Em exercícios por repetição, o tempo total continua contando em background,
      // mas não encerra o exercício automaticamente — o usuário confirma no botão ✓.
      if (curPhase === 'work' && targetIsRepRef.current) {
        return;
      }

      const prevSec = secondsLeftRef.current;
      const curSound = soundRef.current;
      const curVoice = voiceRef.current;

      if (prevSec <= 4 && prevSec > 1) {
        playCountdownTick(prevSec - 1, curSound);
      }

      if (curPhase === 'work' && prevSec === 11) {
        speakCoachCue('Faltam dez segundos.', curVoice);
      }

      if (prevSec > 1) {
        const nextSec = prevSec - 1;
        secondsLeftRef.current = nextSec;
        setSecondsLeft(nextSec);
        return;
      }

      // Transição ao zerar cronômetro
      if (curPhase === 'countdown') {
        playCountdownTick(0, curSound);
        speakCoachCue(`Comece agora. ${curEx.name}.`, curVoice);
        const dur = getAdjustedDuration(curEx, curItem.stage);
        phaseRef.current = 'work';
        secondsLeftRef.current = dur;
        setPhase('work');
        setSecondsLeft(dur);
        return;
      }

      if (curPhase === 'work') {
        playTone(540, 180, curSound);
        if (curSetIdx < curEx.sets) {
          const restSec = getRestSeconds(curEx);
          phaseRef.current = 'rest';
          secondsLeftRef.current = restSec;
          setPhase('rest');
          setSecondsLeft(restSec);
          speakCoachCue(`Descanse por ${restSec} segundos.`, curVoice);
          return;
        }
        if (curExIdx + 1 < curQueue.length) {
          const restSec = getRestSeconds(curEx);
          const upcoming = curQueue[curExIdx + 1];
          phaseRef.current = 'rest';
          secondsLeftRef.current = restSec;
          setPhase('rest');
          setSecondsLeft(restSec);
          speakCoachCue(
            `Descanse por ${restSec} segundos. Próximo exercício: ${upcoming.exercise.name}.`,
            curVoice
          );
          return;
        }
        phaseRef.current = 'finished';
        secondsLeftRef.current = 0;
        setPhase('finished');
        setSecondsLeft(0);
        setRunning(false);
        playTone(880, 280, curSound);
        speakCoachCue('Treino concluído. Parabéns!', curVoice);
        return;
      }

      // Termina descanso -> inicia próxima série ou próximo exercício diretamente
      playCountdownTick(0, curSound);
      if (curSetIdx < curEx.sets) {
        const nextSet = curSetIdx + 1;
        const dur = getAdjustedDuration(curEx, curItem.stage);
        setIndexRef.current = nextSet;
        phaseRef.current = 'work';
        secondsLeftRef.current = dur;
        setSetIndex(nextSet);
        setPhase('work');
        setSecondsLeft(dur);
        speakCoachCue(`Comece agora. Série ${nextSet}.`, curVoice);
        return;
      }

      const nextIdx = curExIdx + 1;
      if (nextIdx < curQueue.length) {
        const nextEx = curQueue[nextIdx];
        const dur = getAdjustedDuration(nextEx.exercise, nextEx.stage);
        exIndexRef.current = nextIdx;
        setIndexRef.current = 1;
        phaseRef.current = 'work';
        secondsLeftRef.current = dur;
        setExIndex(nextIdx);
        setSetIndex(1);
        setPhase('work');
        setSecondsLeft(dur);
        speakCoachCue(`Próximo exercício. ${nextEx.exercise.name}. Comece agora.`, curVoice);
        return;
      }

      phaseRef.current = 'finished';
      secondsLeftRef.current = 0;
      setPhase('finished');
      setSecondsLeft(0);
      setRunning(false);
      speakCoachCue('Treino concluído. Parabéns!', curVoice);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [running, phase, currentExercise]);

  const autoAdvanceTimerRef = useRef<number | null>(null);

  const completeCurrentWorkStep = () => {
    if (autoAdvanceTimerRef.current) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    setShowInfoSheet(false);
    if (!currentExercise) return;
    playTone(540, 160, soundEnabled);

    if (setIndex < currentExercise.sets) {
      const restSec = getRestSeconds(currentExercise);
      setPhase('rest');
      setSecondsLeft(restSec);
      setRunning(true);
      speakCoachCue(`Descanse por ${restSec} segundos.`, voiceEnabled);
      return;
    }

    if (exIndex + 1 < queue.length) {
      const restSec = getRestSeconds(currentExercise);
      const upcoming = queue[exIndex + 1];
      setPhase('rest');
      setSecondsLeft(restSec);
      setRunning(true);
      speakCoachCue(`Descanse por ${restSec} segundos. Próximo exercício: ${upcoming.exercise.name}.`, voiceEnabled);
      return;
    }

    setPhase('finished');
    setRunning(false);
    playTone(880, 280, soundEnabled);
    speakCoachCue('Treino concluído. Parabéns!', voiceEnabled);
  };

  const completeCurrentWorkStepRef = useRef(completeCurrentWorkStep);
  completeCurrentWorkStepRef.current = completeCurrentWorkStep;

  const handleAnimationRepComplete = (completedReps: number) => {
    if (phaseRef.current !== 'work' || !targetIsRepRef.current) return;
    setExecutedReps(completedReps);
    playTone(680, 65, soundRef.current);
    const targetReps = targetInfo.repCount;
    if (prototypeMode && targetReps && completedReps >= targetReps && !autoAdvanceTimerRef.current) {
      autoAdvanceTimerRef.current = window.setTimeout(() => {
        autoAdvanceTimerRef.current = null;
        completeCurrentWorkStepRef.current();
      }, 320);
    }
  };

  const clearAutoAdvanceTimer = () => {
    if (autoAdvanceTimerRef.current) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  };

  const advanceToNextStep = (isSkipExercise: boolean) => {
    clearAutoAdvanceTimer();
    setShowInfoSheet(false);
    if (!currentExercise) return;

    if (isSkipExercise) {
      setSkippedCount((c) => c + 1);
      if (phase === 'rest') {
        // Durante descanso, pular descanso avança ao próximo exercício/série
        if (setIndex < currentExercise.sets) {
          setSetIndex((s) => s + 1);
          setPhase('work');
          setSecondsLeft(getAdjustedDuration(currentExercise, currentStage));
          setRunning(true);
          return;
        }
      }
      const nextIdx = exIndex + 1;
      if (nextIdx < queue.length) {
        const upcoming = queue[nextIdx];
        setExIndex(nextIdx);
        setSetIndex(1);
        setPhase('work');
        setSecondsLeft(getAdjustedDuration(upcoming.exercise, upcoming.stage));
        setRunning(true);
        speakCoachCue(`Próximo exercício. ${upcoming.exercise.name}.`, voiceEnabled);
      } else {
        setPhase('finished');
        setRunning(false);
        speakCoachCue('Treino concluído. Parabéns!', voiceEnabled);
      }
      return;
    }

    if (phase === 'countdown') {
      playCountdownTick(0, soundEnabled);
      setPhase('work');
      setSecondsLeft(getAdjustedDuration(currentExercise, currentStage));
      setRunning(true);
      speakCoachCue(`Comece agora. ${currentExercise.name}.`, voiceEnabled);
      return;
    }

    if (phase === 'rest') {
      playCountdownTick(0, soundEnabled);
      if (setIndex < currentExercise.sets) {
        setSetIndex((s) => s + 1);
        setPhase('work');
        setSecondsLeft(getAdjustedDuration(currentExercise, currentStage));
        setRunning(true);
        speakCoachCue(`Comece agora.`, voiceEnabled);
      } else if (exIndex + 1 < queue.length) {
        const nextIdx = exIndex + 1;
        const upcoming = queue[nextIdx];
        setExIndex(nextIdx);
        setSetIndex(1);
        setPhase('work');
        setSecondsLeft(getAdjustedDuration(upcoming.exercise, upcoming.stage));
        setRunning(true);
        speakCoachCue(`Próximo exercício. ${upcoming.exercise.name}.`, voiceEnabled);
      } else {
        setPhase('finished');
        setRunning(false);
        speakCoachCue('Treino concluído. Parabéns!', voiceEnabled);
      }
      return;
    }

    completeCurrentWorkStep();
  };

  const goToPreviousExercise = () => {
    clearAutoAdvanceTimer();
    setShowInfoSheet(false);
    if (!currentExercise) return;

    if (setIndex > 1) {
      setSetIndex((s) => s - 1);
      setPhase('work');
      setSecondsLeft(getAdjustedDuration(currentExercise, currentStage));
      setRunning(true);
      speakCoachCue(`Voltando para a série ${setIndex - 1}.`, voiceEnabled);
      return;
    }

    if (exIndex > 0) {
      const prevIdx = exIndex - 1;
      const prevItem = queue[prevIdx];
      setExIndex(prevIdx);
      setSetIndex(1);
      setPhase('work');
      setSecondsLeft(getAdjustedDuration(prevItem.exercise, prevItem.stage));
      setRunning(true);
      speakCoachCue(`Exercício anterior. ${prevItem.exercise.name}.`, voiceEnabled);
      return;
    }

    // Se já está no primeiro exercício, reinicia o tempo/preparação dele
    setPhase('work');
    setSecondsLeft(getAdjustedDuration(currentExercise, currentStage));
    setRunning(true);
  };

  const handleSubstituteExercise = async (replacement: WorkoutExercise) => {
    const item = queue[exIndex];
    if (!item) return;
    setQueue((prev) =>
      prev.map((q, i) => (i === exIndex ? { ...q, exercise: { ...replacement, sets: q.exercise.sets } } : q))
    );
    setShowInfoSheet(false);
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

  const estimatedSessionCalories = useMemo(() => {
    const ratio = Math.max(0.35, (queue.length - skippedCount) / Math.max(1, queue.length));
    return Math.round(Math.max(40, workout.estimated_calories * ratio * (preferences.adaptive_multiplier || 1)));
  }, [queue.length, skippedCount, workout.estimated_calories, preferences.adaptive_multiplier]);

  const handleReset = () => {
    clearAutoAdvanceTimer();
    stopVoiceCoach();
    spokenKeyRef.current = '';
    setSaveError(null);
    setShowInfoSheet(false);
    setModeOverride('auto');
    setExIndex(0);
    setSetIndex(1);
    setPhase('countdown');
    setSecondsLeft(prepCountdown);
    setExecutedReps(0);
    setWorkSecondsElapsed(0);
    setElapsedSeconds(0);
    setSkippedCount(0);
    setRunning(true);
  };

  const handleFinishAndSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const minutes = Math.max(1, Math.round(elapsedSeconds / 60) || workout.duration_minutes);
      await onComplete({
        duration_minutes: minutes,
        calories_burned: estimatedSessionCalories,
        exercises_completed: Math.max(1, queue.length - skippedCount),
        skipped_exercises: skippedCount,
        perceived_difficulty: difficulty,
        warmup_done: queue.some((q) => q.stage === 'warmup'),
        cooldown_done: queue.some((q) => q.stage === 'cooldown'),
        plan_id: planContext?.planId ?? null,
        plan_day_number: planContext?.dayNumber ?? null,
      });
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Não foi possível salvar a sessão. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const isFavorite = currentExercise ? preferences.favorite_exercise_ids.includes(currentExercise.id) : false;
  const substitutes = currentExercise ? findSubstitutesForExercise(currentExercise) : [];

  // Exercício exibido no painel de descanso (próxima série ou próximo exercício)
  const restNextExercise = currentExercise && setIndex < currentExercise.sets ? currentExercise : nextItem?.exercise;
  const restNextStage = currentExercise && setIndex < currentExercise.sets ? currentStage : nextItem?.stage || 'main';
  const restNextTarget = restNextExercise ? parseExerciseTarget(restNextExercise, restNextStage) : { isRepBased: false, repCount: null };
  const restNextStepNumber =
    currentExercise && setIndex < currentExercise.sets ? exIndex + 1 : Math.min(exIndex + 2, queue.length);

  // Círculo de contagem regressiva (PREPARADO PARA COMEÇAR)
  const ringRadius = 46;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const countdownRatio = Math.max(0, Math.min(1, secondsLeft / Math.max(1, prepCountdown)));
  const ringOffset = ringCircumference * (1 - countdownRatio);

  const stageCloseButton = (
    <button
      type="button"
      onClick={() => {
        stopVoiceCoach();
        onClose();
      }}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E6E9EE]/90 text-[#3F4854] shadow-sm transition-colors hover:bg-[#DCE0E7]"
      aria-label="Sair do treino"
      title="Sair do treino"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );

  const currentVote = currentExercise
    ? exerciseVotes[currentExercise.id] || (isFavorite ? 'up' : undefined)
    : undefined;

  const handleStageVote = async (vote: 'up' | 'down') => {
    if (!currentExercise) return;
    const isSame = currentVote === vote;
    setExerciseVotes((prev) => {
      const next = { ...prev };
      if (isSame) delete next[currentExercise.id];
      else next[currentExercise.id] = vote;
      return next;
    });
    if (vote === 'up') {
      const nextFavs = isSame
        ? preferences.favorite_exercise_ids.filter((id) => id !== currentExercise.id)
        : Array.from(new Set([...preferences.favorite_exercise_ids, currentExercise.id]));
      await onUpdatePreferences({ favorite_exercise_ids: nextFavs }).catch(() => {});
    } else if (isFavorite) {
      const nextFavs = preferences.favorite_exercise_ids.filter((id) => id !== currentExercise.id);
      await onUpdatePreferences({ favorite_exercise_ids: nextFavs }).catch(() => {});
    }
  };

  const stageFeedbackButtons = currentExercise ? (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => handleStageVote('down')}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
          currentVote === 'down'
            ? 'bg-rose-500 text-white shadow-sm'
            : 'bg-[#E6E9EE]/90 text-[#4F5864] hover:bg-[#DCE0E7]'
        }`}
        aria-label="Não gostei deste exercício"
        title="Não gostei (ver substituição no guia)"
      >
        <ThumbsDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => handleStageVote('up')}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
          currentVote === 'up'
            ? 'bg-[#00A89B] text-white shadow-sm'
            : 'bg-[#E6E9EE]/90 text-[#4F5864] hover:bg-[#DCE0E7]'
        }`}
        aria-label="Gostei deste exercício"
        title="Gostei / Favoritar exercício"
      >
        <ThumbsUp className="h-4 w-4" />
      </button>
    </div>
  ) : null;

  // Exercício mostrado na ficha de ajuda (?)
  const infoTargetExercise = phase === 'rest' && restNextExercise ? restNextExercise : currentExercise;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2A2A]/55 backdrop-blur-sm sm:p-4">
      <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[88vh] sm:max-h-[780px] sm:max-w-[460px] sm:rounded-3xl sm:border sm:border-[#DCECE6]">
        {phase === 'finished' ? (
          /* TELA DE CONCLUSÃO */
          <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto bg-gradient-to-b from-[#EBF8F2] via-[#F4FBF8] to-white px-6 py-8 pt-safe pb-safe text-center">
            <CheckCircle2 className="h-14 w-14 text-[#12BFA3]" />
            <h4 className="mt-3 font-display text-2xl font-bold text-[#0F2A2A]">Treino concluído. Parabéns!</h4>
            <p className="mt-1.5 max-w-sm text-xs text-[#4B6B68]">
              Sua sessão será salva no histórico e usada para ajustar automaticamente a intensidade dos próximos treinos.
            </p>

            <div className="mt-5 grid w-full grid-cols-3 gap-3 rounded-2xl border border-[#DCECE6] bg-white p-4 shadow-sm">
              <div>
                <p className="text-[11px] font-medium text-[#5C7B79]">Duração</p>
                <p className="mt-1 font-mono text-lg font-bold text-[#0F2A2A] tabular-nums">
                  {Math.max(1, Math.round(elapsedSeconds / 60))} min
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-[#5C7B79]">Exercícios</p>
                <p className="mt-1 font-mono text-lg font-bold text-[#0F2A2A] tabular-nums">
                  {Math.max(1, queue.length - skippedCount)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-[#5C7B79]">Calorias</p>
                <p className="mt-1 font-mono text-lg font-bold text-[#D97706] tabular-nums">
                  ~{estimatedSessionCalories} kcal
                </p>
              </div>
            </div>

            <div className="mt-5 w-full rounded-2xl border border-[#DCECE6] bg-white p-4 text-left shadow-sm">
              <p className="text-xs font-semibold text-[#0F2A2A]">Como você sentiu este treino?</p>
              <p className="mt-0.5 text-[11px] text-[#5C7B79]">Ajusta automaticamente o ritmo das próximas sessões.</p>
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
                    className={`min-h-[42px] rounded-xl border py-2 text-xs font-semibold transition-colors ${
                      difficulty === opt.id
                        ? 'border-[#12BFA3] bg-[#E3F7F2] text-[#0B7C6A]'
                        : 'border-[#DCECE6] bg-[#F4FAF7] text-[#4B6B68] hover:text-[#0F2A2A]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {saveError && (
              <p className="mt-4 w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {saveError}
              </p>
            )}

            <div className="mt-6 flex w-full flex-col gap-2.5">
              {prototypeMode ? (
                <>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="min-h-[48px] w-full rounded-full bg-[#12BFA3] px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#0EA88F]"
                  >
                    Repetir demonstração dos 3 exercícios
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-[44px] w-full rounded-full border border-[#D3E5DF] bg-white px-6 py-2.5 text-xs font-semibold text-[#4B6B68] hover:bg-[#F4FAF7] hover:text-[#0F2A2A]"
                  >
                    Voltar ao painel de treinos
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleFinishAndSave}
                    disabled={saving}
                    className="min-h-[48px] w-full rounded-full bg-[#12BFA3] px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#0EA88F] disabled:opacity-60"
                  >
                    {saving ? 'Salvando evolução...' : 'Concluir e salvar evolução'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-[44px] w-full rounded-full border border-[#D3E5DF] bg-white px-6 py-2.5 text-xs font-semibold text-[#4B6B68] hover:bg-[#F4FAF7] hover:text-[#0F2A2A]"
                  >
                    Fechar sem salvar
                  </button>
                </>
              )}
            </div>
          </div>
        ) : phase === 'rest' && restNextExercise ? (
          /* TELA DE DESCANSO (PRÉVIA ARREDONDADA EM CIMA + PAINEL ESMERALDA EMBAIXO) */
          <div className="flex flex-1 flex-col overflow-hidden bg-[#12BFA3]">
            {/* Prévia visual do próximo exercício com base arredondada flutuante */}
            <div className="relative h-[40%] min-h-[215px] shrink-0 overflow-hidden rounded-b-3xl bg-[#F7F8FA] shadow-md">
              <ExerciseTutorialVideo
                exerciseName={restNextExercise.name}
                muscleGroup={restNextExercise.muscle_group}
                instructions={restNextExercise.instructions}
                explicitArchetype={restNextExercise.demo_archetype}
                correctPosition={restNextExercise.correct_position}
                minimalStage
                frameless
                hideTextGuide
                showControls={false}
                topLeftSlot={stageCloseButton}
                heightClass="h-full"
              />
            </div>

            {/* Painel inferior de descanso com alto contraste */}
            <div className="flex flex-1 flex-col justify-between bg-gradient-to-b from-[#12BFA3] via-[#0EA88F] to-[#0B8773] px-5 pt-4 pb-6 pb-safe text-white">
              {/* Cabeçalho PRÓXIMO + nome + meta */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/85 tabular-nums">
                    PRÓXIMO {restNextStepNumber}/{queue.length}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <h4 className="truncate text-lg font-bold text-white">{restNextExercise.name}</h4>
                    <button
                      type="button"
                      onClick={() => setShowInfoSheet(true)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
                      aria-label="Ver instruções do próximo exercício"
                    >
                      <HelpCircle className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <span className="shrink-0 pt-3 font-mono text-base font-bold text-white tabular-nums">
                  {restNextTarget.isRepBased && restNextTarget.repCount
                    ? `×${restNextTarget.repCount}`
                    : formatMMSS(getAdjustedDuration(restNextExercise, restNextStage))}
                </span>
              </div>

              {/* Cronômetro gigante centralizado + Editar tempo de descanso */}
              <div className="flex flex-col items-center justify-center py-1 text-center">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-white/85">DESCANSO</span>
                <div className="mt-1 font-mono text-6xl font-extrabold tracking-tight text-white tabular-nums sm:text-7xl">
                  {formatMMSS(secondsLeft)}
                </div>

                <button
                  type="button"
                  onClick={() => setShowRestEditor((open) => !open)}
                  className="mt-3 rounded-full bg-white/15 px-5 py-2 text-xs font-semibold text-white/95 backdrop-blur-sm transition-colors hover:bg-white/25"
                >
                  Editar tempo de descanso
                </button>

                {showRestEditor && (
                  <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
                    {[10, 15, 20, 30, 45].map((sec) => {
                      const activePreset = (preferences.rest_seconds || 20) === sec;
                      return (
                        <button
                          key={sec}
                          type="button"
                          onClick={async () => {
                            setSecondsLeft(sec);
                            setShowRestEditor(false);
                            await onUpdatePreferences({ rest_seconds: sec }).catch(() => {});
                          }}
                          className={`min-h-[34px] rounded-full px-3 py-1 font-mono text-xs font-bold transition-colors ${
                            activePreset
                              ? 'bg-white text-[#042423]'
                              : 'bg-white/15 text-white hover:bg-white/25'
                          }`}
                        >
                          {sec}s
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-5 flex w-full max-w-[350px] items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSecondsLeft((s) => s + 20)}
                    className="min-h-[50px] flex-1 rounded-full bg-white/20 px-6 py-3 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/30"
                  >
                    +20s
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowRestEditor(false);
                      advanceToNextStep(false);
                    }}
                    className="min-h-[50px] flex-1 rounded-full bg-white px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-[#042423] shadow-lg transition-colors hover:bg-[#E6FFFC]"
                  >
                    Pular
                  </button>
                </div>
              </div>

              {/* Barra inferior discreta de status do som */}
              <div className="flex items-center justify-center gap-4 text-[11px] text-white/75">
                <button
                  type="button"
                  onClick={handleToggleVoice}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 hover:bg-white/10"
                >
                  {voiceEnabled ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                  {voiceEnabled ? 'Voz ativa' : 'Voz muda'}
                </button>
                <button
                  type="button"
                  onClick={handleToggleSound}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 hover:bg-white/10"
                >
                  {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                  {soundEnabled ? 'Bipes ativos' : 'Sem bipes'}
                </button>
              </div>
            </div>
          </div>
        ) : currentExercise ? (
          /* TELAS DE PREPARAÇÃO ('countdown') E EXECUÇÃO ('work') */
          <div className="flex flex-1 flex-col overflow-hidden bg-white">
            {/* Palco superior claro estilo estúdio (~47% da tela) */}
            <div className="relative h-[47%] min-h-[250px] shrink-0 bg-[#F7F8FA]">
              <ExerciseTutorialVideo
                exerciseName={currentExercise.name}
                muscleGroup={currentExercise.muscle_group}
                instructions={currentExercise.instructions}
                explicitArchetype={currentExercise.demo_archetype}
                correctPosition={currentExercise.correct_position}
                minimalStage
                frameless
                hideTextGuide
                showControls={false}
                onOpenSettings={() => setShowInfoSheet(true)}
                countdownOverlay={
                  phase === 'countdown' && secondsLeft <= 3
                    ? secondsLeft
                    : phase === 'work' && !targetInfo.isRepBased && secondsLeft <= 3
                      ? secondsLeft
                      : null
                }
                topLeftSlot={stageCloseButton}
                bottomRightSlot={stageFeedbackButtons}
                playing={running}
                onTogglePlaying={() => setRunning((r) => !r)}
                onCycleComplete={handleAnimationRepComplete}
                resetSignal={`${phase}-${exIndex}-${setIndex}-${modeOverride}`}
                heightClass="h-full"
              />
            </div>

            {/* Barra de progresso contínua limpa logo abaixo do palco */}
            <div className="h-1 w-full bg-[#E5E7EB]">
              <div
                className="h-full bg-[#00A89B] transition-[width] duration-300 ease-out"
                style={{
                  width: `${Math.max(4, Math.min(100, Math.round(((exIndex + 1) / Math.max(1, queue.length)) * 100)))}%`,
                }}
              />
            </div>

            {phase === 'countdown' ? (
              /* TELA: PREPARADO PARA COMEÇAR */
              <div className="flex flex-1 flex-col items-center justify-between bg-white px-6 pt-5 pb-7 pb-safe text-center">
                <div className="w-full">
                  <p className="font-display text-xl font-extrabold uppercase tracking-wide text-[#009E92] sm:text-2xl">
                    PREPARADO PARA COMEÇAR
                  </p>
                  <div className="mt-2.5 flex items-center justify-center gap-1.5">
                    <h4 className="text-lg font-bold text-[#111827] sm:text-xl">{currentExercise.name}</h4>
                    <button
                      type="button"
                      onClick={() => setShowInfoSheet(true)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#009E92]"
                      aria-label="Ver guia e opções do exercício"
                    >
                      <HelpCircle className="h-5 w-5" />
                    </button>
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-[#6B7280]">
                    {STAGE_LABELS[currentStage]} · {currentExercise.muscle_group}
                    {currentExercise.sets > 1 ? ` · Série ${setIndex}/${currentExercise.sets}` : ''}
                  </p>
                </div>

                {/* Anel circular regressivo + botão ">" para começar */}
                <div className="relative my-2 flex items-center justify-center">
                  <div className="relative flex h-28 w-28 items-center justify-center">
                    <svg viewBox="0 0 108 108" className="h-full w-full -rotate-90">
                      <circle
                        cx="54"
                        cy="54"
                        r={ringRadius}
                        fill="none"
                        stroke="#E5E7EB"
                        strokeWidth="6.5"
                      />
                      <circle
                        cx="54"
                        cy="54"
                        r={ringRadius}
                        fill="none"
                        stroke="#00A89B"
                        strokeWidth="6.5"
                        strokeLinecap="round"
                        strokeDasharray={ringCircumference}
                        strokeDashoffset={ringOffset}
                        className="transition-[stroke-dashoffset] duration-700 ease-linear"
                      />
                    </svg>
                    <span className="absolute font-mono text-4xl font-extrabold text-[#111827] tabular-nums">
                      {secondsLeft}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => advanceToNextStep(false)}
                    className="ml-4 flex h-12 w-12 items-center justify-center rounded-full border border-[#E5E7EB] bg-[#F9FAFB] text-[#111827] transition-colors hover:border-[#00A89B] hover:text-[#009E92]"
                    aria-label="Começar agora"
                    title="Começar agora"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </div>

                <div className="flex items-center gap-3 text-xs text-[#6B7280]">
                  <span>
                    Exercício {exIndex + 1} de {queue.length}
                  </span>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => setShowInfoSheet(true)}
                    className="min-h-[36px] font-semibold text-[#009E92] hover:underline"
                  >
                    Ver postura e opções
                  </button>
                </div>
              </div>
            ) : (
              /* TELA: EXERCÍCIO EM ANDAMENTO ('work') */
              <div className="flex flex-1 flex-col items-center justify-between bg-white px-6 pt-4 pb-6 pb-safe text-center">
                <div className="w-full">
                  <div className="flex items-center justify-center gap-1.5">
                    <h4 className="text-xl font-bold text-[#111827] sm:text-2xl">{currentExercise.name}</h4>
                    <button
                      type="button"
                      onClick={() => setShowInfoSheet(true)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#009E92]"
                      aria-label="Ver instruções e opções"
                    >
                      <HelpCircle className="h-5 w-5" />
                    </button>
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-[#6B7280]">
                    {currentExercise.muscle_group}
                    {currentExercise.sets > 1 ? ` · Série ${setIndex} de ${currentExercise.sets}` : ''}
                  </p>
                </div>

                {/* Display central gigante: contador sincronizado com movimento OU cronômetro + alternador */}
                <div className="flex flex-col items-center justify-center py-1">
                  {targetInfo.isRepBased && targetInfo.repCount && isEachSideExercise && (
                    <p className="mb-1 text-sm font-medium text-[#374151] tabular-nums">
                      Cada Lado × {Math.max(1, Math.round(targetInfo.repCount / 2))}
                    </p>
                  )}

                  {targetInfo.isRepBased && targetInfo.repCount ? (
                    <div className="flex flex-col items-center">
                      <div className="font-mono text-5xl font-extrabold tracking-tight text-[#111827] tabular-nums sm:text-6xl">
                        {Math.min(executedReps, targetInfo.repCount)}
                        <span className="text-3xl font-bold text-[#9CA3AF]"> / {targetInfo.repCount}</span>
                      </div>
                      <p className="mt-1 font-mono text-xs font-semibold text-[#008E83] tabular-nums">
                        Tempo {formatMMSS(workSecondsElapsed)} · Repetições sincronizadas
                      </p>
                    </div>
                  ) : (
                    <div className="font-mono text-6xl font-extrabold tracking-tight text-[#111827] tabular-nums sm:text-7xl">
                      {formatMMSS(secondsLeft)}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const nextMode = targetInfo.isRepBased ? 'time' : 'reps';
                      setModeOverride(nextMode);
                      if (nextMode === 'time') {
                        setSecondsLeft(getAdjustedDuration(currentExercise, currentStage));
                        setRunning(true);
                      }
                    }}
                    className="mt-2 inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#F3F4F6] px-4 py-1.5 text-xs font-semibold text-[#4B5563] transition-colors hover:bg-[#E5E7EB] hover:text-[#111827]"
                    aria-label={targetInfo.isRepBased ? 'Alternar para modo cronômetro' : 'Alternar para modo repetições'}
                  >
                    <span>{targetInfo.isRepBased ? 'Repetições' : 'Tempo'}</span>
                    <ArrowLeftRight className="h-3.5 w-3.5 text-[#6B7280]" />
                  </button>
                </div>

                {/* Dock inferior: [ |< ]  [ ▶ / || ]  [ ✓ ]  [ >| ] */}
                <div className="flex w-full items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={goToPreviousExercise}
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#111827] transition-colors hover:border-[#00A89B]/50 hover:bg-[#F3F4F6]"
                    aria-label="Exercício anterior"
                    title="Exercício anterior"
                  >
                    <SkipBack className="h-5 w-5 fill-current" />
                  </button>

                  {targetInfo.isRepBased ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setRunning((r) => !r)}
                        className="flex h-14 flex-1 max-w-[115px] items-center justify-center gap-1.5 rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-4 text-xs font-bold text-[#111827] transition-colors hover:bg-[#E5E7EB]"
                        aria-label={running ? 'Pausar exercício' : 'Iniciar exercício'}
                        title={running ? 'Pausar' : 'Iniciar'}
                      >
                        {running ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
                        <span>{running ? 'Pausar' : 'Iniciar'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={completeCurrentWorkStep}
                        className="flex h-14 flex-1 max-w-[125px] items-center justify-center gap-1.5 rounded-full bg-[#00A89B] px-4 text-xs font-bold text-white shadow-lg shadow-[#00A89B]/25 transition-colors hover:bg-[#008E83]"
                        aria-label="Concluir série"
                        title="Concluir série"
                      >
                        <Check className="h-5 w-5 stroke-[2.8]" />
                        <span>Concluir</span>
                      </button>
                    </>
                  ) : (
                    (() => {
                      const totalDur = Math.max(1, getAdjustedDuration(currentExercise, currentStage));
                      const pct = Math.max(0, Math.min(100, ((totalDur - secondsLeft) / totalDur) * 100));
                      return (
                        <button
                          type="button"
                          onClick={() => setRunning((r) => !r)}
                          className="relative flex h-14 flex-1 max-w-[230px] items-center justify-center overflow-hidden rounded-full bg-[#F3F4F6] text-[#111827] shadow-sm transition-colors hover:bg-[#E5E7EB]"
                          aria-label={running ? 'Pausar exercício' : 'Retomar exercício'}
                          title={running ? 'Pausar' : 'Continuar'}
                        >
                          <span className="flex items-center justify-center">
                            {running ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current" />}
                          </span>
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#00A89B] text-white transition-[clip-path] duration-700 ease-linear"
                            style={{ clipPath: `inset(0 ${(100 - pct).toFixed(1)}% 0 0)` }}
                          >
                            {running ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current" />}
                          </span>
                        </button>
                      );
                    })()
                  )}

                  <button
                    type="button"
                    onClick={() => advanceToNextStep(true)}
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#111827] transition-colors hover:border-[#00A89B]/50 hover:bg-[#F3F4F6]"
                    aria-label="Próximo exercício"
                    title="Próximo exercício"
                  >
                    <SkipForward className="h-5 w-5 fill-current" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Gaveta / Bottom Sheet de Instruções, Áudio, Favorito e Substituição (?) */}
        {showInfoSheet && infoTargetExercise && (
          <div
            className="absolute inset-0 z-30 flex items-end bg-[#0F2A2A]/45 backdrop-blur-[2px]"
            onClick={() => setShowInfoSheet(false)}
          >
            <div
              className="max-h-[82%] w-full overflow-y-auto rounded-t-3xl border-t border-[#DCECE6] bg-white p-5 pb-safe text-left shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#0C947E]">
                    Guia do exercício
                  </p>
                  <h4 className="mt-0.5 text-lg font-bold text-[#0F2A2A]">{infoTargetExercise.name}</h4>
                  <p className="text-xs font-medium text-[#5C7B79]">
                    {infoTargetExercise.muscle_group} · {infoTargetExercise.reps_or_duration}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleFavorite}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                      isFavorite
                        ? 'border-[#F7E3C4] bg-[#FFF4E2] text-[#D97706]'
                        : 'border-[#D3E5DF] bg-[#F4FAF7] text-[#4B6B68] hover:text-[#0F2A2A]'
                    }`}
                    title={isFavorite ? 'Remover dos favoritos' : 'Marcar como favorito'}
                  >
                    <Star className={`h-4 w-4 ${isFavorite ? 'fill-[#F59E2D] text-[#F59E2D]' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInfoSheet(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] text-[#4B6B68] hover:text-[#0F2A2A]"
                    aria-label="Fechar guia"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-2.5 rounded-2xl border border-[#DCECE6] bg-[#F4FAF7] p-3.5 text-xs">
                {infoTargetExercise.correct_position && (
                  <p className="text-[#2E4A48]">
                    <span className="font-semibold text-[#0C947E]">Posição correta: </span>
                    {infoTargetExercise.correct_position}
                  </p>
                )}
                <p className="leading-relaxed text-[#2E4A48]">
                  <span className="font-semibold text-[#0F2A2A]">Execução: </span>
                  {infoTargetExercise.instructions}
                </p>
                {infoTargetExercise.common_mistakes && (
                  <p className="text-[#4B6B68]">
                    <span className="font-semibold text-[#D97706]">Evite: </span>
                    {infoTargetExercise.common_mistakes}
                  </p>
                )}
              </div>

              {/* Áudio & Controles de Sessão */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleToggleVoice}
                  className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                    voiceEnabled
                      ? 'border-[#12BFA3] bg-[#E3F7F2] text-[#0B7C6A]'
                      : 'border-[#D3E5DF] bg-[#F4FAF7] text-[#4B6B68]'
                  }`}
                >
                  {voiceEnabled ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                  {voiceEnabled ? 'Voz guia: ON' : 'Voz guia: OFF'}
                </button>
                <button
                  type="button"
                  onClick={handleToggleSound}
                  className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                    soundEnabled
                      ? 'border-[#12BFA3] bg-[#E3F7F2] text-[#0B7C6A]'
                      : 'border-[#D3E5DF] bg-[#F4FAF7] text-[#4B6B68]'
                  }`}
                >
                  {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                  {soundEnabled ? 'Bipes: ON' : 'Bipes: OFF'}
                </button>
              </div>

              {/* Substituir exercício atual */}
              {phase !== 'rest' && substitutes.length > 0 && (
                <div className="mt-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-[#0C947E]">
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    Substituir este exercício
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {substitutes.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => handleSubstituteExercise(sub)}
                        className="rounded-xl border border-[#DCECE6] bg-[#F4FAF7] px-3 py-2.5 text-left text-xs text-[#0F2A2A] transition-colors hover:border-[#12BFA3]"
                      >
                        <div className="font-semibold">{sub.name}</div>
                        <div className="text-[11px] text-[#5C7B79]">{sub.muscle_group}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2 border-t border-[#E1EEE9] pt-3.5">
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3 py-2 text-xs font-semibold text-[#2E4A48] hover:bg-[#E7F4EF]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reiniciar treino
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopVoiceCoach();
                    setShowInfoSheet(false);
                    setPhase('finished');
                    setRunning(false);
                  }}
                  className="min-h-[42px] flex-1 rounded-xl bg-[#12BFA3] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0EA88F]"
                >
                  Concluir agora
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
