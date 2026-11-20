import type { NutritionBackupPayload } from '../types';
import { getCachedProfile } from '../services/apiClient';
import { buildMealContentSignature, sanitizeNutritionBackup } from './nutritionHistory';

const MIRROR_KEY_PREFIX = 'prato_treino_nutrition_mirror_v1';

function getMirrorStorageKey(userKey?: string): string {
  const resolved = userKey?.trim() || getCachedProfile()?.id || getCachedProfile()?.email || 'default';
  return `${MIRROR_KEY_PREFIX}_${resolved}`;
}

export function readLocalNutritionMirror(userKey?: string): NutritionBackupPayload | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(getMirrorStorageKey(userKey));
    if (!raw) return null;
    return sanitizeNutritionBackup(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function overwriteLocalNutritionMirror(backup: NutritionBackupPayload, userKey?: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(getMirrorStorageKey(userKey), JSON.stringify(backup));
  } catch {
    // Ignora caso localStorage esteja cheio ou indisponível
  }
}

export interface MirrorSyncCheckResult {
  mirror: NutritionBackupPayload | null;
  missingOnServer: boolean;
  missingMealsCount: number;
}

/**
 * Sincroniza a cópia local de segurança no aparelho com o backup do servidor.
 * NUNCA sobrescreve a cópia local quando o servidor parecer zerado ou incompleto
 * (faltam >= 3 refeições E >= 30% das refeições salvas no aparelho).
 */
export function syncLocalNutritionMirror(
  serverBackup: NutritionBackupPayload,
  userKey?: string
): MirrorSyncCheckResult {
  const localMirror = readLocalNutritionMirror(userKey);

  if (localMirror && localMirror.meals.length > 0) {
    const serverIds = new Set(serverBackup.meals.map((m) => m.id).filter(Boolean));
    const serverSigs = new Set(serverBackup.meals.map((m) => buildMealContentSignature(m)));

    let missingMealsCount = 0;
    for (const localMeal of localMirror.meals) {
      const hasById = Boolean(localMeal.id && serverIds.has(localMeal.id));
      const hasBySig = serverSigs.has(buildMealContentSignature(localMeal));
      if (!hasById && !hasBySig) {
        missingMealsCount += 1;
      }
    }

    const ratio = missingMealsCount / localMirror.meals.length;
    if (missingMealsCount >= 3 && ratio >= 0.3) {
      return {
        mirror: localMirror,
        missingOnServer: true,
        missingMealsCount,
      };
    }
  }

  overwriteLocalNutritionMirror(serverBackup, userKey);
  return {
    mirror: serverBackup,
    missingOnServer: false,
    missingMealsCount: 0,
  };
}
