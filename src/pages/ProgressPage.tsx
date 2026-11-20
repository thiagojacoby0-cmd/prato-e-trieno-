import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Plus, Trash2 } from 'lucide-react';
import { apiRequest } from '../services/apiClient';
import { ProgressPhoto, WeightLog } from '../types';
import { formatDateBR, getTodayISO } from '../utils/nutrition';
import { useAuth } from '../hooks/useAuth';
import { WeightEvolutionChart } from '../components/InteractiveCharts';

export function ProgressPage() {
  const { profile, refreshProfile } = useAuth();
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  // Novo registro de peso e medidas
  const [date, setDate] = useState(getTodayISO());
  const [weightKg, setWeightKg] = useState('');
  const [waistCm, setWaistCm] = useState('');
  const [chestCm, setChestCm] = useState('');
  const [hipCm, setHipCm] = useState('');
  const [armCm, setArmCm] = useState('');
  const [notes, setNotes] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);

  // Nova foto de progresso
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const loadProgress = useCallback(async () => {
    setLoading(true);
    setProgressError(null);
    try {
      const [wRes, pRes] = await Promise.all([
        apiRequest<{ logs: WeightLog[] }>('/api/weight'),
        apiRequest<{ photos: ProgressPhoto[] }>('/api/progress-photos'),
      ]);
      setWeights(wRes.logs);
      setPhotos(pRes.photos);
    } catch (err) {
      setProgressError(err instanceof Error ? err.message : 'Erro ao carregar dados de evolução.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  const handleSaveWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedWeight = Number(weightKg.replace(',', '.'));
    if (!weightKg || !Number.isFinite(parsedWeight) || parsedWeight < 20 || parsedWeight > 300) {
      setProgressError('Informe um peso válido entre 20 kg e 300 kg.');
      return;
    }
    const parseOpt = (val: string) => {
      if (!val.trim()) return null;
      const n = Number(val.replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    setSavingWeight(true);
    setProgressError(null);
    try {
      await apiRequest('/api/weight', {
        method: 'POST',
        body: JSON.stringify({
          date,
          weight_kg: parsedWeight,
          waist_cm: parseOpt(waistCm),
          chest_cm: parseOpt(chestCm),
          hip_cm: parseOpt(hipCm),
          arm_cm: parseOpt(armCm),
          notes,
        }),
      });
      setWeightKg('');
      setWaistCm('');
      setChestCm('');
      setHipCm('');
      setArmCm('');
      setNotes('');
      await Promise.all([loadProgress(), refreshProfile()]);
    } catch (err) {
      setProgressError(err instanceof Error ? err.message : 'Erro ao salvar registro corporal.');
    } finally {
      setSavingWeight(false);
    }
  };

  const handleDeleteWeight = async (id: string) => {
    setProgressError(null);
    try {
      await apiRequest(`/api/weight/${id}`, { method: 'DELETE' });
      setWeights((prev) => prev.filter((w) => w.id !== id));
      await refreshProfile().catch(() => {});
    } catch (err) {
      setProgressError(err instanceof Error ? err.message : 'Erro ao excluir registro de peso.');
    }
  };

  const handleUploadPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoFile) return;
    setUploadingPhoto(true);
    setProgressError(null);
    try {
      const formData = new FormData();
      formData.append('file', photoFile);
      formData.append('folder', 'progress');
      const uploadRes = await apiRequest<{ url: string }>('/api/storage/upload', {
        method: 'POST',
        body: formData,
      });

      const saved = await apiRequest<{ photo: ProgressPhoto }>('/api/progress-photos', {
        method: 'POST',
        body: JSON.stringify({
          date: getTodayISO(),
          weight_kg: profile?.current_weight_kg ?? null,
          caption: photoCaption.trim() || 'Registro de evolução',
          image_url: uploadRes.url,
        }),
      });

      setPhotos((prev) => [saved.photo, ...prev]);
      setPhotoFile(null);
      setPhotoCaption('');
      if (photoInputRef.current) {
        photoInputRef.current.value = '';
      }
    } catch (err) {
      setProgressError(err instanceof Error ? err.message : 'Erro ao enviar foto de evolução.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async (id: string) => {
    setProgressError(null);
    try {
      await apiRequest(`/api/progress-photos/${id}`, { method: 'DELETE' });
      setPhotos((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setProgressError(err instanceof Error ? err.message : 'Erro ao excluir foto de evolução.');
    }
  };

  return (
    <div className="space-y-6">
      {progressError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {progressError}
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Form Peso e Medidas */}
        <form
          onSubmit={handleSaveWeight}
          className="space-y-4 rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] lg:col-span-5"
        >
          <div>
            <h2 className="font-display text-lg font-semibold text-[#0F2A2A]">Registrar peso e medidas</h2>
            <p className="mt-1 text-xs text-[#5C7B79]">
              Acompanhe a evolução semanal em jejum para leitura precisa da tendência.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#2E4A48]">Data</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3 py-2 font-mono text-xs text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#2E4A48]">Peso (kg)</label>
              <input
                type="number"
                step="0.1"
                required
                placeholder={profile?.current_weight_kg.toFixed(1)}
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3 py-2 font-mono text-sm text-[#0F2A2A] placeholder-[#7C9A98] focus:border-[#12BFA3] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[#5C7B79]">Cintura (cm)</label>
              <input
                type="number"
                step="0.1"
                value={waistCm}
                onChange={(e) => setWaistCm(e.target.value)}
                className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-2 font-mono text-xs text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[#5C7B79]">Peito (cm)</label>
              <input
                type="number"
                step="0.1"
                value={chestCm}
                onChange={(e) => setChestCm(e.target.value)}
                className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-2 font-mono text-xs text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[#5C7B79]">Quadril (cm)</label>
              <input
                type="number"
                step="0.1"
                value={hipCm}
                onChange={(e) => setHipCm(e.target.value)}
                className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-2 font-mono text-xs text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[#5C7B79]">Braço (cm)</label>
              <input
                type="number"
                step="0.1"
                value={armCm}
                onChange={(e) => setArmCm(e.target.value)}
                className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-2 font-mono text-xs text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[#2E4A48]">Observações</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Pesagem matinal em jejum"
              className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3 py-2 text-xs text-[#0F2A2A] placeholder-[#7C9A98] focus:border-[#12BFA3] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={savingWeight}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#12BFA3] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0EA88F] disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {savingWeight ? 'Salvando...' : 'Salvar registro'}
          </button>
        </form>

        {/* Chart */}
        <section className="rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] lg:col-span-7">
          <h3 className="mb-4 font-display text-lg font-semibold text-[#0F2A2A]">Histórico de peso corporal</h3>
          <WeightEvolutionChart
            data={weights}
            targetWeight={profile?.target_weight_kg || 70}
          />
        </section>
      </div>

      {/* Measurements Table */}
      <section className="rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)]">
        <h3 className="font-display text-lg font-semibold text-[#0F2A2A]">Tabela de registros corporais</h3>
        {loading ? (
          <div className="mt-4 h-28 animate-pulse rounded-xl bg-[#EDF7F3]" />
        ) : weights.length === 0 ? (
          <p className="mt-3 text-sm text-[#5C7B79]">Nenhum registro de peso encontrado.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E1EEE9] text-xs text-[#5C7B79]">
                  <th className="py-2 pr-4 font-medium">Data</th>
                  <th className="py-2 pr-4 text-right font-medium">Peso</th>
                  <th className="py-2 pr-4 text-right font-medium">Cintura</th>
                  <th className="py-2 pr-4 text-right font-medium">Peito</th>
                  <th className="py-2 pr-4 text-right font-medium">Quadril</th>
                  <th className="py-2 pr-4 text-right font-medium">Braço</th>
                  <th className="py-2 pr-4 font-medium">Notas</th>
                  <th className="py-2 text-right font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF5F2]">
                {[...weights].reverse().map((w) => (
                  <tr key={w.id} className="transition-colors hover:bg-[#F4FAF7]/60">
                    <td className="py-2.5 pr-4 font-mono text-xs text-[#4B6B68] tabular-nums">
                      {formatDateBR(w.date)}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-xs font-semibold text-[#0F2A2A] tabular-nums">
                      {w.weight_kg.toFixed(1)} kg
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-xs text-[#4B6B68] tabular-nums">
                      {w.waist_cm ? `${w.waist_cm} cm` : '—'}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-xs text-[#4B6B68] tabular-nums">
                      {w.chest_cm ? `${w.chest_cm} cm` : '—'}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-xs text-[#4B6B68] tabular-nums">
                      {w.hip_cm ? `${w.hip_cm} cm` : '—'}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-xs text-[#4B6B68] tabular-nums">
                      {w.arm_cm ? `${w.arm_cm} cm` : '—'}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-[#5C7B79]">{w.notes || '—'}</td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteWeight(w.id)}
                        className="rounded-lg p-1.5 text-[#7C9A98] transition-colors hover:bg-red-50 hover:text-red-600"
                        aria-label="Excluir registro"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Progress Photos Gallery */}
      <section className="rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)]">
        <div className="flex flex-col justify-between gap-4 border-b border-[#E1EEE9] pb-5 sm:flex-row sm:items-end">
          <div>
            <h3 className="font-display text-lg font-semibold text-[#0F2A2A]">Galeria de fotos de evolução</h3>
            <p className="mt-1 text-xs text-[#5C7B79]">
              Armazenamento seguro na sua conta para acompanhar sua mudança visual ao longo das semanas.
            </p>
          </div>

          <form onSubmit={handleUploadPhoto} className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2 text-xs font-medium text-[#2E4A48] transition-colors hover:bg-[#E7F4EF]">
              <Camera className="h-4 w-4 text-[#0C947E]" />
              <span>{photoFile ? photoFile.name : 'Selecionar imagem'}</span>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
            <input
              type="text"
              value={photoCaption}
              onChange={(e) => setPhotoCaption(e.target.value)}
              placeholder="Legenda (ex: Semana 4)"
              className="rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3 py-2 text-xs text-[#0F2A2A] placeholder-[#7C9A98] focus:border-[#12BFA3] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!photoFile || uploadingPhoto}
              className="rounded-xl bg-[#12BFA3] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0EA88F] disabled:opacity-50"
            >
              {uploadingPhoto ? 'Enviando...' : 'Enviar foto'}
            </button>
          </form>
        </div>

        {photos.length === 0 ? (
          <p className="mt-5 text-sm text-[#5C7B79]">
            Nenhuma foto enviada ainda. Selecione uma imagem acima para registrar seu ponto de partida.
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo) => (
              <div key={photo.id} className="overflow-hidden rounded-2xl border border-[#DCECE6] bg-[#F4FAF7]">
                <img
                  src={photo.image_url}
                  alt={photo.caption}
                  referrerPolicy="no-referrer"
                  className="h-48 w-full object-cover"
                />
                <div className="flex items-center justify-between p-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-[#0F2A2A]">{photo.caption}</p>
                    <p className="font-mono text-[11px] text-[#5C7B79] tabular-nums">
                      {formatDateBR(photo.date)}
                      {photo.weight_kg ? ` · ${photo.weight_kg.toFixed(1)} kg` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(photo.id)}
                    className="rounded-lg p-1.5 text-[#7C9A98] transition-colors hover:bg-red-50 hover:text-red-600"
                    aria-label="Excluir foto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
