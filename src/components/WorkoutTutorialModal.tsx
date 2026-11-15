import React, { useMemo, useState } from 'react';
import { Film, Play, Star, X } from 'lucide-react';
import type { WorkoutExercise, WorkoutProgram } from '../types';
import { ExerciseTutorialVideo } from './ExerciseTutorialVideo';

interface WorkoutTutorialModalProps {
  workout: WorkoutProgram;
  favoriteIds?: string[];
  onToggleFavorite?: (exerciseId: string) => void;
  onClose: () => void;
  onStartWorkout: () => void;
}

export function WorkoutTutorialModal({
  workout,
  favoriteIds = [],
  onToggleFavorite,
  onClose,
  onStartWorkout,
}: WorkoutTutorialModalProps) {
  const allItems = useMemo(() => {
    const list: Array<{ stage: 'Aquecimento' | 'Principal' | 'Alongamento'; ex: WorkoutExercise }> = [];
    (workout.warmup || []).forEach((ex) => list.push({ stage: 'Aquecimento', ex }));
    (workout.exercises || []).forEach((ex) => list.push({ stage: 'Principal', ex }));
    (workout.cooldown || []).forEach((ex) => list.push({ stage: 'Alongamento', ex }));
    return list;
  }, [workout]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const activeItem = allItems[selectedIdx] || allItems[0];

  if (!activeItem) return null;

  const { ex, stage } = activeItem;
  const isFav = favoriteIds.includes(ex.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111613] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-[#22C55E]">
              <Film className="h-3.5 w-3.5" />
              Demonstrações 3D · Aquecimento, Principais e Alongamento
            </p>
            <h3 className="mt-0.5 text-lg font-semibold text-[#F4F7F5]">{workout.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 p-2 text-[#9AA8A0] transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Fechar tutoriais"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Seletor por fase + exercício */}
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {allItems.map((item, idx) => (
              <button
                key={`${item.stage}-${item.ex.id}-${idx}`}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                  idx === selectedIdx
                    ? 'border-[#22C55E] bg-[#22C55E]/15 text-[#F4F7F5]'
                    : 'border-white/8 bg-[#0C100E] text-[#9AA8A0] hover:border-white/20 hover:text-white'
                }`}
              >
                <span className="block text-[10px] font-medium text-[#22C55E]">{item.stage}</span>
                <span className="font-medium">
                  {idx + 1}. {item.ex.name}
                </span>
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/8 bg-[#0C100E] px-4 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-[#22C55E]/15 px-2 py-0.5 text-[11px] font-medium text-[#22C55E]">
                {stage}
              </span>
              <span className="font-semibold text-[#F4F7F5]">{ex.name}</span>
              <span className="text-[#8F9E95]">·</span>
              <span className="text-[#9AA8A0]">{ex.muscle_group}</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="font-mono text-[#22C55E] tabular-nums">
                {ex.sets}x · {ex.reps_or_duration}
              </span>
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={() => onToggleFavorite(ex.id)}
                  className={`rounded-lg border p-1.5 transition-colors ${
                    isFav
                      ? 'border-amber-400/50 bg-amber-400/15 text-amber-300'
                      : 'border-white/10 text-[#8F9E95] hover:text-white'
                  }`}
                  title={isFav ? 'Remover dos favoritos' : 'Favoritar exercício'}
                >
                  <Star className={`h-3.5 w-3.5 ${isFav ? 'fill-amber-300' : ''}`} />
                </button>
              )}
            </div>
          </div>

          <ExerciseTutorialVideo
            exerciseName={ex.name}
            muscleGroup={ex.muscle_group}
            instructions={ex.instructions}
            explicitArchetype={ex.demo_archetype}
            correctPosition={ex.correct_position}
            commonMistakes={ex.common_mistakes}
            targetMuscles={ex.target_muscles}
            stepCounterLabel={`${selectedIdx + 1}/${allItems.length}`}
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/8 bg-[#0D120F] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-[#C2CCC6] transition-colors hover:bg-white/5"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onStartWorkout();
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#22C55E] px-5 py-2 text-xs font-semibold text-[#06120A] transition-colors hover:bg-[#16A34A]"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Iniciar treino guiado
          </button>
        </div>
      </div>
    </div>
  );
}
