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
  playing?: boolean;
  onTogglePlaying?: () => void;
  heightClass?: string;
  stepCounterLabel?: string;
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
  playing,
  onTogglePlaying,
  heightClass,
  stepCounterLabel,
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
            // Se o catálogo local já tem um arquétipo específico conhecido, preserva-o caso a IA retorne custom/genérico
            archetype:
              explicitArchetype && res.spec.archetype === 'custom'
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

  return (
    <div className="space-y-3 text-left">
      {viewMode === 'vector' ? (
        <VectorExerciseDemo
          exerciseName={exerciseName}
          muscleGroup={muscleGroup}
          spec={spec}
          correctPosition={correctPosition}
          playing={playing}
          onTogglePlaying={onTogglePlaying}
          onSwitchTo3D={() => setViewMode('3d')}
          heightClass={effectiveHeight}
          stepCounterLabel={stepCounterLabel}
        />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[#9AA8A0]">Visualização 3D interativa</span>
            <button
              type="button"
              onClick={() => setViewMode('vector')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#22C55E]/40 bg-[#22C55E]/15 px-2.5 py-1 text-xs font-medium text-[#22C55E] hover:bg-[#22C55E]/25"
            >
              <Users className="h-3.5 w-3.5" />
              Voltar à ilustração animada
            </button>
          </div>
          <ThreeExerciseDemo
            exerciseName={exerciseName}
            muscleGroup={muscleGroup}
            spec={spec}
            playing={playing}
            onTogglePlaying={onTogglePlaying}
            heightClass={effectiveHeight}
          />
        </div>
      )}

      {!hideTextGuide && (
        <div className="rounded-xl border border-white/8 bg-[#121915] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[#22C55E]">
              Guia anatômico &amp; postura correta
            </p>
            <span className="inline-flex items-center gap-1 text-[11px] text-[#8F9E95]">
              <Sparkles className="h-3 w-3 text-[#22C55E]" />
              {loadingAI ? 'Refinando com IA...' : aiEnriched ? 'Personalizado por IA' : 'Demonstração anatômica'}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {(targetMuscles && targetMuscles.length > 0 ? targetMuscles : spec.target_zones).map((zone) => (
              <span
                key={zone}
                className="rounded-md border border-[#22C55E]/25 bg-[#22C55E]/10 px-2 py-0.5 text-[11px] font-medium text-[#22C55E]"
              >
                {MUSCLE_ZONE_LABELS[zone.toLowerCase()] || zone}
              </span>
            ))}
          </div>

          <p className="mt-2.5 text-xs text-[#C2CCC6]">
            <span className="font-semibold text-[#F4F7F5]">Posição correta: </span>
            {correctPosition || spec.preparation}
          </p>

          <ol className="mt-2 space-y-1 text-xs text-[#C2CCC6]">
            {spec.steps.map((step, idx) => (
              <li key={idx}>
                <span className="font-mono text-[#22C55E]">{idx + 1}. </span>
                {step}
              </li>
            ))}
          </ol>

          <div className="mt-2.5 grid gap-2 border-t border-white/8 pt-2.5 text-xs sm:grid-cols-2">
            <p className="text-[#9AA8A0]">
              <span className="font-medium text-[#F4F7F5]">Respiração: </span>
              {spec.breathing}
            </p>
            <p className="text-[#9AA8A0]">
              <span className="font-medium text-amber-300">Erros comuns: </span>
              {commonMistakes || spec.common_mistake}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
