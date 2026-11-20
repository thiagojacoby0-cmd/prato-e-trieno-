import type { MealFoodItem } from '../types/index.ts';

export type MealMeasureUnit = 'porcao' | 'unidade' | 'copo' | 'colher' | 'fatia' | 'prato';

export const MEASURE_UNIT_LABELS: Record<MealMeasureUnit, { singular: string; plural: string }> = {
  porcao: { singular: 'porção', plural: 'porções' },
  unidade: { singular: 'unidade', plural: 'unidades' },
  copo: { singular: 'copo', plural: 'copos' },
  colher: { singular: 'colher', plural: 'colheres' },
  fatia: { singular: 'fatia', plural: 'fatias' },
  prato: { singular: 'prato', plural: 'pratos' },
};

export const TACO_TBCA_DISCLAIMER =
  'Valores aproximados baseados nas tabelas TACO e TBCA; quando não encontrados na TACO, são calculados com fontes nutricionais extras (USDA, IBGE, rótulos e composição dos ingredientes).';

export function formatMeasureLabel(unit: MealMeasureUnit, qty: number): string {
  const entry = MEASURE_UNIT_LABELS[unit] || MEASURE_UNIT_LABELS.porcao;
  return Math.abs(qty - 1) < 0.01 ? entry.singular : entry.plural;
}

export function formatFoodItemSummary(item: MealFoodItem): string {
  if (item.data_available === false) {
    return `${item.name} — Não identificado`;
  }
  const portion =
    item.portion && item.reference_portion && item.portion !== item.reference_portion && !item.portion.includes(item.reference_portion)
      ? `${item.portion} (ref.: ${item.reference_portion})`
      : item.portion || item.reference_portion || 'Porção padrão';
  const fiber = typeof item.fiber_g === 'number' ? item.fiber_g : 0;
  const sourceBadge = item.source ? ` [${item.source}]` : '';
  return `${item.name}${sourceBadge} — Porção: ${portion} | ${Math.round(item.calories)} kcal | Carbo: ${item.carbs_g}g | Prot: ${item.protein_g}g | Gord: ${item.fat_g}g | Fibra: ${fiber}g`;
}

/**
 * Base nutricional principal segundo TACO (4ª ed. UNICAMP) e TBCA (USP),
 * ampliada com referências complementares (USDA FoodData Central, IBGE/POF e rótulos médios)
 * para alimentos e preparações ausentes da tabela TACO.
 */
interface FoodNutritionEntry {
  keywords: string[];
  displayName: string;
  source: 'TACO' | 'TBCA' | 'USDA' | 'IBGE' | 'Referência' | 'Cálculo IA';
  referencePortion: string;
  referenceGrams: number;
  defaultUnit: MealMeasureUnit;
  defaultUnitGrams: number;
  // Valores na porção de referência (`referenceGrams`)
  calories: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  fiber_g: number;
  // Equivalências em gramas/ml por medida caseira
  unitGrams?: Partial<Record<MealMeasureUnit, number>>;
  isLiquid?: boolean;
}

