import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Users } from 'lucide-react';
import type { ExerciseTutorialSpec, TutorialArchetype } from '../types';
import { apiRequest } from '../services/apiClient';
import { buildLocalTutorialSpec } from '../utils/exerciseTutorials';
import { ThreeExerciseDemo } from './ThreeExerciseDemo';
import { VectorExerciseDemo } from './VectorExerciseDemo';

interface ExerciseTutorialVideoProps {
  exerciseName: string;
  muscleGroup: string;
  instructions: string;
  explicitArchetype?: TutorialArchetype;
  correctPosition?: string;
  commonMistakes?: string;
  targetMuscles?: string[];
  compact?: boolean;
  hideTextGuide?: boolean;
  minimalStage?: boolean;
  frameless?: boolean;
  showControls?: boolean;
  countdownOverlay?: number | null;
  topLeftSlot?: React.ReactNode;
  bottomRightSlot?: React.ReactNode;
  playing?: boolean;
  onTogglePlaying?: () => void;
  heightClass?: string;
  stepCounterLabel?: string;
  onOpenSettings?: () => void;
  onCycleComplete?: (completedReps: number) => void;
  resetSignal?: string | number;
}

const MUSCLE_ZONE_LABELS: Record<string, string> = {
  quadriceps: 'Quadríceps',
  glutes: 'Glúteos',
  abs: 'Abdômen',
  core: 'Core / Estabilizadores',
  chest: 'Peitoral',
  shoulders: 'Ombros / Deltoides',
  back: 'Costas / Dorsais',
  arms: 'Braços (Bíceps / Tríceps)',
  legs: 'Membros Inferiores',
  calves: 'Panturrilhas',
};

