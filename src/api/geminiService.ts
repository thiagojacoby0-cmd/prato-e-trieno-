import { GoogleGenAI, Type } from '@google/genai';
import type { CoachMessage, ExerciseTutorialSpec, MealCategory, TutorialArchetype, UserProfile } from '../types';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY não configurada no ambiente do servidor.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key !== 'MY_GEMINI_API_KEY');
}

export async function analyzeMealWithAI(params: {
  description?: string;
  imageBase64?: string;
  mimeType?: string;
  category?: MealCategory;
}) {
  const ai = getGeminiClient();
  const parts: Array<Record<string, unknown>> = [];

  if (params.imageBase64) {
    parts.push({
      inlineData: {
        mimeType: params.mimeType || 'image/jpeg',
        data: params.imageBase64,
      },
    });
  }

  parts.push({
    text: `Você é um nutricionista esportivo brasileiro especialista em análise nutricional.
Analise a refeição enviada${params.description ? ` (descrição: "${params.description}")` : ''}.
Identifique os alimentos, estime porções realistas em gramas/unidades brasileiras e calcule calorias, proteínas, carboidratos, gorduras e fibras.
Responda estritamente no formato JSON especificado, em português do Brasil.`,
  });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Nome curto e descritivo do prato' },
          description: { type: Type.STRING, description: 'Resumo nutricional breve do prato em português' },
          calories: { type: Type.INTEGER, description: 'Calorias totais estimadas (kcal)' },
          protein_g: { type: Type.NUMBER, description: 'Proteínas totais em gramas' },
          carbs_g: { type: Type.NUMBER, description: 'Carboidratos totais em gramas' },
          fat_g: { type: Type.NUMBER, description: 'Gorduras totais em gramas' },
          fiber_g: { type: Type.NUMBER, description: 'Fibras totais em gramas' },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                portion: { type: Type.STRING },
                calories: { type: Type.INTEGER },
                protein_g: { type: Type.NUMBER },
                carbs_g: { type: Type.NUMBER },
                fat_g: { type: Type.NUMBER },
              },
            },
          },
        },
        required: ['title', 'description', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'items'],
      },
    },
  });

  const jsonText = (response.text ?? '{}').trim();
  return JSON.parse(jsonText);
}