const FOOD_DB: FoodNutritionEntry[] = [
  {
    keywords: ['arroz integral'],
    displayName: 'Arroz integral cozido',
    source: 'TACO',
    referencePortion: '4 colheres de sopa (100g)',
    referenceGrams: 100,
    defaultUnit: 'colher',
    defaultUnitGrams: 25,
    calories: 124,
    carbs_g: 25.8,
    protein_g: 2.6,
    fat_g: 1.0,
    fiber_g: 2.7,
    unitGrams: { colher: 25, copo: 160, prato: 200, porcao: 100 },
  },
  {
    keywords: ['arroz branco', 'arroz'],
    displayName: 'Arroz branco cozido',
    source: 'TACO',
    referencePortion: '4 colheres de sopa (100g)',
    referenceGrams: 100,
    defaultUnit: 'colher',
    defaultUnitGrams: 25,
    calories: 128,
    carbs_g: 28.1,
    protein_g: 2.5,
    fat_g: 0.2,
    fiber_g: 1.6,
    unitGrams: { colher: 25, copo: 160, prato: 200, porcao: 100 },
  },
  {
    keywords: ['feijão preto', 'feijao preto'],
    displayName: 'Feijão preto cozido',
    source: 'TACO',
    referencePortion: '1 concha média (100g)',
    referenceGrams: 100,
    defaultUnit: 'colher',
    defaultUnitGrams: 35,
    calories: 77,
    carbs_g: 14.0,
    protein_g: 4.5,
    fat_g: 0.5,
    fiber_g: 8.4,
    unitGrams: { colher: 35, copo: 170, prato: 160, porcao: 100 },
  },
  {
    keywords: ['feijão carioca', 'feijao carioca', 'feijão', 'feijao'],
    displayName: 'Feijão carioca cozido',
    source: 'TACO',
    referencePortion: '1 concha média (100g)',
    referenceGrams: 100,
    defaultUnit: 'colher',
    defaultUnitGrams: 35,
    calories: 76,
    carbs_g: 13.6,
    protein_g: 4.8,
    fat_g: 0.5,
    fiber_g: 8.5,
    unitGrams: { colher: 35, copo: 170, prato: 160, porcao: 100 },
  },
  {
    keywords: ['frango', 'peito de frango', 'filé de frango', 'file de frango'],
    displayName: 'Peito de frango grelhado (sem pele)',
    source: 'TACO',
    referencePortion: '1 filé médio (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 159,
    carbs_g: 0,
    protein_g: 32.0,
    fat_g: 2.5,
    fiber_g: 0,
    unitGrams: { porcao: 100, unidade: 100, colher: 30, prato: 150 },
  },
  {
    keywords: ['carne moída', 'carne moida'],
    displayName: 'Carne bovina moída (patinho refogado)',
    source: 'TACO',
    referencePortion: '4 colheres de sopa (100g)',
    referenceGrams: 100,
    defaultUnit: 'colher',
    defaultUnitGrams: 25,
    calories: 219,
    carbs_g: 0,
    protein_g: 35.9,
    fat_g: 7.3,
    fiber_g: 0,
    unitGrams: { colher: 25, porcao: 100, prato: 150 },
  },
  {
    keywords: ['patinho', 'alcatra', 'carne', 'bife', 'contrafilé', 'contrafile'],
    displayName: 'Carne bovina magra grelhada (patinho)',
    source: 'TACO',
    referencePortion: '1 bife médio (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 219,
    carbs_g: 0,
    protein_g: 35.9,
    fat_g: 7.3,
    fiber_g: 0,
    unitGrams: { porcao: 100, unidade: 100, colher: 25, prato: 150 },
  },
  {
    keywords: ['salmão', 'salmao'],
    displayName: 'Salmão grelhado',
    source: 'TACO',
    referencePortion: '1 filé médio (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 243,
    carbs_g: 0,
    protein_g: 26.1,
    fat_g: 14.5,
    fiber_g: 0,
    unitGrams: { porcao: 100, unidade: 100 },
  },
  {
    keywords: ['atum'],
    displayName: 'Atum em conserva (em água/sólido)',
    source: 'TBCA',
    referencePortion: '1 porção (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 116,
    carbs_g: 0,
    protein_g: 25.5,
    fat_g: 0.8,
    fiber_g: 0,
    unitGrams: { porcao: 100, colher: 25 },
  },
  {
    keywords: ['peixe', 'tilápia', 'tilapia', 'merluza'],
    displayName: 'Peixe grelhado (tilápia / filé branco)',
    source: 'TBCA',
    referencePortion: '1 filé médio (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 128,
    carbs_g: 0,
    protein_g: 26.2,
    fat_g: 2.7,
    fiber_g: 0,
    unitGrams: { porcao: 100, unidade: 100 },
  },
  {
    keywords: ['ovo frito'],
    displayName: 'Ovo de galinha frito',
    source: 'TACO',
    referencePortion: '1 unidade média (50g)',
    referenceGrams: 50,
    defaultUnit: 'unidade',
    defaultUnitGrams: 50,
    calories: 120,
    carbs_g: 0.6,
    protein_g: 7.8,
    fat_g: 9.3,
    fiber_g: 0,
    unitGrams: { unidade: 50, porcao: 100 },
  },
  {
    keywords: ['ovo', 'ovos', 'ovo cozido', 'ovo mexido'],
    displayName: 'Ovo de galinha inteiro cozido',
    source: 'TACO',
    referencePortion: '1 unidade média (50g)',
    referenceGrams: 50,
    defaultUnit: 'unidade',
    defaultUnitGrams: 50,
    calories: 73,
    carbs_g: 0.3,
    protein_g: 6.7,
    fat_g: 4.8,
    fiber_g: 0,
    unitGrams: { unidade: 50, porcao: 100, colher: 25 },
  },
  {
    keywords: ['banana prata', 'banana nanica', 'banana'],
    displayName: 'Banana prata',
    source: 'TACO',
    referencePortion: '1 unidade média (90g)',
    referenceGrams: 90,
    defaultUnit: 'unidade',
    defaultUnitGrams: 90,
    calories: 88,
    carbs_g: 23.4,
    protein_g: 1.2,
    fat_g: 0.1,
    fiber_g: 1.8,
    unitGrams: { unidade: 90, porcao: 100, fatia: 15 },
  },
  {
    keywords: ['maçã', 'maca'],
    displayName: 'Maçã Fuji com casca',
    source: 'TACO',
    referencePortion: '1 unidade média (130g)',
    referenceGrams: 130,
    defaultUnit: 'unidade',
    defaultUnitGrams: 130,
    calories: 72,
    carbs_g: 19.8,
    protein_g: 0.4,
    fat_g: 0,
    fiber_g: 1.7,
    unitGrams: { unidade: 130, porcao: 100, fatia: 25 },
  },
  {
    keywords: ['laranja'],
    displayName: 'Laranja pera',
    source: 'TACO',
    referencePortion: '1 unidade média (140g)',
    referenceGrams: 140,
    defaultUnit: 'unidade',
    defaultUnitGrams: 140,
    calories: 52,
    carbs_g: 12.5,
    protein_g: 1.4,
    fat_g: 0.1,
    fiber_g: 1.1,
    unitGrams: { unidade: 140, porcao: 100, copo: 200 },
  },
  {
    keywords: ['mamão', 'mamao'],
    displayName: 'Mamão papaia',
    source: 'TACO',
    referencePortion: '1 fatia média (140g)',
    referenceGrams: 140,
    defaultUnit: 'fatia',
    defaultUnitGrams: 140,
    calories: 56,
    carbs_g: 14.6,
    protein_g: 0.7,
    fat_g: 0.1,
    fiber_g: 1.4,
    unitGrams: { fatia: 140, porcao: 100, unidade: 280 },
  },
  {
    keywords: ['morango'],
    displayName: 'Morango cru',
    source: 'TACO',
    referencePortion: '1 porção (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 30,
    carbs_g: 6.8,
    protein_g: 0.9,
    fat_g: 0.3,
    fiber_g: 1.7,
    unitGrams: { porcao: 100, unidade: 12, copo: 150 },
  },
  {
    keywords: ['melancia'],
    displayName: 'Melancia crua',
    source: 'TACO',
    referencePortion: '1 fatia média (200g)',
    referenceGrams: 200,
    defaultUnit: 'fatia',
    defaultUnitGrams: 200,
    calories: 66,
    carbs_g: 16.2,
    protein_g: 1.8,
    fat_g: 0,
    fiber_g: 0.2,
    unitGrams: { fatia: 200, porcao: 100, copo: 200 },
  },
  {
    keywords: ['uva'],
    displayName: 'Uva Itália / Rubi',
    source: 'TACO',
    referencePortion: '1 porção (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 53,
    carbs_g: 13.6,
    protein_g: 0.7,
    fat_g: 0.2,
    fiber_g: 0.9,
    unitGrams: { porcao: 100, unidade: 8, copo: 150 },
  },
  {
    keywords: ['manga'],
    displayName: 'Manga Palmer',
    source: 'TACO',
    referencePortion: '1 porção (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 72,
    carbs_g: 19.4,
    protein_g: 0.4,
    fat_g: 0.2,
    fiber_g: 1.6,
    unitGrams: { porcao: 100, unidade: 180, fatia: 50 },
  },
  {
    keywords: ['pera', 'pêra'],
    displayName: 'Pera Williams',
    source: 'TACO',
    referencePortion: '1 unidade média (130g)',
    referenceGrams: 130,
    defaultUnit: 'unidade',
    defaultUnitGrams: 130,
    calories: 69,
    carbs_g: 18.2,
    protein_g: 0.8,
    fat_g: 0.1,
    fiber_g: 3.9,
    unitGrams: { unidade: 130, porcao: 100 },
  },
  {
    keywords: ['abacate'],
    displayName: 'Abacate cru',
    source: 'TACO',
    referencePortion: '2 colheres de sopa (45g)',
    referenceGrams: 45,
    defaultUnit: 'colher',
    defaultUnitGrams: 22.5,
    calories: 43,
    carbs_g: 2.7,
    protein_g: 0.5,
    fat_g: 3.8,
    fiber_g: 2.8,
    unitGrams: { colher: 22.5, porcao: 100, fatia: 45 },
  },
  {
    keywords: ['batata doce'],
    displayName: 'Batata-doce cozida',
    source: 'TACO',
    referencePortion: '1 porção (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 77,
    carbs_g: 18.4,
    protein_g: 0.6,
    fat_g: 0.1,
    fiber_g: 2.2,
    unitGrams: { porcao: 100, unidade: 150, fatia: 40, colher: 30 },
  },
  {
    keywords: ['batata'],
    displayName: 'Batata inglesa cozida',
    source: 'TACO',
    referencePortion: '1 porção (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 52,
    carbs_g: 11.9,
    protein_g: 1.2,
    fat_g: 0,
    fiber_g: 1.3,
    unitGrams: { porcao: 100, unidade: 130, colher: 30 },
  },
  {
    keywords: ['mandioca', 'aipim', 'macaxeira'],
    displayName: 'Mandioca cozida',
    source: 'TACO',
    referencePortion: '1 porção (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 125,
    carbs_g: 30.1,
    protein_g: 0.6,
    fat_g: 0.3,
    fiber_g: 1.6,
    unitGrams: { porcao: 100, unidade: 100 },
  },
  {
    keywords: ['macarrão', 'macarrao', 'massa'],
    displayName: 'Macarrão cozido (sem molho)',
    source: 'TBCA',
    referencePortion: '1 pegador / porção (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 141,
    carbs_g: 28.0,
    protein_g: 4.9,
    fat_g: 0.8,
    fiber_g: 1.8,
    unitGrams: { porcao: 100, colher: 30, prato: 220 },
  },
  {
    keywords: ['pão integral', 'pao integral', 'pão de forma', 'pao de forma'],
    displayName: 'Pão de forma integral',
    source: 'TACO',
    referencePortion: '2 fatias (50g)',
    referenceGrams: 50,
    defaultUnit: 'fatia',
    defaultUnitGrams: 25,
    calories: 127,
    carbs_g: 25.0,
    protein_g: 4.7,
    fat_g: 1.8,
    fiber_g: 3.5,
    unitGrams: { fatia: 25, porcao: 50, unidade: 25 },
  },
  {
    keywords: ['pão francês', 'pao frances', 'pão', 'pao'],
    displayName: 'Pão francês',
    source: 'TACO',
    referencePortion: '1 unidade (50g)',
    referenceGrams: 50,
    defaultUnit: 'unidade',
    defaultUnitGrams: 50,
    calories: 150,
    carbs_g: 29.3,
    protein_g: 4.0,
    fat_g: 1.6,
    fiber_g: 1.2,
    unitGrams: { unidade: 50, fatia: 25, porcao: 50 },
  },
  {
    keywords: ['pão de queijo', 'pao de queijo'],
    displayName: 'Pão de queijo assado',
    source: 'TACO',
    referencePortion: '1 unidade média (40g)',
    referenceGrams: 40,
    defaultUnit: 'unidade',
    defaultUnitGrams: 40,
    calories: 145,
    carbs_g: 13.7,
    protein_g: 2.0,
    fat_g: 9.8,
    fiber_g: 0.2,
    unitGrams: { unidade: 40, porcao: 100 },
  },
  {
    keywords: ['tapioca'],
    displayName: 'Goma de tapioca hidratada',
    source: 'TBCA',
    referencePortion: '4 colheres de sopa (70g)',
    referenceGrams: 70,
    defaultUnit: 'unidade',
    defaultUnitGrams: 70,
    calories: 169,
    carbs_g: 42.0,
    protein_g: 0.1,
    fat_g: 0,
    fiber_g: 0.3,
    unitGrams: { unidade: 70, colher: 20, porcao: 100 },
  },
  {
    keywords: ['cuscuz'],
    displayName: 'Cuscuz de milho cozido',
    source: 'TACO',
    referencePortion: '1 porção (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 113,
    carbs_g: 25.3,
    protein_g: 2.2,
    fat_g: 0.7,
    fiber_g: 2.1,
    unitGrams: { porcao: 100, colher: 30, fatia: 80 },
  },
  {
    keywords: ['aveia'],
    displayName: 'Aveia em flocos crua',
    source: 'TACO',
    referencePortion: '2 colheres de sopa (30g)',
    referenceGrams: 30,
    defaultUnit: 'colher',
    defaultUnitGrams: 15,
    calories: 118,
    carbs_g: 20.0,
    protein_g: 4.2,
    fat_g: 2.6,
    fiber_g: 2.7,
    unitGrams: { colher: 15, porcao: 30, copo: 80 },
  },
  {
    keywords: ['granola'],
    displayName: 'Granola tradicional',
    source: 'TBCA',
    referencePortion: '2 colheres de sopa (30g)',
    referenceGrams: 30,
    defaultUnit: 'colher',
    defaultUnitGrams: 15,
    calories: 126,
    carbs_g: 21.0,
    protein_g: 2.9,
    fat_g: 3.4,
    fiber_g: 2.4,
    unitGrams: { colher: 15, porcao: 30, copo: 90 },
  },
  {
    keywords: ['leite desnatado'],
    displayName: 'Leite de vaca desnatado UHT',
    source: 'TBCA',
    referencePortion: '1 copo (200ml)',
    referenceGrams: 200,
    defaultUnit: 'copo',
    defaultUnitGrams: 200,
    calories: 68,
    carbs_g: 9.8,
    protein_g: 6.4,
    fat_g: 0.2,
    fiber_g: 0,
    isLiquid: true,
    unitGrams: { copo: 200, porcao: 200, colher: 15 },
  },
  {
    keywords: ['leite'],
    displayName: 'Leite de vaca integral UHT',
    source: 'TACO',
    referencePortion: '1 copo (200ml)',
    referenceGrams: 200,
    defaultUnit: 'copo',
    defaultUnitGrams: 200,
    calories: 122,
    carbs_g: 9.6,
    protein_g: 6.2,
    fat_g: 6.4,
    fiber_g: 0,
    isLiquid: true,
    unitGrams: { copo: 200, porcao: 200, colher: 15 },
  },
  {
    keywords: ['café com leite', 'cafe com leite'],
    displayName: 'Café com leite integral (50/50)',
    source: 'TBCA',
    referencePortion: '1 xícara/copo (200ml)',
    referenceGrams: 200,
    defaultUnit: 'copo',
    defaultUnitGrams: 200,
    calories: 63,
    carbs_g: 4.9,
    protein_g: 3.2,
    fat_g: 3.2,
    fiber_g: 0,
    isLiquid: true,
    unitGrams: { copo: 200, porcao: 200 },
  },
  {
    keywords: ['café', 'cafe'],
    displayName: 'Café infusão sem açúcar',
    source: 'TACO',
    referencePortion: '1 xícara média (100ml)',
    referenceGrams: 100,
    defaultUnit: 'copo',
    defaultUnitGrams: 100,
    calories: 2,
    carbs_g: 0.3,
    protein_g: 0.2,
    fat_g: 0,
    fiber_g: 0,
    isLiquid: true,
    unitGrams: { copo: 100, porcao: 100 },
  },
  {
    keywords: ['suco de laranja', 'suco'],
    displayName: 'Suco de laranja natural sem açúcar',
    source: 'TBCA',
    referencePortion: '1 copo (200ml)',
    referenceGrams: 200,
    defaultUnit: 'copo',
    defaultUnitGrams: 200,
    calories: 88,
    carbs_g: 20.6,
    protein_g: 1.4,
    fat_g: 0.2,
    fiber_g: 0.4,
    isLiquid: true,
    unitGrams: { copo: 200, porcao: 200 },
  },
  {
    keywords: ['iogurte natural', 'iogurte'],
    displayName: 'Iogurte natural integral',
    source: 'TACO',
    referencePortion: '1 pote (170g)',
    referenceGrams: 170,
    defaultUnit: 'copo',
    defaultUnitGrams: 170,
    calories: 105,
    carbs_g: 7.5,
    protein_g: 6.1,
    fat_g: 5.6,
    fiber_g: 0,
    unitGrams: { copo: 170, porcao: 170, unidade: 170, colher: 20 },
  },
  {
    keywords: ['queijo minas'],
    displayName: 'Queijo minas frescal',
    source: 'TACO',
    referencePortion: '1 fatia média (30g)',
    referenceGrams: 30,
    defaultUnit: 'fatia',
    defaultUnitGrams: 30,
    calories: 79,
    carbs_g: 1.0,
    protein_g: 5.2,
    fat_g: 6.1,
    fiber_g: 0,
    unitGrams: { fatia: 30, porcao: 100 },
  },
  {
    keywords: ['queijo', 'mussarela', 'muçarela'],
    displayName: 'Queijo muçarela',
    source: 'TACO',
    referencePortion: '1 fatia média (20g)',
    referenceGrams: 20,
    defaultUnit: 'fatia',
    defaultUnitGrams: 20,
    calories: 66,
    carbs_g: 0.6,
    protein_g: 4.5,
    fat_g: 5.0,
    fiber_g: 0,
    unitGrams: { fatia: 20, porcao: 100 },
  },
  {
    keywords: ['requeijão', 'requeijao'],
    displayName: 'Requeijão cremoso tradicional',
    source: 'TACO',
    referencePortion: '1 colher de sopa (20g)',
    referenceGrams: 20,
    defaultUnit: 'colher',
    defaultUnitGrams: 20,
    calories: 51,
    carbs_g: 0.5,
    protein_g: 1.9,
    fat_g: 4.7,
    fiber_g: 0,
    unitGrams: { colher: 20, porcao: 30 },
  },
  {
    keywords: ['pasta de amendoim', 'amendoim'],
    displayName: 'Amendoim torrado / pasta integral',
    source: 'TACO',
    referencePortion: '1 colher de sopa (15g)',
    referenceGrams: 15,
    defaultUnit: 'colher',
    defaultUnitGrams: 15,
    calories: 91,
    carbs_g: 2.8,
    protein_g: 3.4,
    fat_g: 8.1,
    fiber_g: 1.2,
    unitGrams: { colher: 15, porcao: 30 },
  },
  {
    keywords: ['azeite'],
    displayName: 'Azeite de oliva extra virgem',
    source: 'TACO',
    referencePortion: '1 colher de sopa (13ml)',
    referenceGrams: 13,
    defaultUnit: 'colher',
    defaultUnitGrams: 13,
    calories: 115,
    carbs_g: 0,
    protein_g: 0,
    fat_g: 13.0,
    fiber_g: 0,
    isLiquid: true,
    unitGrams: { colher: 13, porcao: 13 },
  },
  {
    keywords: ['manteiga'],
    displayName: 'Manteiga com sal',
    source: 'TACO',
    referencePortion: '1 colher de chá/ponta de faca (10g)',
    referenceGrams: 10,
    defaultUnit: 'colher',
    defaultUnitGrams: 10,
    calories: 73,
    carbs_g: 0,
    protein_g: 0.1,
    fat_g: 8.2,
    fiber_g: 0,
    unitGrams: { colher: 10, porcao: 10 },
  },
  {
    keywords: ['brócolis', 'brocolis'],
    displayName: 'Brócolis cozido',
    source: 'TACO',
    referencePortion: '1 porção (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 25,
    carbs_g: 4.4,
    protein_g: 2.1,
    fat_g: 0.5,
    fiber_g: 3.4,
    unitGrams: { porcao: 100, colher: 25, prato: 120 },
  },
  {
    keywords: ['cenoura'],
    displayName: 'Cenoura cozida',
    source: 'TACO',
    referencePortion: '1 porção (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 30,
    carbs_g: 6.7,
    protein_g: 0.8,
    fat_g: 0.2,
    fiber_g: 2.6,
    unitGrams: { porcao: 100, colher: 25, unidade: 100 },
  },
  {
    keywords: ['salada', 'alface', 'tomate', 'legumes', 'verdura'],
    displayName: 'Salada mista (alface e tomate)',
    source: 'TACO',
    referencePortion: '1 prato sobremesa (100g)',
    referenceGrams: 100,
    defaultUnit: 'prato',
    defaultUnitGrams: 100,
    calories: 14,
    carbs_g: 2.7,
    protein_g: 1.2,
    fat_g: 0.2,
    fiber_g: 1.5,
    unitGrams: { prato: 100, porcao: 100 },
  },
  {
    keywords: ['presunto'],
    displayName: 'Presunto cozido magro',
    source: 'TBCA',
    referencePortion: '1 fatia média (20g)',
    referenceGrams: 20,
    defaultUnit: 'fatia',
    defaultUnitGrams: 20,
    calories: 24,
    carbs_g: 0.3,
    protein_g: 3.6,
    fat_g: 0.9,
    fiber_g: 0,
    unitGrams: { fatia: 20, porcao: 40 },
  },
  {
    keywords: ['peito de peru'],
    displayName: 'Peito de peru defumado',
    source: 'TBCA',
    referencePortion: '1 fatia média (20g)',
    referenceGrams: 20,
    defaultUnit: 'fatia',
    defaultUnitGrams: 20,
    calories: 21,
    carbs_g: 0.4,
    protein_g: 3.8,
    fat_g: 0.4,
    fiber_g: 0,
    unitGrams: { fatia: 20, porcao: 40 },
  },
  {
    keywords: ['açaí', 'acai'],
    displayName: 'Polpa de açaí pura (sem xarope)',
    source: 'TACO',
    referencePortion: '1 porção (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 58,
    carbs_g: 6.2,
    protein_g: 0.8,
    fat_g: 3.9,
    fiber_g: 2.6,
    unitGrams: { porcao: 100, copo: 200, colher: 25 },
  },
  {
    keywords: ['agua', 'água'],
    displayName: 'Água mineral',
    source: 'TACO',
    referencePortion: '1 copo (200ml)',
    referenceGrams: 200,
    defaultUnit: 'copo',
    defaultUnitGrams: 200,
    calories: 0,
    carbs_g: 0,
    protein_g: 0,
    fat_g: 0,
    fiber_g: 0,
    isLiquid: true,
    unitGrams: { copo: 200, porcao: 200 },
  },
  // Referências extras além da TACO/TBCA (USDA FoodData, rótulos médios e IBGE/POF)
  {
    keywords: ['whey protein', 'whey'],
    displayName: 'Whey Protein concentrado',
    source: 'Referência',
    referencePortion: '1 scoop / porção (30g)',
    referenceGrams: 30,
    defaultUnit: 'porcao',
    defaultUnitGrams: 30,
    calories: 120,
    carbs_g: 3.0,
    protein_g: 23.0,
    fat_g: 1.8,
    fiber_g: 0.4,
    unitGrams: { porcao: 30, colher: 15, unidade: 30 },
  },
  {
    keywords: ['creatina'],
    displayName: 'Creatina monohidratada',
    source: 'Referência',
    referencePortion: '1 dose (5g)',
    referenceGrams: 5,
    defaultUnit: 'porcao',
    defaultUnitGrams: 5,
    calories: 0,
    carbs_g: 0,
    protein_g: 0,
    fat_g: 0,
    fiber_g: 0,
    unitGrams: { porcao: 5, colher: 5 },
  },
  {
    keywords: ['barra de proteína', 'barra de proteina', 'barra proteica'],
    displayName: 'Barra de proteína média',
    source: 'Referência',
    referencePortion: '1 unidade (45g)',
    referenceGrams: 45,
    defaultUnit: 'unidade',
    defaultUnitGrams: 45,
    calories: 168,
    carbs_g: 14.0,
    protein_g: 14.0,
    fat_g: 6.2,
    fiber_g: 3.5,
    unitGrams: { unidade: 45, porcao: 45 },
  },
  {
    keywords: ['iogurte grego'],
    displayName: 'Iogurte grego tradicional',
    source: 'USDA',
    referencePortion: '1 pote (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 97,
    carbs_g: 4.0,
    protein_g: 9.0,
    fat_g: 5.0,
    fiber_g: 0,
    unitGrams: { porcao: 100, copo: 170, colher: 25 },
  },
  {
    keywords: ['omelete'],
    displayName: 'Omelete simples (2 ovos)',
    source: 'IBGE',
    referencePortion: '1 porção média (110g)',
    referenceGrams: 110,
    defaultUnit: 'porcao',
    defaultUnitGrams: 110,
    calories: 178,
    carbs_g: 1.4,
    protein_g: 13.6,
    fat_g: 12.9,
    fiber_g: 0,
    unitGrams: { porcao: 110, unidade: 110, prato: 165 },
  },
  {
    keywords: ['ovo mexido', 'ovos mexidos'],
    displayName: 'Ovos mexidos',
    source: 'USDA',
    referencePortion: '1 porção (100g)',
    referenceGrams: 100,
    defaultUnit: 'porcao',
    defaultUnitGrams: 100,
    calories: 149,
    carbs_g: 1.6,
    protein_g: 10.0,
    fat_g: 11.0,
    fiber_g: 0,
    unitGrams: { porcao: 100, colher: 30, prato: 150 },
  },
  {
    keywords: ['wrap', 'rap10', 'rap 10', 'tortilha'],
    displayName: 'Tortilha / Wrap integral',
    source: 'Referência',
    referencePortion: '1 unidade (40g)',
    referenceGrams: 40,
    defaultUnit: 'unidade',
    defaultUnitGrams: 40,
    calories: 118,
    carbs_g: 20.0,
    protein_g: 3.4,
    fat_g: 2.6,
    fiber_g: 2.2,
    unitGrams: { unidade: 40, fatia: 40, porcao: 40 },
  },
  {
    keywords: ['hambúrguer', 'hamburguer', 'x-burguer', 'x-burger', 'cheeseburger'],
    displayName: 'Hambúrguer artesanal / sanduíche',
    source: 'USDA',
    referencePortion: '1 unidade média (180g)',
    referenceGrams: 180,
    defaultUnit: 'unidade',
    defaultUnitGrams: 180,
    calories: 455,
    carbs_g: 34.0,
    protein_g: 25.0,
    fat_g: 24.0,
    fiber_g: 2.0,
    unitGrams: { unidade: 180, porcao: 180 },
  },
  {
    keywords: ['pizza'],
    displayName: 'Pizza tradicional (média muçarela/calabresa)',
    source: 'IBGE',
    referencePortion: '1 fatia média (100g)',
    referenceGrams: 100,
    defaultUnit: 'fatia',
    defaultUnitGrams: 100,
    calories: 266,
    carbs_g: 28.5,
    protein_g: 11.5,
    fat_g: 11.8,
    fiber_g: 1.8,
    unitGrams: { fatia: 100, unidade: 100, porcao: 100 },
  },
  {
    keywords: ['strogonoff', 'estrogonofe'],
    displayName: 'Strogonoff de frango/carne',
    source: 'IBGE',
    referencePortion: '1 porção média (150g)',
    referenceGrams: 150,
    defaultUnit: 'porcao',
    defaultUnitGrams: 150,
    calories: 248,
    carbs_g: 6.5,
    protein_g: 22.5,
    fat_g: 14.8,
    fiber_g: 0.6,
    unitGrams: { porcao: 150, colher: 35, prato: 200 },
  },
  {
    keywords: ['lasanha'],
    displayName: 'Lasanha tradicional à bolonhesa',
    source: 'USDA',
    referencePortion: '1 pedaço médio (200g)',
    referenceGrams: 200,
    defaultUnit: 'porcao',
    defaultUnitGrams: 200,
    calories: 312,
    carbs_g: 28.0,
    protein_g: 17.0,
    fat_g: 14.5,
    fiber_g: 2.0,
    unitGrams: { porcao: 200, fatia: 200, prato: 250 },
  },
  {
    keywords: ['temaki'],
    displayName: 'Temaki de salmão tradicional',
    source: 'Referência',
    referencePortion: '1 unidade (150g)',
    referenceGrams: 150,
    defaultUnit: 'unidade',
    defaultUnitGrams: 150,
    calories: 245,
    carbs_g: 31.0,
    protein_g: 13.5,
    fat_g: 7.5,
    fiber_g: 1.4,
    unitGrams: { unidade: 150, porcao: 150 },
  },
  {
    keywords: ['sushi', 'sashimi', 'uramaki', 'hossomaki'],
    displayName: 'Combinado de sushi (peças variadas)',
    source: 'USDA',
    referencePortion: '1 porção (6 peças · 150g)',
    referenceGrams: 150,
    defaultUnit: 'porcao',
    defaultUnitGrams: 150,
    calories: 220,
    carbs_g: 35.0,
    protein_g: 11.0,
    fat_g: 3.8,
    fiber_g: 1.2,
    unitGrams: { porcao: 150, unidade: 25 },
  },
  {
    keywords: ['coxinha'],
    displayName: 'Coxinha de frango tradicional',
    source: 'IBGE',
    referencePortion: '1 unidade média (100g)',
    referenceGrams: 100,
    defaultUnit: 'unidade',
    defaultUnitGrams: 100,
    calories: 283,
    carbs_g: 29.5,
    protein_g: 10.2,
    fat_g: 13.8,
    fiber_g: 1.6,
    unitGrams: { unidade: 100, porcao: 100 },
  },
  {
    keywords: ['pastel'],
    displayName: 'Pastel frito tradicional',
    source: 'IBGE',
    referencePortion: '1 unidade média (90g)',
    referenceGrams: 90,
    defaultUnit: 'unidade',
    defaultUnitGrams: 90,
    calories: 289,
    carbs_g: 28.0,
    protein_g: 8.5,
    fat_g: 15.8,
    fiber_g: 1.4,
    unitGrams: { unidade: 90, porcao: 90 },
  },
  {
    keywords: ['chocolate amargo', 'chocolate 70'],
    displayName: 'Chocolate amargo 70% cacau',
    source: 'USDA',
    referencePortion: '2 quadrados (25g)',
    referenceGrams: 25,
    defaultUnit: 'porcao',
    defaultUnitGrams: 25,
    calories: 149,
    carbs_g: 11.5,
    protein_g: 2.0,
    fat_g: 10.6,
    fiber_g: 2.7,
    unitGrams: { porcao: 25, unidade: 12 },
  },
  {
    keywords: ['chocolate'],
    displayName: 'Chocolate ao leite',
    source: 'TACO',
    referencePortion: '2 quadrados (25g)',
    referenceGrams: 25,
    defaultUnit: 'porcao',
    defaultUnitGrams: 25,
    calories: 135,
    carbs_g: 14.9,
    protein_g: 1.8,
    fat_g: 7.6,
    fiber_g: 0.6,
    unitGrams: { porcao: 25, unidade: 12 },
  },
  {
    keywords: ['mel'],
    displayName: 'Mel de abelha natural',
    source: 'TACO',
    referencePortion: '1 colher de sopa (20g)',
    referenceGrams: 20,
    defaultUnit: 'colher',
    defaultUnitGrams: 20,
    calories: 62,
    carbs_g: 16.8,
    protein_g: 0,
    fat_g: 0,
    fiber_g: 0,
    unitGrams: { colher: 20, porcao: 20 },
  },
  {
    keywords: ['chia', 'semente de chia'],
    displayName: 'Semente de chia',
    source: 'USDA',
    referencePortion: '1 colher de sopa (15g)',
    referenceGrams: 15,
    defaultUnit: 'colher',
    defaultUnitGrams: 15,
    calories: 73,
    carbs_g: 6.3,
    protein_g: 2.5,
    fat_g: 4.6,
    fiber_g: 5.2,
    unitGrams: { colher: 15, porcao: 15 },
  },
  {
    keywords: ['castanha', 'nozes', 'amêndoa', 'amendoa'],
    displayName: 'Castanhas / oleaginosas mistas',
    source: 'USDA',
    referencePortion: '1 porção (30g)',
    referenceGrams: 30,
    defaultUnit: 'porcao',
    defaultUnitGrams: 30,
    calories: 185,
    carbs_g: 5.5,
    protein_g: 5.2,
    fat_g: 16.5,
    fiber_g: 2.3,
    unitGrams: { porcao: 30, colher: 15, unidade: 5 },
  },
  {
    keywords: ['refrigerante'],
    displayName: 'Refrigerante tradicional',
    source: 'IBGE',
    referencePortion: '1 copo (200ml)',
    referenceGrams: 200,
    defaultUnit: 'copo',
    defaultUnitGrams: 200,
    calories: 84,
    carbs_g: 21.0,
    protein_g: 0,
    fat_g: 0,
    fiber_g: 0,
    isLiquid: true,
    unitGrams: { copo: 200, porcao: 350, unidade: 350 },
  },
];