export function ExerciseTutorialVideo({
  exerciseName,
  muscleGroup,
  instructions,
  explicitArchetype,
  correctPosition,
  commonMistakes,
  targetMuscles,
  compact = false,
  hideTextGuide = false,
  minimalStage = false,
  frameless = false,
  showControls = true,
  countdownOverlay = null,
  topLeftSlot,
  bottomRightSlot,
  playing,
  onTogglePlaying,
  heightClass,
  stepCounterLabel,
  onOpenSettings,
  onCycleComplete,
  resetSignal,
}: ExerciseTutorialVideoProps) {
  const localFallback = useMemo(
    () => buildLocalTutorialSpec(exerciseName, muscleGroup, instructions, explicitArchetype),
    [exerciseName, muscleGroup, instructions, explicitArchetype]
  );

  const [spec, setSpec] = useState<ExerciseTutorialSpec>(localFallback);
  const [aiEnriched, setAiEnriched] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [viewMode, setViewMode] = useState<'vector' | '3d'>('vector');

  // Sincroniza modelo local imediato e enriquece com Gemini quando disponível
  useEffect(() => {
    setSpec(localFallback);
    setAiEnriched(false);

    let cancelled = false;
    setLoadingAI(true);
    apiRequest<{ spec: ExerciseTutorialSpec }>('/api/ai/exercise-tutorial', {
      method: 'POST',
      body: JSON.stringify({
        exercise_name: exerciseName,
        muscle_group: muscleGroup,
        instructions,
      }),
    })
      .then((res) => {
        if (!cancelled && res.spec) {
          setSpec((prev) => ({
            ...res.spec,
            // Se o catálogo local já tem um arquétipo específico conhecido, preserva-o sobre a sugestão da IA
            archetype:
              explicitArchetype && explicitArchetype !== 'custom'
                ? explicitArchetype
                : res.spec.archetype || prev.archetype,
            target_zones:
              targetMuscles && targetMuscles.length > 0
                ? targetMuscles
                : res.spec.target_zones,
          }));
          setAiEnriched(true);
        }
      })
      .catch(() => {
        // Fallback local já contém o modelo completo
      })
      .finally(() => {
        if (!cancelled) setLoadingAI(false);
      });

    return () => {
      cancelled = true;
    };
  }, [exerciseName, muscleGroup, instructions, explicitArchetype, targetMuscles, localFallback]);

  const effectiveHeight = heightClass || (compact ? 'h-56 sm:h-64' : 'h-72 sm:h-80');
  const isFullHeight = frameless || effectiveHeight === 'h-full';

  return (
    <div className={isFullHeight ? 'flex h-full min-h-0 flex-col text-left' : 'space-y-3 text-left'}>
      {viewMode === 'vector' ? (
        <VectorExerciseDemo
          exerciseName={exerciseName}
          muscleGroup={muscleGroup}
          spec={spec}
          correctPosition={correctPosition}
          playing={playing}
          onTogglePlaying={onTogglePlaying}
          onSwitchTo3D={() => setViewMode('3d')}
          onOpenSettings={onOpenSettings}
          showControls={showControls}
          minimalStage={minimalStage}
          frameless={frameless}
          countdownOverlay={countdownOverlay}
          topLeftSlot={topLeftSlot}
          bottomRightSlot={bottomRightSlot}
          heightClass={effectiveHeight}
          stepCounterLabel={stepCounterLabel}
          onCycleComplete={onCycleComplete}
          resetSignal={resetSignal}
        />
      ) : (
        <div className={isFullHeight ? 'relative flex h-full min-h-0 flex-col' : 'relative'}>
          {topLeftSlot && minimalStage && (
            <div className="absolute left-3.5 top-3 z-20">{topLeftSlot}</div>
          )}
          {bottomRightSlot && minimalStage && (
            <div className="absolute bottom-3 right-3.5 z-20">{bottomRightSlot}</div>
          )}
          <div className={minimalStage ? 'absolute right-3.5 top-3 z-20' : 'mb-2 flex items-center justify-between'}>
            {!minimalStage && <span className="text-[11px] font-medium text-[#5C7B79]">Visualização 3D interativa</span>}
            <button
              type="button"
              onClick={() => setViewMode('vector')}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-[#BFE6DC] bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#0C947E] shadow-sm backdrop-blur hover:bg-[#EDF9F5]"
            >
              <Users className="h-3.5 w-3.5" />
              {minimalStage ? '2D' : 'Voltar à ilustração animada'}
            </button>
          </div>
          <ThreeExerciseDemo
            exerciseName={exerciseName}
            muscleGroup={muscleGroup}
            spec={spec}
            playing={playing}
            onTogglePlaying={onTogglePlaying}
            showControls={showControls}
            heightClass={effectiveHeight}
          />
        </div>
      )}

      {!hideTextGuide && (
        <div className="rounded-2xl border border-[#DCECE6] bg-[#F4FAF7] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[#0C947E]">
              Guia anatômico &amp; postura correta
            </p>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#5C7B79]">
              <Sparkles className="h-3 w-3 text-[#12BFA3]" />
              {loadingAI ? 'Refinando com IA...' : aiEnriched ? 'Personalizado por IA' : 'Demonstração anatômica'}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {(targetMuscles && targetMuscles.length > 0 ? targetMuscles : spec.target_zones).map((zone) => (
              <span
                key={zone}
                className="rounded-lg border border-[#BCE6DC] bg-[#E3F7F2] px-2.5 py-0.5 text-[11px] font-semibold text-[#0B7C6A]"
              >
                {MUSCLE_ZONE_LABELS[zone.toLowerCase()] || zone}
              </span>
            ))}
          </div>

          <p className="mt-2.5 text-xs text-[#2E4A48]">
            <span className="font-semibold text-[#0F2A2A]">Posição correta: </span>
            {correctPosition || spec.preparation}
          </p>

          <ol className="mt-2 space-y-1 text-xs text-[#2E4A48]">
            {spec.steps.map((step, idx) => (
              <li key={idx}>
                <span className="font-mono font-semibold text-[#0C947E]">{idx + 1}. </span>
                {step}
              </li>
            ))}
          </ol>

          <div className="mt-2.5 grid gap-2 border-t border-[#DCECE6] pt-2.5 text-xs sm:grid-cols-2">
            <p className="text-[#4B6B68]">
              <span className="font-semibold text-[#0F2A2A]">Respiração: </span>
              {spec.breathing}
            </p>
            <p className="text-[#4B6B68]">
              <span className="font-semibold text-[#D97706]">Erros comuns: </span>
              {commonMistakes || spec.common_mistake}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
