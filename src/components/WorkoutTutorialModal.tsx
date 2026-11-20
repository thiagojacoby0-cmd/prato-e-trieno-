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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2A2A]/50 p-3 backdrop-blur-sm sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[#DCECE6] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#E1EEE9] px-5 py-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-[#0C947E]">
              <Film className="h-3.5 w-3.5" />
              Demonstrações 3D · Aquecimento, Principais e Alongamento
            </p>
            <h3 className="mt-0.5 text-lg font-bold text-[#0F2A2A]">{workout.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] p-2 text-[#4B6B68] transition-colors hover:bg-[#E7F4EF] hover:text-[#0F2A2A]"
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
                className={`shrink-0 rounded-2xl border px-3 py-2 text-left text-xs transition-colors ${
                  idx === selectedIdx
                    ? 'border-[#12BFA3] bg-[#E3F7F2] text-[#0F2A2A] shadow-sm'
                    : 'border-[#DCECE6] bg-[#F4FAF7] text-[#4B6B68] hover:border-[#B6DCD1] hover:text-[#0F2A2A]'
                }`}
              >
                <span className="block text-[10px] font-semibold text-[#0C947E]">{item.stage}</span>
                <span className="font-semibold">
                  {idx + 1}. {item.ex.name}
                </span>
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#DCECE6] bg-[#F4FAF7] px-4 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-[#E3F7F2] px-2 py-0.5 text-[11px] font-semibold text-[#0B7C6A]">
                {stage}
              </span>
              <span className="font-bold text-[#0F2A2A]">{ex.name}</span>
              <span className="text-[#7C9A98]">·</span>
              <span className="text-[#4B6B68]">{ex.muscle_group}</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold text-[#0C947E] tabular-nums">
                {ex.sets}x · {ex.reps_or_duration}
              </span>
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={() => onToggleFavorite(ex.id)}
                  className={`rounded-xl border p-1.5 transition-colors ${
                    isFav
                      ? 'border-[#F7E3C4] bg-[#FFF4E2] text-[#D97706]'
                      : 'border-[#D3E5DF] bg-white text-[#5C7B79] hover:text-[#0F2A2A]'
                  }`}
                  title={isFav ? 'Remover dos favoritos' : 'Favoritar exercício'}
                >
                  <Star className={`h-3.5 w-3.5 ${isFav ? 'fill-[#F59E2D] text-[#F59E2D]' : ''}`} />
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

        <div className="flex items-center justify-between gap-3 border-t border-[#E1EEE9] bg-[#F4FAF7] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#D3E5DF] bg-white px-4 py-2 text-xs font-semibold text-[#2E4A48] transition-colors hover:bg-[#EDF7F3]"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onStartWorkout();
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#12BFA3] px-5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#0EA88F]"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Iniciar treino guiado
          </button>
        </div>
      </div>
    </div>
  );
}