const PT_NUMBER_WORDS: Record<string, number> = {
  meia: 0.5,
  meio: 0.5,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  doze: 12,
};

interface ParsedSegmentQuantity {
  qty: number;
  isGramsOrMl: boolean;
  explicitUnit?: MealMeasureUnit;
  cleanedText: string;
}

export function extractLeadingQuantity(raw: string): { qty: number | null; rest: string } {
  const trimmed = raw.trim();
  const numMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(?:x\b|×\s*)?(.*)$/i);
  if (numMatch) {
    const qty = Number(numMatch[1].replace(',', '.'));
    if (Number.isFinite(qty) && qty > 0) {
      return { qty, rest: numMatch[2].trim() };
    }
  }
  const wordMatch = trimmed.match(
    /^(meia|meio|um|uma|dois|duas|três|tres|quatro|cinco|seis|sete|oito|nove|dez|doze)\b\s*(.*)$/i
  );
  if (wordMatch) {
    const qty = PT_NUMBER_WORDS[wordMatch[1].toLowerCase()];
    if (qty) {
      return { qty, rest: wordMatch[2].trim() };
    }
  }
  return { qty: null, rest: trimmed };
}

function parseSegmentQuantity(segment: string): ParsedSegmentQuantity {
  const lower = segment.trim().toLowerCase();

  // Ex: "150g de frango", "250 ml de leite"
  const gramMatch = lower.match(/\b(\d+(?:[.,]\d+)?)\s*(g|gr|gramas?|ml)\b/i);
  if (gramMatch) {
    const amount = Number(gramMatch[1].replace(',', '.'));
    if (Number.isFinite(amount) && amount > 0) {
      return {
        qty: amount,
        isGramsOrMl: true,
        cleanedText: lower,
      };
    }
  }

  // Ex: "3 copos de leite", "2 unidades de banana", "4 colheres de arroz", "3 fatias de pão"
  const unitRegex =
    /\b(\d+(?:[.,]\d+)?|meia|meio|um|uma|dois|duas|três|tres|quatro|cinco|seis|sete|oito|nove|dez|doze)\s*(?:x\b|×)?\s*(unidades?|unid?s?|copos?|x[ií]caras?|colher(?:es)?(?:\s+de\s+sopa)?|fatias?|pratos?|porç(?:ão|ões)|porc(?:ao|oes)|conchas?|potes?|latas?)?\b/i;
  const match = lower.match(unitRegex);
  if (match) {
    const rawNum = match[1].toLowerCase();
    const qty = PT_NUMBER_WORDS[rawNum] ?? Number(rawNum.replace(',', '.'));
    const unitWord = (match[2] || '').toLowerCase();
    let explicitUnit: MealMeasureUnit | undefined;
    if (unitWord.startsWith('copo') || unitWord.startsWith('x')) explicitUnit = 'copo';
    else if (unitWord.startsWith('colher')) explicitUnit = 'colher';
    else if (unitWord.startsWith('fatia')) explicitUnit = 'fatia';
    else if (unitWord.startsWith('prato')) explicitUnit = 'prato';
    else if (unitWord.startsWith('unid') || unitWord === 'un') explicitUnit = 'unidade';
    else if (unitWord.startsWith('por')) explicitUnit = 'porcao';

    if (Number.isFinite(qty) && qty > 0) {
      return {
        qty,
        isGramsOrMl: false,
        explicitUnit,
        cleanedText: lower,
      };
    }
  }

  return {
    qty: 1,
    isGramsOrMl: false,
    cleanedText: lower,
  };
}

function matchesFoodKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|[^a-z0-9à-ú])${escaped}s?(?:$|[^a-z0-9à-ú])`, 'i');
  return pattern.test(text);
}

function looksLikeMeaningfulFoodText(text: string): boolean {
  const cleaned = text
    .toLowerCase()
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:g|gr|gramas?|ml|x|unidades?|unids?|copos?|colher(?:es)?|fatias?|pratos?|porç(?:ão|ões)|porc(?:ao|oes))\b/gi, '')
    .replace(/\b(?:de|da|do|das|dos|com|e|em|no|na|ao|à|sem|para|por)\b/gi, '')
    .replace(/[^a-zà-ú]/gi, '')
    .trim();
  if (cleaned.length < 3) return false;
  if (!/[aeiouáàâãéêíóôõúü]/i.test(cleaned)) return false;
  if (/^(.)\1{2,}$/.test(cleaned)) return false;
  if (/^(asdf|qwer|zxcv|teste|test|aaa|bbb|xxx)/i.test(cleaned)) return false;
  return true;
}

function capitalizeFoodLabel(text: string): string {
  const cleaned = text
    .replace(/^\d+(?:[.,]\d+)?\s*(?:g|gr|gramas?|ml|x)?\s*(?:de\s+)?/i, '')
    .replace(/^(?:unidades?|unid?s?|copos?|x[ií]caras?|colher(?:es)?(?:\s+de\s+sopa)?|fatias?|pratos?|porç(?:ão|ões)|porc(?:ao|oes))\s+(?:de\s+)?/i, '')
    .trim();
  if (!cleaned) return text.trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Calculadora nutricional heurística para alimentos/receitas ausentes da base local TACO/TBCA,
 * usada para cálculo offline instantâneo e refinada pela IA quando online.
 */
function estimateUnknownSegmentNutrition(segment: string, parsed: ParsedSegmentQuantity): MealFoodItem | null {
  const lower = parsed.cleanedText;
  if (!looksLikeMeaningfulFoodText(lower)) {
    return null;
  }

  let defaultUnit: MealMeasureUnit = parsed.explicitUnit || 'porcao';
  let defaultGrams = 150;
  let isLiquid = false;

  // Densidade nutricional base por 100g / 100ml
  let cal100 = 165;
  let carb100 = 18.0;
  let prot100 = 8.5;
  let fat100 = 6.2;
  let fib100 = 1.8;

  if (/\b(vitamina|smoothie|shake|milkshake|achocolatado)\b/i.test(lower)) {
    defaultUnit = parsed.explicitUnit || 'copo';
    defaultGrams = 250;
    isLiquid = true;
    cal100 = 88;
    carb100 = 12.5;
    prot100 = 4.2;
    fat100 = 2.4;
    fib100 = 1.0;
  } else if (/\b(suco|caldo de cana|limonada|laranjada|maracuj[aá]|caju[ií]na)\b/i.test(lower)) {
    defaultUnit = parsed.explicitUnit || 'copo';
    defaultGrams = 200;
    isLiquid = true;
    cal100 = 46;
    carb100 = 10.8;
    prot100 = 0.5;
    fat100 = 0.2;
    fib100 = 0.3;
  } else if (/\b(cerveja|chopp|vinho|drink|caipirinha)\b/i.test(lower)) {
    defaultUnit = parsed.explicitUnit || 'copo';
    defaultGrams = 300;
    isLiquid = true;
    cal100 = 52;
    carb100 = 4.2;
    prot100 = 0.4;
    fat100 = 0;
    fib100 = 0;
  } else if (/\b(ch[aá]|cafezinho|espresso|cappuccino)\b/i.test(lower)) {
    defaultUnit = parsed.explicitUnit || 'copo';
    defaultGrams = 180;
    isLiquid = true;
    cal100 = /\bcappuccino\b/i.test(lower) ? 58 : 4;
    carb100 = /\bcappuccino\b/i.test(lower) ? 7.5 : 0.6;
    prot100 = /\bcappuccino\b/i.test(lower) ? 2.4 : 0.2;
    fat100 = /\bcappuccino\b/i.test(lower) ? 2.0 : 0;
    fib100 = 0;
  } else if (/\b(sopa|caldo|canja|creme de)\b/i.test(lower)) {
    defaultUnit = parsed.explicitUnit || 'prato';
    defaultGrams = 300;
    cal100 = 58;
    carb100 = 7.2;
    prot100 = 3.6;
    fat100 = 1.5;
    fib100 = 1.2;
  } else if (/\b(bolo|torta|pudim|brigadeiro|brownie|cookie|biscoito|bolacha|muffin|waffle|sorvete|picol[eé]|mousse|pav[eê]|doce|pa[cç]oca|churros)\b/i.test(lower)) {
    defaultUnit = parsed.explicitUnit || (/\b(bolo|torta|pav[eê])\b/i.test(lower) ? 'fatia' : 'unidade');
    defaultGrams = /\b(brigadeiro|pa[cç]oca|cookie|bolacha|biscoito)\b/i.test(lower) ? 35 : 85;
    cal100 = 315;
    carb100 = 44.0;
    prot100 = 4.8;
    fat100 = 13.5;
    fib100 = 1.2;
  } else if (/\b(sandu[ií]che|bauru|misto|hot ?dog|cachorro[- ]quente|esfiha|quibe|empada|enroladinho|nuggets|taco|burrito|panqueca|crepioca)\b/i.test(lower)) {
    defaultUnit = parsed.explicitUnit || 'unidade';
    defaultGrams = /\b(esfiha|empada|enroladinho|quibe)\b/i.test(lower) ? 95 : 150;
    cal100 = 248;
    carb100 = 25.0;
    prot100 = 11.5;
    fat100 = 11.2;
    fib100 = 1.6;
  } else if (/\b(bife|picanha|costela|alcatra|contra[- ]?fil[eé]|maminha|lingui[cç]a|salsicha|camar[aã]o|bacalhau|sardinha|tofu|pernil|lombo|carne|frango|peixe|alm[oô]ndega|kibe|fil[eé])\b/i.test(lower)) {
    defaultUnit = parsed.explicitUnit || 'porcao';
    defaultGrams = 120;
    cal100 = 198;
    carb100 = 2.0;
    prot100 = 23.0;
    fat100 = 10.5;
    fib100 = 0.2;
  } else if (/\b(risoto|yakisoba|nhoque|ravioli|espaguete|macarronada|bai[aã]o|feijoada|tropeiro|farofa|polenta|quinoa|gr[aã]o de bico|lentilha|ervilha|poke|bowl|arroz|feij[aã]o)\b/i.test(lower)) {
    defaultUnit = parsed.explicitUnit || 'prato';
    defaultGrams = 240;
    cal100 = 162;
    carb100 = 21.5;
    prot100 = 7.8;
    fat100 = 4.9;
    fib100 = 2.6;
  } else if (/\b(abacaxi|mel[aã]o|kiwi|ameixa|p[eê]ssego|goiaba|abobrinha|berinjela|chuchu|beterraba|espinafre|couve|repolho|pepino|vagem|milho|aspargo|r[uú]cula|agri[aã]o|fruta|legumes)\b/i.test(lower)) {
    defaultUnit = parsed.explicitUnit || 'porcao';
    defaultGrams = 100;
    cal100 = 42;
    carb100 = 8.8;
    prot100 = 1.3;
    fat100 = 0.3;
    fib100 = 2.4;
  }

  // Modificadores de preparo/ingredientes
  if (/\b(frito|frita|empanado|empanada|milanesa|parmegiana|bacon|cheddar|catupiry|4 queijos)\b/i.test(lower)) {
    cal100 += 65;
    fat100 += 5.5;
    prot100 += 2.2;
  }
  if (/\b(whey|proteic[oa]|prote[ií]na)\b/i.test(lower)) {
    prot100 += 10.0;
    cal100 += 35;
  }
  if (/\b(fit|light|zero|diet|grelhad[oa]|assad[oa]|cozid[oa]|vapor)\b/i.test(lower)) {
    cal100 = Math.max(12, cal100 * 0.85);
    fat100 = fat100 * 0.72;
  }

  const unitMap: Record<MealMeasureUnit, number> = {
    porcao: defaultGrams,
    unidade: defaultUnit === 'unidade' ? defaultGrams : Math.round(defaultGrams * 0.8),
    copo: isLiquid ? defaultGrams : 200,
    colher: 25,
    fatia: 75,
    prato: Math.max(200, defaultGrams),
  };

  let totalGrams = defaultGrams;
  let portionText = `1 ${formatMeasureLabel(defaultUnit, 1)} (~${defaultGrams}${isLiquid ? 'ml' : 'g'} · Cálculo)`;
  const refPortion = `100${isLiquid ? 'ml' : 'g'} (Cálculo nutricional)`;

  if (parsed.isGramsOrMl) {
    totalGrams = parsed.qty;
    portionText = `${Math.round(totalGrams)}${isLiquid ? 'ml' : 'g'} (Cálculo nutricional)`;
  } else {
    const usedUnit = parsed.explicitUnit || defaultUnit;
    const perUnitG = unitMap[usedUnit] ?? defaultGrams;
    totalGrams = parsed.qty * perUnitG;
    const qtyDisplay = Number.isInteger(parsed.qty) ? String(parsed.qty) : parsed.qty.toFixed(1).replace('.', ',');
    portionText = `${qtyDisplay} ${formatMeasureLabel(usedUnit, parsed.qty)} (~${Math.round(totalGrams)}${isLiquid ? 'ml' : 'g'} · Cálculo)`;
  }

  const factor = totalGrams / 100;
  return {
    name: capitalizeFoodLabel(segment).slice(0, 60),
    portion: portionText,
    reference_portion: refPortion,
    source: 'Cálculo Nutricional',
    calories: Math.round(cal100 * factor),
    protein_g: Number((prot100 * factor).toFixed(1)),
    carbs_g: Number((carb100 * factor).toFixed(1)),
    fat_g: Number((fat100 * factor).toFixed(1)),
    fiber_g: Number((fib100 * factor).toFixed(1)),
    data_available: true,
  };
}

export function estimateMealLocally(description: string): {
  title: string;
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  items: MealFoodItem[];
  detectedQty: number | null;
  detectedUnit: MealMeasureUnit | null;
  allMatched: boolean;
  needsAiRefinement: boolean;
  dataAvailable: boolean;
} {
  const raw = description.trim();
  if (!raw) {
    return {
      title: 'Descreva a refeição',
      description: 'Informe um alimento para consultar TACO/TBCA ou calcular com fontes extras.',
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      items: [],
      detectedQty: null,
      detectedUnit: null,
      allMatched: false,
      needsAiRefinement: false,
      dataAvailable: false,
    };
  }

  // Divide em segmentos sem quebrar expressões compostas
  const protectedPhrase = raw
    .replace(/caf[eé]\s+com\s+leite/gi, 'cafe_com_leite')
    .replace(/pasta\s+de\s+amendoim/gi, 'pasta_de_amendoim')
    .replace(/peito\s+de\s+frango/gi, 'peito_de_frango')
    .replace(/fil[eé]\s+de\s+frango/gi, 'file_de_frango')
    .replace(/peito\s+de\s+peru/gi, 'peito_de_peru')
    .replace(/p[aã]o\s+de\s+queijo/gi, 'pao_de_queijo')
    .replace(/batata\s+doce/gi, 'batata_doce')
    .replace(/carne\s+mo[ií]da/gi, 'carne_moida')
    .replace(/suco\s+de\s+laranja/gi, 'suco_de_laranja')
    .replace(/arroz\s+integral/gi, 'arroz_integral')
    .replace(/arroz\s+branco/gi, 'arroz_branco')
    .replace(/feij[aã]o\s+preto/gi, 'feijao_preto')
    .replace(/feij[aã]o\s+carioca/gi, 'feijao_carioca')
    .replace(/queijo\s+minas/gi, 'queijo_minas')
    .replace(/ovo\s+frito/gi, 'ovo_frito')
    .replace(/ovo\s+cozido/gi, 'ovo_cozido')
    .replace(/ovos?\s+mexidos?/gi, 'ovo_mexido')
    .replace(/leite\s+desnatado/gi, 'leite_desnatado')
    .replace(/iogurte\s+grego/gi, 'iogurte_grego')
    .replace(/whey\s+protein/gi, 'whey_protein')
    .replace(/barra\s+de\s+prote[ií]na/gi, 'barra_de_proteina')
    .replace(/chocolate\s+amargo/gi, 'chocolate_amargo')
    .replace(/p[aã]o\s+(?:de\s+forma|integral|franc[eê]s)/gi, (m) => m.replace(/\s+/g, '_'));

  const segments = protectedPhrase
    .split(/[,+\n;]|\s+e\s+|\s+com\s+/i)
    .map((s) => s.replace(/_/g, ' ').trim())
    .filter(Boolean);

  const items: MealFoodItem[] = [];
  let singleSegmentQty: number | null = null;
  let singleSegmentUnit: MealMeasureUnit | null = null;
  let unmatchedCount = 0;
  let heuristicCount = 0;

  for (const seg of segments) {
    const parsed = parseSegmentQuantity(seg);
    const matchedFoods = FOOD_DB.filter((entry) =>
      entry.keywords.some((kw) => matchesFoodKeyword(parsed.cleanedText, kw))
    );

    if (matchedFoods.length > 0) {
      // Escolhe a keyword mais específica (mais longa)
      const food = matchedFoods.sort(
        (a, b) =>
          Math.max(
            ...b.keywords.filter((k) => matchesFoodKeyword(parsed.cleanedText, k)).map((k) => k.length)
          ) -
          Math.max(
            ...a.keywords.filter((k) => matchesFoodKeyword(parsed.cleanedText, k)).map((k) => k.length)
          )
      )[0];

      let multiplier = 1;
      let portionText = food.referencePortion;
      const unitChar = food.isLiquid ? 'ml' : 'g';

      if (parsed.isGramsOrMl) {
        multiplier = parsed.qty / Math.max(1, food.referenceGrams);
        portionText = `${Math.round(parsed.qty)}${unitChar} (ref. ${food.source}: ${food.referencePortion})`;
      } else {
        const usedUnit = parsed.explicitUnit || food.defaultUnit;
        const unitGrams = food.unitGrams?.[usedUnit] ?? food.defaultUnitGrams;
        const totalGrams = parsed.qty * unitGrams;
        multiplier = totalGrams / Math.max(1, food.referenceGrams);

        const qtyDisplay = Number.isInteger(parsed.qty)
          ? String(parsed.qty)
          : parsed.qty.toFixed(1).replace('.', ',');
        portionText = `${qtyDisplay} ${formatMeasureLabel(usedUnit, parsed.qty)} (~${Math.round(totalGrams)}${unitChar} · ${food.source})`;

        if (segments.length === 1) {
          singleSegmentQty = parsed.qty;
          singleSegmentUnit = usedUnit;
        }
      }

      // Se o segmento tem palavras extras descritivas além da keyword (ex.: "bolo de chocolate com cobertura"), marca para refino IA
      const isNonTacoSource = food.source !== 'TACO' && food.source !== 'TBCA';
      if (isNonTacoSource) {
        heuristicCount++;
      }

      items.push({
        name: food.displayName,
        portion: portionText,
        reference_portion: food.referencePortion,
        source: food.source,
        calories: Math.round(food.calories * multiplier),
        protein_g: Number((food.protein_g * multiplier).toFixed(1)),
        carbs_g: Number((food.carbs_g * multiplier).toFixed(1)),
        fat_g: Number((food.fat_g * multiplier).toFixed(1)),
        fiber_g: Number((food.fiber_g * multiplier).toFixed(1)),
        data_available: true,
      });
    } else {
      const heuristicItem = estimateUnknownSegmentNutrition(seg, parsed);
      if (heuristicItem) {
        heuristicCount++;
        items.push(heuristicItem);
      } else {
        unmatchedCount++;
      }
    }
  }

  if (items.length === 0) {
    return {
      title: raw.slice(0, 60),
      description: `Não foi possível identificar "${raw}". Descreva o alimento com mais detalhes para calcular os nutrientes.`,
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      items: [
        {
          name: raw.slice(0, 48),
          portion: 'Não identificado',
          calories: 0,
          protein_g: 0,
          carbs_g: 0,
          fat_g: 0,
          fiber_g: 0,
          data_available: false,
        },
      ],
      detectedQty: null,
      detectedUnit: null,
      allMatched: false,
      needsAiRefinement: true,
      dataAvailable: false,
    };
  }

  const totalCal = Math.round(items.reduce((a, i) => a + i.calories, 0));
  const totalProt = Number(items.reduce((a, i) => a + i.protein_g, 0).toFixed(1));
  const totalCarbs = Number(items.reduce((a, i) => a + i.carbs_g, 0).toFixed(1));
  const totalFat = Number(items.reduce((a, i) => a + i.fat_g, 0).toFixed(1));
  const totalFiber = Number(items.reduce((a, i) => a + (i.fiber_g ?? 0), 0).toFixed(1));

  return {
    title: items.length === 1 ? items[0].name : raw.slice(0, 60),
    description: `${TACO_TBCA_DISCLAIMER}`,
    calories: totalCal,
    protein_g: totalProt,
    carbs_g: totalCarbs,
    fat_g: totalFat,
    fiber_g: totalFiber,
    items,
    detectedQty: singleSegmentQty,
    detectedUnit: singleSegmentUnit,
    allMatched: items.length > 0 && unmatchedCount === 0 && heuristicCount === 0,
    needsAiRefinement: unmatchedCount > 0 || heuristicCount > 0,
    dataAvailable: true,
  };
}