export async function generateMealPlanWithAI(params: {
  profile: UserProfile;
  preferences?: string;
}) {
  const ai = getGeminiClient();
  const { profile, preferences } = params;

  const prompt = `Crie um cardápio diário completo e prático com alimentos acessíveis no Brasil para o usuário abaixo:
- Nome: ${profile.full_name}
- Objetivo: ${profile.goal}
- Meta calórica diária: ${profile.daily_calorie_target} kcal
- Metas de macros: ${profile.protein_target_g}g proteína, ${profile.carbs_target_g}g carboidrato, ${profile.fat_target_g}g gordura
- Restrições alimentares: ${profile.dietary_restrictions.length ? profile.dietary_restrictions.join(', ') : 'Nenhuma'}
- Preferências adicionais do pedido: ${preferences || 'Cardápio equilibrado, saboroso e econômico'}

Divida em 5 refeições (cafe, almoco, lanche, jantar, ceia) cuja soma se aproxime da meta calórica e proteica.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          total_calories: { type: Type.INTEGER },
          total_protein_g: { type: Type.INTEGER },
          total_carbs_g: { type: Type.INTEGER },
          total_fat_g: { type: Type.INTEGER },
          notes: { type: Type.STRING },
          meals: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING, description: 'cafe, almoco, lanche, jantar ou ceia' },
                time: { type: Type.STRING, description: 'Horário sugerido, ex: 07:30' },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
                calories: { type: Type.INTEGER },
                protein_g: { type: Type.INTEGER },
                carbs_g: { type: Type.INTEGER },
                fat_g: { type: Type.INTEGER },
              },
              required: ['category', 'time', 'title', 'description', 'ingredients', 'calories', 'protein_g', 'carbs_g', 'fat_g'],
            },
          },
        },
        required: ['title', 'total_calories', 'total_protein_g', 'total_carbs_g', 'total_fat_g', 'notes', 'meals'],
      },
    },
  });

  const jsonText = (response.text ?? '{}').trim();
  return JSON.parse(jsonText);
}

export async function generateWorkoutWithAI(params: {
  profile: UserProfile;
  focus: string;
  durationMinutes: number;
  equipment: string[];
}) {
  const ai = getGeminiClient();
  const { profile, focus, durationMinutes, equipment } = params;

  const archetypeList =
    'squat, jump_squat, sumo_squat, bulgarian, lunge, calf_raise, jumping_jack, high_knees, mountain_climber, burpee, pushup, incline_pushup, diamond_pushup, tricep_dip, bicep_curl, plank, glute_bridge, donkey_kick, fire_hydrant, superman, dead_bug, crunch, russian_twist, leg_raise, side_plank, bicycle_crunch, bent_row, shoulder_press, lateral_raise, renegade_row, arm_circles, torso_twist, cat_camel, child_pose, cobra_stretch, hamstring_stretch, mobility_twist';

  const prompt = `Você é um personal trainer especialista em treino em casa e fisiologia do exercício.
Gere um treino completo e seguro em casa para:
- Nível: ${profile.workout_level}
- Objetivo principal: ${profile.goal}
- Foco solicitado: ${focus}
- Duração aproximada: ${durationMinutes} minutos
- Equipamentos disponíveis: ${equipment.length ? equipment.join(', ') : 'Apenas peso corporal'}

Estruture o treino em 3 fases obrigatórias:
1. "warmup": 2 exercícios breves de aquecimento articular/cardio leve (25-35s cada).
2. "exercises": entre 4 e 6 exercícios principais claros, com séries, duration_seconds (30 a 55), rest_seconds (15 a 40), correct_position, common_mistakes e demo_archetype.
3. "cooldown": 2 alongamentos finais relaxantes (30-40s cada).

Escolha "category" entre: Corpo inteiro, Abdômen, Peito, Braços, Pernas, Glúteos, Costas, Emagrecimento, Alongamento, Cardio.
Escolha "demo_archetype" para cada exercício obrigatoriamente entre: ${archetypeList}.`;

  const exerciseItemSchema = {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      name: { type: Type.STRING },
      muscle_group: { type: Type.STRING },
      target_muscles: { type: Type.ARRAY, items: { type: Type.STRING } },
      sets: { type: Type.INTEGER },
      reps_or_duration: { type: Type.STRING },
      duration_seconds: { type: Type.INTEGER },
      rest_seconds: { type: Type.INTEGER },
      instructions: { type: Type.STRING },
      correct_position: { type: Type.STRING },
      common_mistakes: { type: Type.STRING },
      demo_archetype: { type: Type.STRING },
      tips: { type: Type.STRING },
    },
    required: [
      'id',
      'name',
      'muscle_group',
      'sets',
      'reps_or_duration',
      'duration_seconds',
      'rest_seconds',
      'instructions',
      'correct_position',
      'common_mistakes',
      'demo_archetype',
    ],
  };

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          category: { type: Type.STRING },
          level: { type: Type.STRING, description: 'iniciante, intermediario ou avancado' },
          duration_minutes: { type: Type.INTEGER },
          estimated_calories: { type: Type.INTEGER },
          description: { type: Type.STRING },
          muscle_focus: { type: Type.ARRAY, items: { type: Type.STRING } },
          warmup: { type: Type.ARRAY, items: exerciseItemSchema },
          exercises: { type: Type.ARRAY, items: exerciseItemSchema },
          cooldown: { type: Type.ARRAY, items: exerciseItemSchema },
        },
        required: ['title', 'category', 'level', 'duration_minutes', 'estimated_calories', 'description', 'warmup', 'exercises', 'cooldown'],
      },
    },
  });

  const jsonText = (response.text ?? '{}').trim();
  return JSON.parse(jsonText);
}

export async function chatWithCoachAI(params: {
  profile: UserProfile;
  todayStats: {
    caloriesConsumed: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    waterMl: number;
    workoutsToday: number;
  };
  history: CoachMessage[];
  userMessage: string;
}): Promise<string> {
  const ai = getGeminiClient();
  const { profile, todayStats, history, userMessage } = params;

  const systemInstruction = `Você é o Personal Trainer e Nutricionista Inteligente oficial do aplicativo PRATO & TREINO ("Sua evolução começa aqui").
Responda sempre em português do Brasil, de forma prática, motivadora, científica e direta, sem rodeios ou jargões mecânicos.

DADOS ATUAIS DO ALUNO:
- Nome: ${profile.full_name}
- Idade: ${profile.age} anos | Sexo: ${profile.sex} | Altura: ${profile.height_cm} cm
- Peso atual: ${profile.current_weight_kg} kg | Peso meta: ${profile.target_weight_kg} kg
- Objetivo: ${profile.goal} | Nível de atividade: ${profile.activity_level} | Nível de treino: ${profile.workout_level}
- Restrições alimentares: ${profile.dietary_restrictions.join(', ') || 'Nenhuma'}
- Equipamentos em casa: ${profile.home_equipment.join(', ') || 'Peso corporal'}
- Metas diárias: ${profile.daily_calorie_target} kcal | Proteína ${profile.protein_target_g}g | Carbos ${profile.carbs_target_g}g | Gordura ${profile.fat_target_g}g | Água ${profile.water_target_ml}ml

PROGRESSO DE HOJE:
- Calorias ingeridas: ${todayStats.caloriesConsumed} kcal
- Macros ingeridos: ${todayStats.proteinG}g proteína, ${todayStats.carbsG}g carboidrato, ${todayStats.fatG}g gordura
- Água ingerida hoje: ${todayStats.waterMl} ml
- Treinos concluídos hoje: ${todayStats.workoutsToday}

Use esses números reais ao dar recomendações. Organize listas curtas quando útil e mantenha a resposta objetiva.`;

  const recentHistory = history.slice(-10).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [...recentHistory, { role: 'user', parts: [{ text: userMessage }] }],
    config: {
      systemInstruction,
    },
  });

  return (response.text ?? 'Desculpe, não consegui gerar uma resposta agora. Tente novamente em instantes.').trim();
}

export async function generateExerciseTutorialSpecWithAI(
  exerciseName: string,
  muscleGroup: string,
  instructions: string
): Promise<ExerciseTutorialSpec> {
  const ai = getGeminiClient();

  const prompt = `Você é um personal trainer especialista em biomecânica de exercícios em casa.
Para o exercício "${exerciseName}" (grupo muscular: "${muscleGroup || 'Corpo inteiro'}"), contexto: "${instructions || 'Execução padrão em casa'}":
1. Escolha o "archetype" mais próximo entre:
   squat, jump_squat, sumo_squat, bulgarian, lunge, calf_raise, jumping_jack, high_knees, mountain_climber, burpee, pushup, incline_pushup, diamond_pushup, tricep_dip, bicep_curl, plank, glute_bridge, donkey_kick, fire_hydrant, superman, dead_bug, crunch, russian_twist, leg_raise, side_plank, bicycle_crunch, bent_row, shoulder_press, lateral_raise, renegade_row, arm_circles, torso_twist, cat_camel, child_pose, cobra_stretch, hamstring_stretch, mobility_twist, custom.
2. Só use "custom" se nenhum dos 37 arquétipos acima representar o movimento; nesse caso preencha "custom_keyframes" com 3 poses normalizadas (x e y entre 0.15 e 0.88, onde y=0.86 é o chão).
3. Defina "tempo_seconds" (entre 1.8 e 4.5 segundos por repetição), "phase_labels" (exatamente 3 rótulos curtos de fase, ex: ["Posição inicial", "Descida controlada", "Subida firme"]), "target_zones" (entre: ["quadriceps", "glutes", "core", "chest", "back", "shoulders", "arms", "abs", "calves"]).
4. Forneça "preparation", "steps" (3 passos claros), "breathing" e "common_mistake" em português do Brasil.`;

  const poseJointSchema = {
    type: Type.OBJECT,
    properties: {
      x: { type: Type.NUMBER },
      y: { type: Type.NUMBER },
    },
    required: ['x', 'y'],
  };

  const skeletonPoseSchema = {
    type: Type.OBJECT,
    properties: {
      head: poseJointSchema,
      neck: poseJointSchema,
      hip: poseJointSchema,
      shoulderL: poseJointSchema,
      elbowL: poseJointSchema,
      wristL: poseJointSchema,
      shoulderR: poseJointSchema,
      elbowR: poseJointSchema,
      wristR: poseJointSchema,
      kneeL: poseJointSchema,
      ankleL: poseJointSchema,
      kneeR: poseJointSchema,
      ankleR: poseJointSchema,
    },
    required: [
      'head',
      'neck',
      'hip',
      'shoulderL',
      'elbowL',
      'wristL',
      'shoulderR',
      'elbowR',
      'wristR',
      'kneeL',
      'ankleL',
      'kneeR',
      'ankleR',
    ],
  };

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          archetype: { type: Type.STRING },
          tempo_seconds: { type: Type.NUMBER },
          phase_labels: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          target_zones: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          preparation: { type: Type.STRING },
          steps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          breathing: { type: Type.STRING },
          common_mistake: { type: Type.STRING },
          custom_keyframes: {
            type: Type.ARRAY,
            items: skeletonPoseSchema,
            nullable: true,
          },
        },
        required: [
          'archetype',
          'tempo_seconds',
          'phase_labels',
          'target_zones',
          'preparation',
          'steps',
          'breathing',
          'common_mistake',
        ],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<ExerciseTutorialSpec>;
  const phaseLabels: [string, string, string] = [
    parsed.phase_labels?.[0] || 'Posição inicial',
    parsed.phase_labels?.[1] || 'Fase de controle',
    parsed.phase_labels?.[2] || 'Retorno ativo',
  ];

  const keyframes =
    parsed.archetype === 'custom' && parsed.custom_keyframes && parsed.custom_keyframes.length === 3
      ? parsed.custom_keyframes
      : null;

  return {
    archetype: (parsed.archetype as TutorialArchetype) || 'squat',
    tempo_seconds: Math.min(5, Math.max(1.8, Number(parsed.tempo_seconds || 2.8))),
    phase_labels: phaseLabels,
    target_zones: parsed.target_zones?.length ? parsed.target_zones : ['core'],
    preparation: parsed.preparation || instructions,
    steps: parsed.steps?.length ? parsed.steps.slice(0, 4) : [instructions],
    breathing: parsed.breathing || 'Inspire na preparação e expire no esforço principal.',
    common_mistake: parsed.common_mistake || 'Evite perder o alinhamento da coluna durante o movimento.',
    custom_keyframes: keyframes,
  };
}
