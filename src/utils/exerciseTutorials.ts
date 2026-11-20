import type { ExerciseTutorialSpec, PoseJoint2D, SkeletonPose2D, TutorialArchetype } from '../types/index.ts';
import { EXERCISE_LIBRARY, inferArchetypeFromName } from '../database/exerciseLibrary.ts';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpJoint(a: PoseJoint2D, b: PoseJoint2D, t: number): PoseJoint2D {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function interpolatePose(a: SkeletonPose2D, b: SkeletonPose2D, t: number): SkeletonPose2D {
  return {
    head: lerpJoint(a.head, b.head, t),
    neck: lerpJoint(a.neck, b.neck, t),
    hip: lerpJoint(a.hip, b.hip, t),
    shoulderL: lerpJoint(a.shoulderL, b.shoulderL, t),
    elbowL: lerpJoint(a.elbowL, b.elbowL, t),
    wristL: lerpJoint(a.wristL, b.wristL, t),
    shoulderR: lerpJoint(a.shoulderR, b.shoulderR, t),
    elbowR: lerpJoint(a.elbowR, b.elbowR, t),
    wristR: lerpJoint(a.wristR, b.wristR, t),
    kneeL: lerpJoint(a.kneeL, b.kneeL, t),
    ankleL: lerpJoint(a.ankleL, b.ankleL, t),
    kneeR: lerpJoint(a.kneeR, b.kneeR, t),
    ankleR: lerpJoint(a.ankleR, b.ankleR, t),
  };
}

function easeInOut(t: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, t)));
}

function cycleThreeFrames(frames: [SkeletonPose2D, SkeletonPose2D, SkeletonPose2D], cycle: number): SkeletonPose2D {
  const c = ((cycle % 1) + 1) % 1;
  if (c < 0.38) {
    return interpolatePose(frames[0], frames[1], easeInOut(c / 0.38));
  }
  if (c < 0.62) {
    return interpolatePose(frames[1], frames[2], easeInOut((c - 0.38) / 0.24));
  }
  return interpolatePose(frames[2], frames[0], easeInOut((c - 0.62) / 0.38));
}

function cycleTwoFrames(a: SkeletonPose2D, b: SkeletonPose2D, cycle: number): SkeletonPose2D {
  const c = ((cycle % 1) + 1) % 1;
  const w = 0.5 - 0.5 * Math.cos(c * Math.PI * 2);
  return interpolatePose(a, b, w);
}

export function resolveLocalArchetype(exerciseName: string): TutorialArchetype {
  return inferArchetypeFromName(exerciseName);
}

const PHASE_PRESETS: Partial<
  Record<
    TutorialArchetype,
    {
      tempo_seconds: number;
      phase_labels: [string, string, string];
      breathing: string;
    }
  >
> = {
  squat: { tempo_seconds: 3.0, phase_labels: ['Base estável', 'Descida controlada', 'Empurre pelos calcanhares'], breathing: 'Inspire na descida e expire ao subir.' },
  jump_squat: { tempo_seconds: 2.2, phase_labels: ['Carga no agachamento', 'Salto vertical explosivo', 'Aterrissagem macia'], breathing: 'Inspire agachando e expire no salto.' },
  sumo_squat: { tempo_seconds: 3.0, phase_labels: ['Pés abertos a 45°', 'Descida profunda com pausa', 'Subida ativando glúteos'], breathing: 'Inspire na descida e expire subindo.' },
  bulgarian: { tempo_seconds: 3.2, phase_labels: ['Pé traseiro no banco', 'Descida vertical', 'Empurrão na perna frontal'], breathing: 'Inspire descendo e expire ao empurrar.' },
  lunge: { tempo_seconds: 2.8, phase_labels: ['Passo firme à frente', 'Dois joelhos a 90°', 'Retorno alternado'], breathing: 'Inspire ao descer e expire ao voltar.' },
  calf_raise: { tempo_seconds: 2.2, phase_labels: ['Calcanhares apoiados', 'Subida máxima na ponta', 'Descida controlada'], breathing: 'Expire subindo e inspire descendo.' },
  jumping_jack: { tempo_seconds: 1.5, phase_labels: ['Pés juntos', 'Abertura sincronizada', 'Retorno elástico'], breathing: 'Respiração ritmada contínua.' },
  high_knees: { tempo_seconds: 1.4, phase_labels: ['Postura ereta', 'Elevação alternada', 'Ritmo acelerado'], breathing: 'Expire rápido a cada passo.' },
  mountain_climber: { tempo_seconds: 1.6, phase_labels: ['Prancha alta travada', 'Joelho ao peito', 'Troca dinâmica'], breathing: 'Respiração fluida sem prender o ar.' },
  burpee: { tempo_seconds: 3.4, phase_labels: ['Agachar e apoiar mãos', 'Prancha alinhada', 'Retorno e extensão'], breathing: 'Expire na prancha e ao estender em pé.' },
  pushup: { tempo_seconds: 2.6, phase_labels: ['Prancha firme', 'Descida em 45°', 'Empurrão controlado'], breathing: 'Inspire descendo e expire empurrando.' },
  incline_pushup: { tempo_seconds: 2.6, phase_labels: ['Mãos no apoio elevado', 'Peito em direção à borda', 'Extensão dos braços'], breathing: 'Inspire descendo e expire empurrando.' },
  diamond_pushup: { tempo_seconds: 2.8, phase_labels: ['Mãos próximas no centro', 'Cotovelos rentes ao corpo', 'Contração de tríceps'], breathing: 'Inspire na descida e expire no topo.' },
  tricep_dip: { tempo_seconds: 2.6, phase_labels: ['Braços estendidos no banco', 'Cotovelos dobram atrás', 'Extensão firme de tríceps'], breathing: 'Inspire descendo e expire subindo.' },
  bicep_curl: { tempo_seconds: 2.5, phase_labels: ['Braços estendidos', 'Flexão contraindo bíceps', 'Descida lenta'], breathing: 'Expire ao subir o peso e inspire descendo.' },
  plank: { tempo_seconds: 3.5, phase_labels: ['Antebraços firmes', 'Core e glúteos travados', 'Sustentação alinhada'], breathing: 'Respiração lenta e controlada.' },
  glute_bridge: { tempo_seconds: 2.8, phase_labels: ['Pés firmes no chão', 'Elevação pélvica máxima', 'Descida controlada'], breathing: 'Expire subindo o quadril e inspire descendo.' },
  donkey_kick: { tempo_seconds: 2.4, phase_labels: ['Quatro apoios neutros', 'Empurrão do calcanhar', 'Retorno controlado'], breathing: 'Expire ao chutar para cima.' },
  fire_hydrant: { tempo_seconds: 2.4, phase_labels: ['Quatro apoios firmes', 'Abertura lateral a 90°', 'Descida sem rodar bacia'], breathing: 'Expire abrindo a perna lateralmente.' },
  superman: { tempo_seconds: 2.8, phase_labels: ['Corpo estendido no solo', 'Elevação dorsal suave', 'Relaxamento controlado'], breathing: 'Expire ao elevar peito e pernas.' },
  dead_bug: { tempo_seconds: 3.2, phase_labels: ['Lombar colada no solo', 'Extensão cruzada lenta', 'Retorno ao centro'], breathing: 'Expire enquanto estende braço e perna.' },
  crunch: { tempo_seconds: 2.4, phase_labels: ['Ombros apoiados', 'Flexão abdominal curta', 'Retorno sem soltar tudo'], breathing: 'Expire subindo as escápulas.' },
  russian_twist: { tempo_seconds: 2.4, phase_labels: ['Tronco inclinado a 45°', 'Rotação lateral controlada', 'Troca de lado'], breathing: 'Expire a cada giro do tronco.' },
  leg_raise: { tempo_seconds: 3.0, phase_labels: ['Pernas próximas ao solo', 'Elevação até 90°', 'Descida segurando a lombar'], breathing: 'Expire subindo e inspire controlando a descida.' },
  side_plank: { tempo_seconds: 3.0, phase_labels: ['Alinhamento lateral', 'Elevação firme do quadril', 'Sustentação oblíqua'], breathing: 'Respiração contínua mantendo o core rígido.' },
  bicycle_crunch: { tempo_seconds: 2.6, phase_labels: ['Escápulas elevadas', 'Ombro ao joelho oposto', 'Alternância cadenciada'], breathing: 'Expire em cada rotação cruzada.' },
  bent_row: { tempo_seconds: 2.8, phase_labels: ['Tronco inclinado neutro', 'Puxada fechando escápulas', 'Extensão controlada'], breathing: 'Expire ao puxar e inspire ao estender.' },
  shoulder_press: { tempo_seconds: 2.6, phase_labels: ['Pesos na linha da orelha', 'Empurrão acima da cabeça', 'Descida controlada'], breathing: 'Expire empurrando e inspire descendo.' },
  lateral_raise: { tempo_seconds: 2.5, phase_labels: ['Braços ao lado do tronco', 'Elevação até a linha do ombro', 'Descida resistida'], breathing: 'Expire ao elevar os braços.' },
  renegade_row: { tempo_seconds: 3.4, phase_labels: ['Flexão controlada', 'Remada unilateral estável', 'Quadril sem girar'], breathing: 'Expire na subida e em cada puxada.' },
  arm_circles: { tempo_seconds: 2.4, phase_labels: ['Postura aberta', 'Círculos amplos à frente', 'Inversão suave para trás'], breathing: 'Respiração profunda e contínua.' },
  torso_twist: { tempo_seconds: 2.4, phase_labels: ['Base firme', 'Rotação torácica fluida', 'Troca lateral suave'], breathing: 'Respiração livre e solta.' },
  knee_circles: { tempo_seconds: 2.2, phase_labels: ['Pés juntos e joelhos flexionados', 'Giro circular suave', 'Inversão controlada'], breathing: 'Respiração calma mantendo a coluna neutra.' },
  bird_dog: { tempo_seconds: 3.0, phase_labels: ['Quatro apoios firmes', 'Extensão cruzada braço e perna', 'Retorno alternado controlado'], breathing: 'Expire ao estender braço e perna mantendo o abdômen travado.' },
  box_pushup: { tempo_seconds: 2.5, phase_labels: ['Quatro apoios sobre os joelhos', 'Descida com cotovelos em 45°', 'Empurrão firme estendendo braços'], breathing: 'Inspire descendo o peito e expire empurrando o solo.' },
  pigeon_pose: { tempo_seconds: 4.0, phase_labels: ['Perna frontal flexionada à frente', 'Perna traseira estendida', 'Relaxamento profundo de quadril'], breathing: 'Inspire fundo e solte o ar relaxando glúteo e quadril.' },
  cat_camel: { tempo_seconds: 3.6, phase_labels: ['Quatro apoios neutro', 'Arqueamento Gato', 'Extensão Camelo'], breathing: 'Expire arredondando e inspire abrindo o peito.' },
  child_pose: { tempo_seconds: 4.0, phase_labels: ['Sentado nos calcanhares', 'Alongamento longo à frente', 'Relaxamento lombar'], breathing: 'Inspire expandindo as costelas e solte todo o ar.' },
  cobra_stretch: { tempo_seconds: 3.6, phase_labels: ['Quadril relaxado no chão', 'Abertura suave do peito', 'Alongamento abdominal'], breathing: 'Respiração calma e profunda.' },
  hamstring_stretch: { tempo_seconds: 3.6, phase_labels: ['Pernas estendidas', 'Flexão a partir do quadril', 'Sustentação sem trancos'], breathing: 'Solte o ar relaxando a musculatura posterior.' },
  mobility_twist: { tempo_seconds: 3.6, phase_labels: ['Base longa de afundo', 'Mão interna no tapete', 'Rotação abrindo o peito'], breathing: 'Inspire abrindo o braço para o teto.' },
};

export function buildLocalTutorialSpec(
  exerciseName: string,
  muscleGroup: string,
  instructions: string,
  explicitArchetype?: TutorialArchetype
): ExerciseTutorialSpec {
  const archetype = explicitArchetype || resolveLocalArchetype(exerciseName);
  const libMatch = Object.values(EXERCISE_LIBRARY).find(
    (ex) => ex.name.toLowerCase() === exerciseName.toLowerCase() || ex.demo_archetype === archetype
  );
  const phasePreset = PHASE_PRESETS[archetype];

  const targetZones = libMatch?.target_muscles?.length
    ? libMatch.target_muscles
    : inferZonesFromMuscleGroup(muscleGroup);

  return {
    archetype,
    tempo_seconds: phasePreset?.tempo_seconds || 2.8,
    phase_labels: phasePreset?.phase_labels || ['Posição inicial', 'Execução controlada', 'Retorno firme'],
    target_zones: targetZones,
    preparation: libMatch?.correct_position || instructions || 'Mantenha coluna neutra e abdômen ativo.',
    steps: [
      instructions || libMatch?.instructions || 'Execute o movimento com amplitude segura e controle total.',
      libMatch?.correct_position || 'Preserve o alinhamento das articulações do início ao fim da repetição.',
      'Retorne à posição inicial sem perder a tensão muscular controlada.',
    ],
    breathing: phasePreset?.breathing || 'Inspire na fase de descida/preparo e expire no esforço principal.',
    common_mistake:
      libMatch?.common_mistakes || 'Evite compensar com a lombar ou acelerar além do controle motor.',
    custom_keyframes: null,
  };
}

function inferZonesFromMuscleGroup(group: string): string[] {
  const g = group.toLowerCase();
  const zones: string[] = [];
  if (g.includes('quadríceps') || g.includes('perna') || g.includes('coxa')) zones.push('quadriceps');
  if (g.includes('glúteo') || g.includes('gluteo') || g.includes('posterior')) zones.push('glutes');
  if (g.includes('abdômen') || g.includes('abdomen') || g.includes('oblíquo')) zones.push('abs');
  if (g.includes('core') || g.includes('lombar')) zones.push('core');
  if (g.includes('peit')) zones.push('chest');
  if (g.includes('ombro') || g.includes('deltoide')) zones.push('shoulders');
  if (g.includes('costa') || g.includes('dorsal') || g.includes('coluna')) zones.push('back');
  if (g.includes('braço') || g.includes('tríceps') || g.includes('bíceps')) zones.push('arms');
  if (g.includes('panturrilha')) zones.push('calves');
  return zones.length > 0 ? zones : ['core', 'quadriceps'];
}

export interface PoseFrameOutput {
  pose: SkeletonPose2D;
  phaseIndex: 0 | 1 | 2;
  viewType: 'front' | 'side';
  prop?: 'chair_back' | 'bench' | 'dumbbells' | 'mat';
}

export function getPoseForSpec(spec: ExerciseTutorialSpec, cycleProgress: number): PoseFrameOutput {
  const c = ((cycleProgress % 1) + 1) % 1;
  const phaseIndex: 0 | 1 | 2 = c < 0.34 ? 0 : c < 0.72 ? 1 : 2;

  if (spec.archetype === 'custom' && spec.custom_keyframes && spec.custom_keyframes.length === 3) {
    return {
      pose: cycleThreeFrames(spec.custom_keyframes, c),
      phaseIndex,
      viewType: 'side',
    };
  }

  switch (spec.archetype) {
    case 'squat': {
      const top: SkeletonPose2D = {
        head: { x: 0.5, y: 0.2 }, neck: { x: 0.5, y: 0.27 }, hip: { x: 0.49, y: 0.5 },
        shoulderL: { x: 0.48, y: 0.29 }, elbowL: { x: 0.5, y: 0.41 }, wristL: { x: 0.54, y: 0.51 },
        shoulderR: { x: 0.52, y: 0.29 }, elbowR: { x: 0.54, y: 0.41 }, wristR: { x: 0.57, y: 0.51 },
        kneeL: { x: 0.49, y: 0.67 }, ankleL: { x: 0.49, y: 0.84 },
        kneeR: { x: 0.52, y: 0.67 }, ankleR: { x: 0.52, y: 0.84 },
      };
      const bottom: SkeletonPose2D = {
        head: { x: 0.54, y: 0.36 }, neck: { x: 0.52, y: 0.43 }, hip: { x: 0.38, y: 0.63 },
        shoulderL: { x: 0.5, y: 0.44 }, elbowL: { x: 0.61, y: 0.46 }, wristL: { x: 0.71, y: 0.44 },
        shoulderR: { x: 0.53, y: 0.44 }, elbowR: { x: 0.63, y: 0.46 }, wristR: { x: 0.73, y: 0.45 },
        kneeL: { x: 0.56, y: 0.65 }, ankleL: { x: 0.49, y: 0.84 },
        kneeR: { x: 0.59, y: 0.66 }, ankleR: { x: 0.52, y: 0.84 },
      };
      return { pose: cycleTwoFrames(top, bottom, c), phaseIndex, viewType: 'side' };
    }

    case 'sumo_squat': {
      const top: SkeletonPose2D = {
        head: { x: 0.5, y: 0.2 }, neck: { x: 0.5, y: 0.27 }, hip: { x: 0.5, y: 0.5 },
        shoulderL: { x: 0.43, y: 0.29 }, elbowL: { x: 0.41, y: 0.41 }, wristL: { x: 0.45, y: 0.51 },
        shoulderR: { x: 0.57, y: 0.29 }, elbowR: { x: 0.59, y: 0.41 }, wristR: { x: 0.55, y: 0.51 },
        kneeL: { x: 0.41, y: 0.67 }, ankleL: { x: 0.36, y: 0.84 },
        kneeR: { x: 0.59, y: 0.67 }, ankleR: { x: 0.64, y: 0.84 },
      };
      const bottom: SkeletonPose2D = {
        head: { x: 0.5, y: 0.36 }, neck: { x: 0.5, y: 0.43 }, hip: { x: 0.5, y: 0.64 },
        shoulderL: { x: 0.43, y: 0.45 }, elbowL: { x: 0.45, y: 0.55 }, wristL: { x: 0.49, y: 0.61 },
        shoulderR: { x: 0.57, y: 0.45 }, elbowR: { x: 0.55, y: 0.55 }, wristR: { x: 0.51, y: 0.61 },
        kneeL: { x: 0.36, y: 0.66 }, ankleL: { x: 0.34, y: 0.84 },
        kneeR: { x: 0.64, y: 0.66 }, ankleR: { x: 0.66, y: 0.84 },
      };
      return { pose: cycleTwoFrames(top, bottom, c), phaseIndex, viewType: 'front' };
    }

    case 'jump_squat': {
      const squatLow: SkeletonPose2D = {
        head: { x: 0.52, y: 0.38 }, neck: { x: 0.5, y: 0.45 }, hip: { x: 0.39, y: 0.64 },
        shoulderL: { x: 0.48, y: 0.46 }, elbowL: { x: 0.4, y: 0.56 }, wristL: { x: 0.33, y: 0.61 },
        shoulderR: { x: 0.51, y: 0.46 }, elbowR: { x: 0.43, y: 0.56 }, wristR: { x: 0.36, y: 0.62 },
        kneeL: { x: 0.55, y: 0.66 }, ankleL: { x: 0.48, y: 0.84 },
        kneeR: { x: 0.58, y: 0.67 }, ankleR: { x: 0.52, y: 0.84 },
      };
      const midAir: SkeletonPose2D = {
        head: { x: 0.5, y: 0.11 }, neck: { x: 0.5, y: 0.18 }, hip: { x: 0.49, y: 0.4 },
        shoulderL: { x: 0.48, y: 0.2 }, elbowL: { x: 0.45, y: 0.12 }, wristL: { x: 0.44, y: 0.05 },
        shoulderR: { x: 0.52, y: 0.2 }, elbowR: { x: 0.55, y: 0.12 }, wristR: { x: 0.56, y: 0.05 },
        kneeL: { x: 0.49, y: 0.56 }, ankleL: { x: 0.48, y: 0.72 },
        kneeR: { x: 0.52, y: 0.56 }, ankleR: { x: 0.52, y: 0.72 },
      };
      const landReady: SkeletonPose2D = {
        head: { x: 0.51, y: 0.24 }, neck: { x: 0.5, y: 0.31 }, hip: { x: 0.46, y: 0.53 },
        shoulderL: { x: 0.48, y: 0.33 }, elbowL: { x: 0.54, y: 0.42 }, wristL: { x: 0.62, y: 0.45 },
        shoulderR: { x: 0.52, y: 0.33 }, elbowR: { x: 0.57, y: 0.42 }, wristR: { x: 0.64, y: 0.45 },
        kneeL: { x: 0.51, y: 0.68 }, ankleL: { x: 0.48, y: 0.84 },
        kneeR: { x: 0.54, y: 0.68 }, ankleR: { x: 0.52, y: 0.84 },
      };
      return { pose: cycleThreeFrames([squatLow, midAir, landReady], c), phaseIndex, viewType: 'side' };
    }

    case 'bulgarian': {
      const top: SkeletonPose2D = {
        head: { x: 0.56, y: 0.22 }, neck: { x: 0.55, y: 0.29 }, hip: { x: 0.53, y: 0.51 },
        shoulderL: { x: 0.53, y: 0.31 }, elbowL: { x: 0.53, y: 0.43 }, wristL: { x: 0.55, y: 0.53 },
        shoulderR: { x: 0.57, y: 0.31 }, elbowR: { x: 0.58, y: 0.43 }, wristR: { x: 0.59, y: 0.53 },
        kneeL: { x: 0.43, y: 0.63 }, ankleL: { x: 0.31, y: 0.64 },
        kneeR: { x: 0.6, y: 0.68 }, ankleR: { x: 0.61, y: 0.84 },
      };
      const bottom: SkeletonPose2D = {
        head: { x: 0.58, y: 0.35 }, neck: { x: 0.56, y: 0.42 }, hip: { x: 0.51, y: 0.63 },
        shoulderL: { x: 0.54, y: 0.43 }, elbowL: { x: 0.55, y: 0.55 }, wristL: { x: 0.58, y: 0.64 },
        shoulderR: { x: 0.58, y: 0.43 }, elbowR: { x: 0.6, y: 0.55 }, wristR: { x: 0.62, y: 0.64 },
        kneeL: { x: 0.46, y: 0.78 }, ankleL: { x: 0.31, y: 0.64 },
        kneeR: { x: 0.66, y: 0.66 }, ankleR: { x: 0.63, y: 0.84 },
      };
      return { pose: cycleTwoFrames(top, bottom, c), phaseIndex, viewType: 'side', prop: 'chair_back' };
    }

    case 'lunge': {
      const stand: SkeletonPose2D = {
        head: { x: 0.5, y: 0.2 }, neck: { x: 0.5, y: 0.27 }, hip: { x: 0.5, y: 0.5 },
        shoulderL: { x: 0.48, y: 0.29 }, elbowL: { x: 0.48, y: 0.41 }, wristL: { x: 0.5, y: 0.51 },
        shoulderR: { x: 0.52, y: 0.29 }, elbowR: { x: 0.52, y: 0.41 }, wristR: { x: 0.53, y: 0.51 },
        kneeL: { x: 0.48, y: 0.67 }, ankleL: { x: 0.47, y: 0.84 },
        kneeR: { x: 0.52, y: 0.67 }, ankleR: { x: 0.53, y: 0.84 },
      };
      const lungeLow: SkeletonPose2D = {
        head: { x: 0.5, y: 0.33 }, neck: { x: 0.5, y: 0.4 }, hip: { x: 0.49, y: 0.61 },
        shoulderL: { x: 0.48, y: 0.42 }, elbowL: { x: 0.46, y: 0.53 }, wristL: { x: 0.49, y: 0.61 },
        shoulderR: { x: 0.52, y: 0.42 }, elbowR: { x: 0.54, y: 0.53 }, wristR: { x: 0.52, y: 0.61 },
        kneeL: { x: 0.42, y: 0.77 }, ankleL: { x: 0.31, y: 0.83 },
        kneeR: { x: 0.65, y: 0.64 }, ankleR: { x: 0.66, y: 0.84 },
      };
      return { pose: cycleTwoFrames(stand, lungeLow, c), phaseIndex, viewType: 'side' };
    }

    case 'calf_raise': {
      const flat: SkeletonPose2D = {
        head: { x: 0.5, y: 0.22 }, neck: { x: 0.5, y: 0.29 }, hip: { x: 0.5, y: 0.52 },
        shoulderL: { x: 0.48, y: 0.31 }, elbowL: { x: 0.48, y: 0.43 }, wristL: { x: 0.5, y: 0.53 },
        shoulderR: { x: 0.52, y: 0.31 }, elbowR: { x: 0.52, y: 0.43 }, wristR: { x: 0.53, y: 0.53 },
        kneeL: { x: 0.49, y: 0.68 }, ankleL: { x: 0.49, y: 0.84 },
        kneeR: { x: 0.52, y: 0.68 }, ankleR: { x: 0.52, y: 0.84 },
      };
      const tiptoe: SkeletonPose2D = {
        ...flat,
        head: { x: 0.5, y: 0.17 }, neck: { x: 0.5, y: 0.24 }, hip: { x: 0.5, y: 0.47 },
        shoulderL: { x: 0.48, y: 0.26 }, elbowL: { x: 0.48, y: 0.38 }, wristL: { x: 0.5, y: 0.48 },
        shoulderR: { x: 0.52, y: 0.26 }, elbowR: { x: 0.52, y: 0.38 }, wristR: { x: 0.53, y: 0.48 },
        kneeL: { x: 0.49, y: 0.63 }, ankleL: { x: 0.49, y: 0.79 },
        kneeR: { x: 0.52, y: 0.63 }, ankleR: { x: 0.52, y: 0.79 },
      };
      return { pose: cycleTwoFrames(flat, tiptoe, c), phaseIndex, viewType: 'side' };
    }

    case 'jumping_jack': {
      const closed: SkeletonPose2D = {
        head: { x: 0.5, y: 0.2 }, neck: { x: 0.5, y: 0.27 }, hip: { x: 0.5, y: 0.51 },
        shoulderL: { x: 0.44, y: 0.29 }, elbowL: { x: 0.42, y: 0.41 }, wristL: { x: 0.42, y: 0.53 },
        shoulderR: { x: 0.56, y: 0.29 }, elbowR: { x: 0.58, y: 0.41 }, wristR: { x: 0.58, y: 0.53 },
        kneeL: { x: 0.47, y: 0.67 }, ankleL: { x: 0.47, y: 0.84 },
        kneeR: { x: 0.53, y: 0.67 }, ankleR: { x: 0.53, y: 0.84 },
      };
      const open: SkeletonPose2D = {
        head: { x: 0.5, y: 0.17 }, neck: { x: 0.5, y: 0.24 }, hip: { x: 0.5, y: 0.48 },
        shoulderL: { x: 0.44, y: 0.26 }, elbowL: { x: 0.36, y: 0.17 }, wristL: { x: 0.44, y: 0.08 },
        shoulderR: { x: 0.56, y: 0.26 }, elbowR: { x: 0.64, y: 0.17 }, wristR: { x: 0.56, y: 0.08 },
        kneeL: { x: 0.41, y: 0.66 }, ankleL: { x: 0.36, y: 0.83 },
        kneeR: { x: 0.59, y: 0.66 }, ankleR: { x: 0.64, y: 0.83 },
      };
      return { pose: cycleTwoFrames(closed, open, c), phaseIndex, viewType: 'front' };
    }

    case 'high_knees': {
      const leftUp: SkeletonPose2D = {
        head: { x: 0.51, y: 0.2 }, neck: { x: 0.5, y: 0.27 }, hip: { x: 0.49, y: 0.5 },
        shoulderL: { x: 0.48, y: 0.29 }, elbowL: { x: 0.43, y: 0.39 }, wristL: { x: 0.52, y: 0.36 },
        shoulderR: { x: 0.52, y: 0.29 }, elbowR: { x: 0.57, y: 0.4 }, wristR: { x: 0.63, y: 0.33 },
        kneeL: { x: 0.63, y: 0.5 }, ankleL: { x: 0.61, y: 0.66 },
        kneeR: { x: 0.49, y: 0.68 }, ankleR: { x: 0.48, y: 0.84 },
      };
      const rightUp: SkeletonPose2D = {
        ...leftUp,
        elbowL: { x: 0.57, y: 0.4 }, wristL: { x: 0.63, y: 0.33 },
        elbowR: { x: 0.43, y: 0.39 }, wristR: { x: 0.52, y: 0.36 },
        kneeL: { x: 0.49, y: 0.68 }, ankleL: { x: 0.48, y: 0.84 },
        kneeR: { x: 0.63, y: 0.5 }, ankleR: { x: 0.61, y: 0.66 },
      };
      return { pose: cycleTwoFrames(leftUp, rightUp, c), phaseIndex, viewType: 'side' };
    }

    case 'mountain_climber': {
      const leftIn: SkeletonPose2D = {
        head: { x: 0.72, y: 0.5 }, neck: { x: 0.66, y: 0.54 }, hip: { x: 0.45, y: 0.61 },
        shoulderL: { x: 0.65, y: 0.55 }, elbowL: { x: 0.66, y: 0.69 }, wristL: { x: 0.66, y: 0.84 },
        shoulderR: { x: 0.67, y: 0.56 }, elbowR: { x: 0.68, y: 0.7 }, wristR: { x: 0.68, y: 0.84 },
        kneeL: { x: 0.57, y: 0.68 }, ankleL: { x: 0.52, y: 0.81 },
        kneeR: { x: 0.34, y: 0.73 }, ankleR: { x: 0.22, y: 0.83 },
      };
      const rightIn: SkeletonPose2D = {
        ...leftIn,
        kneeL: { x: 0.34, y: 0.73 }, ankleL: { x: 0.22, y: 0.83 },
        kneeR: { x: 0.57, y: 0.68 }, ankleR: { x: 0.52, y: 0.81 },
      };
      return { pose: cycleTwoFrames(leftIn, rightIn, c), phaseIndex, viewType: 'side', prop: 'mat' };
    }

    case 'burpee': {
      const squatHands: SkeletonPose2D = {
        head: { x: 0.57, y: 0.47 }, neck: { x: 0.54, y: 0.54 }, hip: { x: 0.42, y: 0.69 },
        shoulderL: { x: 0.54, y: 0.56 }, elbowL: { x: 0.57, y: 0.7 }, wristL: { x: 0.58, y: 0.84 },
        shoulderR: { x: 0.56, y: 0.56 }, elbowR: { x: 0.59, y: 0.7 }, wristR: { x: 0.6, y: 0.84 },
        kneeL: { x: 0.52, y: 0.7 }, ankleL: { x: 0.46, y: 0.84 },
        kneeR: { x: 0.54, y: 0.71 }, ankleR: { x: 0.49, y: 0.84 },
      };
      const plank: SkeletonPose2D = {
        head: { x: 0.73, y: 0.51 }, neck: { x: 0.67, y: 0.55 }, hip: { x: 0.44, y: 0.63 },
        shoulderL: { x: 0.66, y: 0.56 }, elbowL: { x: 0.66, y: 0.7 }, wristL: { x: 0.66, y: 0.84 },
        shoulderR: { x: 0.68, y: 0.56 }, elbowR: { x: 0.68, y: 0.7 }, wristR: { x: 0.68, y: 0.84 },
        kneeL: { x: 0.33, y: 0.73 }, ankleL: { x: 0.22, y: 0.84 },
        kneeR: { x: 0.35, y: 0.73 }, ankleR: { x: 0.24, y: 0.84 },
      };
      const standReach: SkeletonPose2D = {
        head: { x: 0.5, y: 0.19 }, neck: { x: 0.5, y: 0.26 }, hip: { x: 0.49, y: 0.5 },
        shoulderL: { x: 0.48, y: 0.28 }, elbowL: { x: 0.47, y: 0.17 }, wristL: { x: 0.47, y: 0.08 },
        shoulderR: { x: 0.52, y: 0.28 }, elbowR: { x: 0.53, y: 0.17 }, wristR: { x: 0.53, y: 0.08 },
        kneeL: { x: 0.49, y: 0.67 }, ankleL: { x: 0.48, y: 0.84 },
        kneeR: { x: 0.52, y: 0.67 }, ankleR: { x: 0.51, y: 0.84 },
      };
      return { pose: cycleThreeFrames([standReach, squatHands, plank], c), phaseIndex, viewType: 'side' };
    }

    case 'pushup':
    case 'diamond_pushup': {
      const top: SkeletonPose2D = {
        head: { x: 0.74, y: 0.5 }, neck: { x: 0.68, y: 0.55 }, hip: { x: 0.45, y: 0.65 },
        shoulderL: { x: 0.66, y: 0.56 }, elbowL: { x: 0.66, y: 0.7 }, wristL: { x: 0.67, y: 0.84 },
        shoulderR: { x: 0.69, y: 0.56 }, elbowR: { x: 0.69, y: 0.7 }, wristR: { x: 0.69, y: 0.84 },
        kneeL: { x: 0.34, y: 0.74 }, ankleL: { x: 0.22, y: 0.84 },
        kneeR: { x: 0.36, y: 0.74 }, ankleR: { x: 0.24, y: 0.84 },
      };
      const low: SkeletonPose2D = {
        head: { x: 0.75, y: 0.68 }, neck: { x: 0.68, y: 0.71 }, hip: { x: 0.45, y: 0.75 },
        shoulderL: { x: 0.66, y: 0.71 }, elbowL: { x: 0.6, y: 0.66 }, wristL: { x: 0.67, y: 0.84 },
        shoulderR: { x: 0.69, y: 0.71 }, elbowR: { x: 0.62, y: 0.67 }, wristR: { x: 0.69, y: 0.84 },
        kneeL: { x: 0.34, y: 0.79 }, ankleL: { x: 0.22, y: 0.84 },
        kneeR: { x: 0.36, y: 0.79 }, ankleR: { x: 0.24, y: 0.84 },
      };
      return { pose: cycleTwoFrames(top, low, c), phaseIndex, viewType: 'side', prop: 'mat' };
    }

    case 'incline_pushup': {
      const top: SkeletonPose2D = {
        head: { x: 0.68, y: 0.34 }, neck: { x: 0.62, y: 0.39 }, hip: { x: 0.41, y: 0.6 },
        shoulderL: { x: 0.61, y: 0.41 }, elbowL: { x: 0.64, y: 0.53 }, wristL: { x: 0.67, y: 0.64 },
        shoulderR: { x: 0.63, y: 0.41 }, elbowR: { x: 0.66, y: 0.53 }, wristR: { x: 0.69, y: 0.64 },
        kneeL: { x: 0.32, y: 0.72 }, ankleL: { x: 0.22, y: 0.84 },
        kneeR: { x: 0.34, y: 0.72 }, ankleR: { x: 0.24, y: 0.84 },
      };
      const low: SkeletonPose2D = {
        ...top,
        head: { x: 0.72, y: 0.46 }, neck: { x: 0.66, y: 0.51 }, hip: { x: 0.42, y: 0.67 },
        shoulderL: { x: 0.65, y: 0.53 }, elbowL: { x: 0.59, y: 0.56 },
        shoulderR: { x: 0.67, y: 0.53 }, elbowR: { x: 0.61, y: 0.57 },
      };
      return { pose: cycleTwoFrames(top, low, c), phaseIndex, viewType: 'side', prop: 'bench' };
    }

    case 'tricep_dip': {
      const top: SkeletonPose2D = {
        head: { x: 0.42, y: 0.34 }, neck: { x: 0.41, y: 0.41 }, hip: { x: 0.42, y: 0.62 },
        shoulderL: { x: 0.39, y: 0.42 }, elbowL: { x: 0.35, y: 0.53 }, wristL: { x: 0.34, y: 0.64 },
        shoulderR: { x: 0.43, y: 0.42 }, elbowR: { x: 0.38, y: 0.53 }, wristR: { x: 0.36, y: 0.64 },
        kneeL: { x: 0.57, y: 0.65 }, ankleL: { x: 0.58, y: 0.84 },
        kneeR: { x: 0.59, y: 0.65 }, ankleR: { x: 0.6, y: 0.84 },
      };
      const low: SkeletonPose2D = {
        ...top,
        head: { x: 0.44, y: 0.48 }, neck: { x: 0.42, y: 0.55 }, hip: { x: 0.44, y: 0.74 },
        shoulderL: { x: 0.4, y: 0.56 }, elbowL: { x: 0.3, y: 0.57 },
        shoulderR: { x: 0.43, y: 0.56 }, elbowR: { x: 0.32, y: 0.58 },
        kneeL: { x: 0.58, y: 0.69 }, kneeR: { x: 0.6, y: 0.69 },
      };
      return { pose: cycleTwoFrames(top, low, c), phaseIndex, viewType: 'side', prop: 'chair_back' };
    }

    case 'bicep_curl': {
      const down: SkeletonPose2D = {
        head: { x: 0.5, y: 0.2 }, neck: { x: 0.5, y: 0.27 }, hip: { x: 0.5, y: 0.51 },
        shoulderL: { x: 0.44, y: 0.29 }, elbowL: { x: 0.43, y: 0.41 }, wristL: { x: 0.42, y: 0.53 },
        shoulderR: { x: 0.56, y: 0.29 }, elbowR: { x: 0.57, y: 0.41 }, wristR: { x: 0.58, y: 0.53 },
        kneeL: { x: 0.47, y: 0.67 }, ankleL: { x: 0.47, y: 0.84 },
        kneeR: { x: 0.53, y: 0.67 }, ankleR: { x: 0.53, y: 0.84 },
      };
      const up: SkeletonPose2D = {
        ...down,
        wristL: { x: 0.43, y: 0.3 },
        wristR: { x: 0.57, y: 0.3 },
      };
      return { pose: cycleTwoFrames(down, up, c), phaseIndex, viewType: 'front', prop: 'dumbbells' };
    }

    case 'lateral_raise': {
      const down: SkeletonPose2D = {
        head: { x: 0.5, y: 0.2 }, neck: { x: 0.5, y: 0.27 }, hip: { x: 0.5, y: 0.51 },
        shoulderL: { x: 0.44, y: 0.29 }, elbowL: { x: 0.42, y: 0.41 }, wristL: { x: 0.42, y: 0.53 },
        shoulderR: { x: 0.56, y: 0.29 }, elbowR: { x: 0.58, y: 0.41 }, wristR: { x: 0.58, y: 0.53 },
        kneeL: { x: 0.47, y: 0.67 }, ankleL: { x: 0.47, y: 0.84 },
        kneeR: { x: 0.53, y: 0.67 }, ankleR: { x: 0.53, y: 0.84 },
      };
      const raised: SkeletonPose2D = {
        ...down,
        elbowL: { x: 0.34, y: 0.3 }, wristL: { x: 0.24, y: 0.3 },
        elbowR: { x: 0.66, y: 0.3 }, wristR: { x: 0.76, y: 0.3 },
      };
      return { pose: cycleTwoFrames(down, raised, c), phaseIndex, viewType: 'front', prop: 'dumbbells' };
    }

    case 'arm_circles': {
      const a: SkeletonPose2D = {
        head: { x: 0.5, y: 0.2 }, neck: { x: 0.5, y: 0.27 }, hip: { x: 0.5, y: 0.51 },
        shoulderL: { x: 0.44, y: 0.29 }, elbowL: { x: 0.35, y: 0.25 }, wristL: { x: 0.27, y: 0.2 },
        shoulderR: { x: 0.56, y: 0.29 }, elbowR: { x: 0.65, y: 0.25 }, wristR: { x: 0.73, y: 0.2 },
        kneeL: { x: 0.47, y: 0.67 }, ankleL: { x: 0.47, y: 0.84 },
        kneeR: { x: 0.53, y: 0.67 }, ankleR: { x: 0.53, y: 0.84 },
      };
      const b: SkeletonPose2D = {
        ...a,
        elbowL: { x: 0.35, y: 0.35 }, wristL: { x: 0.27, y: 0.4 },
        elbowR: { x: 0.65, y: 0.35 }, wristR: { x: 0.73, y: 0.4 },
      };
      return { pose: cycleTwoFrames(a, b, c), phaseIndex, viewType: 'front' };
    }

    case 'torso_twist': {
      const left: SkeletonPose2D = {
        head: { x: 0.5, y: 0.2 }, neck: { x: 0.5, y: 0.27 }, hip: { x: 0.5, y: 0.51 },
        shoulderL: { x: 0.46, y: 0.29 }, elbowL: { x: 0.39, y: 0.33 }, wristL: { x: 0.44, y: 0.34 },
        shoulderR: { x: 0.54, y: 0.29 }, elbowR: { x: 0.48, y: 0.35 }, wristR: { x: 0.42, y: 0.35 },
        kneeL: { x: 0.46, y: 0.67 }, ankleL: { x: 0.45, y: 0.84 },
        kneeR: { x: 0.54, y: 0.67 }, ankleR: { x: 0.55, y: 0.84 },
      };
      const right: SkeletonPose2D = {
        ...left,
        elbowL: { x: 0.52, y: 0.35 }, wristL: { x: 0.58, y: 0.35 },
        elbowR: { x: 0.61, y: 0.33 }, wristR: { x: 0.56, y: 0.34 },
      };
      return { pose: cycleTwoFrames(left, right, c), phaseIndex, viewType: 'front' };
    }

    case 'plank': {
      const breathe = 0.008 * Math.sin(c * Math.PI * 2);
      const pose: SkeletonPose2D = {
        head: { x: 0.74, y: 0.63 + breathe }, neck: { x: 0.68, y: 0.66 + breathe }, hip: { x: 0.44, y: 0.68 + breathe * 0.5 },
        shoulderL: { x: 0.66, y: 0.67 + breathe }, elbowL: { x: 0.66, y: 0.82 }, wristL: { x: 0.73, y: 0.83 },
        shoulderR: { x: 0.68, y: 0.67 + breathe }, elbowR: { x: 0.68, y: 0.82 }, wristR: { x: 0.75, y: 0.83 },
        kneeL: { x: 0.33, y: 0.75 }, ankleL: { x: 0.21, y: 0.84 },
        kneeR: { x: 0.35, y: 0.75 }, ankleR: { x: 0.23, y: 0.84 },
      };
      return { pose, phaseIndex, viewType: 'side', prop: 'mat' };
    }

    case 'glute_bridge': {
      const down: SkeletonPose2D = {
        head: { x: 0.25, y: 0.77 }, neck: { x: 0.31, y: 0.81 }, hip: { x: 0.5, y: 0.82 },
        shoulderL: { x: 0.32, y: 0.81 }, elbowL: { x: 0.4, y: 0.83 }, wristL: { x: 0.49, y: 0.84 },
        shoulderR: { x: 0.32, y: 0.82 }, elbowR: { x: 0.4, y: 0.83 }, wristR: { x: 0.49, y: 0.84 },
        kneeL: { x: 0.64, y: 0.67 }, ankleL: { x: 0.7, y: 0.84 },
        kneeR: { x: 0.65, y: 0.68 }, ankleR: { x: 0.71, y: 0.84 },
      };
      const up: SkeletonPose2D = {
        ...down,
        hip: { x: 0.51, y: 0.62 },
        kneeL: { x: 0.64, y: 0.58 },
        kneeR: { x: 0.65, y: 0.59 },
      };
      return { pose: cycleTwoFrames(down, up, c), phaseIndex, viewType: 'side', prop: 'mat' };
    }

    case 'donkey_kick': {
      const base: SkeletonPose2D = {
        head: { x: 0.7, y: 0.53 }, neck: { x: 0.64, y: 0.57 }, hip: { x: 0.4, y: 0.59 },
        shoulderL: { x: 0.63, y: 0.58 }, elbowL: { x: 0.64, y: 0.71 }, wristL: { x: 0.64, y: 0.84 },
        shoulderR: { x: 0.65, y: 0.58 }, elbowR: { x: 0.66, y: 0.71 }, wristR: { x: 0.66, y: 0.84 },
        kneeL: { x: 0.4, y: 0.83 }, ankleL: { x: 0.25, y: 0.84 },
        kneeR: { x: 0.41, y: 0.79 }, ankleR: { x: 0.28, y: 0.8 },
      };
      const kicked: SkeletonPose2D = {
        ...base,
        kneeR: { x: 0.27, y: 0.54 },
        ankleR: { x: 0.24, y: 0.4 },
      };
      return { pose: cycleTwoFrames(base, kicked, c), phaseIndex, viewType: 'side', prop: 'mat' };
    }

    case 'fire_hydrant': {
      const base: SkeletonPose2D = {
        head: { x: 0.7, y: 0.53 }, neck: { x: 0.64, y: 0.57 }, hip: { x: 0.4, y: 0.59 },
        shoulderL: { x: 0.63, y: 0.58 }, elbowL: { x: 0.64, y: 0.71 }, wristL: { x: 0.64, y: 0.84 },
        shoulderR: { x: 0.65, y: 0.58 }, elbowR: { x: 0.66, y: 0.71 }, wristR: { x: 0.66, y: 0.84 },
        kneeL: { x: 0.4, y: 0.83 }, ankleL: { x: 0.25, y: 0.84 },
        kneeR: { x: 0.42, y: 0.81 }, ankleR: { x: 0.27, y: 0.83 },
      };
      const lifted: SkeletonPose2D = {
        ...base,
        kneeR: { x: 0.41, y: 0.61 },
        ankleR: { x: 0.29, y: 0.65 },
      };
      return { pose: cycleTwoFrames(base, lifted, c), phaseIndex, viewType: 'side', prop: 'mat' };
    }

    case 'superman': {
      const flat: SkeletonPose2D = {
        head: { x: 0.74, y: 0.79 }, neck: { x: 0.68, y: 0.82 }, hip: { x: 0.45, y: 0.83 },
        shoulderL: { x: 0.66, y: 0.81 }, elbowL: { x: 0.75, y: 0.82 }, wristL: { x: 0.84, y: 0.83 },
        shoulderR: { x: 0.68, y: 0.82 }, elbowR: { x: 0.76, y: 0.82 }, wristR: { x: 0.85, y: 0.83 },
        kneeL: { x: 0.31, y: 0.83 }, ankleL: { x: 0.19, y: 0.84 },
        kneeR: { x: 0.32, y: 0.83 }, ankleR: { x: 0.2, y: 0.84 },
      };
      const lifted: SkeletonPose2D = {
        ...flat,
        head: { x: 0.74, y: 0.7 }, neck: { x: 0.68, y: 0.75 },
        shoulderL: { x: 0.66, y: 0.74 }, elbowL: { x: 0.75, y: 0.68 }, wristL: { x: 0.83, y: 0.63 },
        shoulderR: { x: 0.68, y: 0.75 }, elbowR: { x: 0.76, y: 0.69 }, wristR: { x: 0.84, y: 0.64 },
        kneeL: { x: 0.31, y: 0.77 }, ankleL: { x: 0.19, y: 0.7 },
        kneeR: { x: 0.32, y: 0.77 }, ankleR: { x: 0.2, y: 0.7 },
      };
      return { pose: cycleTwoFrames(flat, lifted, c), phaseIndex, viewType: 'side', prop: 'mat' };
    }

    case 'dead_bug': {
      const center: SkeletonPose2D = {
        head: { x: 0.27, y: 0.77 }, neck: { x: 0.33, y: 0.81 }, hip: { x: 0.55, y: 0.82 },
        shoulderL: { x: 0.35, y: 0.81 }, elbowL: { x: 0.35, y: 0.67 }, wristL: { x: 0.35, y: 0.54 },
        shoulderR: { x: 0.37, y: 0.81 }, elbowR: { x: 0.37, y: 0.67 }, wristR: { x: 0.37, y: 0.54 },
        kneeL: { x: 0.56, y: 0.62 }, ankleL: { x: 0.71, y: 0.62 },
        kneeR: { x: 0.59, y: 0.62 }, ankleR: { x: 0.73, y: 0.62 },
      };
      const extended: SkeletonPose2D = {
        ...center,
        elbowL: { x: 0.24, y: 0.78 }, wristL: { x: 0.14, y: 0.78 },
        kneeR: { x: 0.68, y: 0.77 }, ankleR: { x: 0.81, y: 0.78 },
      };
      return { pose: cycleTwoFrames(center, extended, c), phaseIndex, viewType: 'side', prop: 'mat' };
    }

    case 'crunch': {
      const down: SkeletonPose2D = {
        head: { x: 0.26, y: 0.78 }, neck: { x: 0.32, y: 0.81 }, hip: { x: 0.52, y: 0.82 },
        shoulderL: { x: 0.33, y: 0.81 }, elbowL: { x: 0.29, y: 0.75 }, wristL: { x: 0.27, y: 0.77 },
        shoulderR: { x: 0.35, y: 0.81 }, elbowR: { x: 0.31, y: 0.75 }, wristR: { x: 0.28, y: 0.77 },
        kneeL: { x: 0.64, y: 0.64 }, ankleL: { x: 0.73, y: 0.84 },
        kneeR: { x: 0.66, y: 0.65 }, ankleR: { x: 0.74, y: 0.84 },
      };
      const up: SkeletonPose2D = {
        ...down,
        head: { x: 0.34, y: 0.61 }, neck: { x: 0.38, y: 0.67 },
        shoulderL: { x: 0.39, y: 0.68 }, elbowL: { x: 0.43, y: 0.62 }, wristL: { x: 0.35, y: 0.62 },
        shoulderR: { x: 0.41, y: 0.68 }, elbowR: { x: 0.45, y: 0.62 }, wristR: { x: 0.36, y: 0.62 },
      };
      return { pose: cycleTwoFrames(down, up, c), phaseIndex, viewType: 'side', prop: 'mat' };
    }

    case 'russian_twist': {
      const left: SkeletonPose2D = {
        head: { x: 0.43, y: 0.46 }, neck: { x: 0.45, y: 0.53 }, hip: { x: 0.5, y: 0.76 },
        shoulderL: { x: 0.41, y: 0.55 }, elbowL: { x: 0.35, y: 0.63 }, wristL: { x: 0.39, y: 0.67 },
        shoulderR: { x: 0.49, y: 0.55 }, elbowR: { x: 0.42, y: 0.64 }, wristR: { x: 0.39, y: 0.67 },
        kneeL: { x: 0.63, y: 0.67 }, ankleL: { x: 0.74, y: 0.76 },
        kneeR: { x: 0.65, y: 0.68 }, ankleR: { x: 0.76, y: 0.77 },
      };
      const right: SkeletonPose2D = {
        ...left,
        elbowL: { x: 0.55, y: 0.64 }, wristL: { x: 0.61, y: 0.67 },
        elbowR: { x: 0.61, y: 0.63 }, wristR: { x: 0.61, y: 0.67 },
      };
      return { pose: cycleTwoFrames(left, right, c), phaseIndex, viewType: 'side', prop: 'mat' };
    }

    case 'leg_raise': {
      const low: SkeletonPose2D = {
        head: { x: 0.25, y: 0.78 }, neck: { x: 0.31, y: 0.81 }, hip: { x: 0.5, y: 0.82 },
        shoulderL: { x: 0.32, y: 0.81 }, elbowL: { x: 0.4, y: 0.83 }, wristL: { x: 0.48, y: 0.83 },
        shoulderR: { x: 0.33, y: 0.81 }, elbowR: { x: 0.41, y: 0.83 }, wristR: { x: 0.49, y: 0.83 },
        kneeL: { x: 0.65, y: 0.81 }, ankleL: { x: 0.79, y: 0.8 },
        kneeR: { x: 0.66, y: 0.81 }, ankleR: { x: 0.8, y: 0.8 },
      };
      const high: SkeletonPose2D = {
        ...low,
        kneeL: { x: 0.51, y: 0.65 }, ankleL: { x: 0.51, y: 0.48 },
        kneeR: { x: 0.52, y: 0.65 }, ankleR: { x: 0.52, y: 0.48 },
      };
      return { pose: cycleTwoFrames(low, high, c), phaseIndex, viewType: 'side', prop: 'mat' };
    }

    case 'side_plank': {
      const lowHip: SkeletonPose2D = {
        head: { x: 0.34, y: 0.55 }, neck: { x: 0.38, y: 0.61 }, hip: { x: 0.56, y: 0.78 },
        shoulderL: { x: 0.38, y: 0.63 }, elbowL: { x: 0.38, y: 0.82 }, wristL: { x: 0.45, y: 0.83 },
        shoulderR: { x: 0.38, y: 0.58 }, elbowR: { x: 0.47, y: 0.64 }, wristR: { x: 0.56, y: 0.74 },
        kneeL: { x: 0.67, y: 0.81 }, ankleL: { x: 0.78, y: 0.84 },
        kneeR: { x: 0.67, y: 0.79 }, ankleR: { x: 0.78, y: 0.82 },
      };
      const highHip: SkeletonPose2D = {
        head: { x: 0.34, y: 0.49 }, neck: { x: 0.38, y: 0.56 }, hip: { x: 0.56, y: 0.67 },
        shoulderL: { x: 0.38, y: 0.59 }, elbowL: { x: 0.38, y: 0.82 }, wristL: { x: 0.45, y: 0.83 },
        shoulderR: { x: 0.38, y: 0.52 }, elbowR: { x: 0.38, y: 0.39 }, wristR: { x: 0.38, y: 0.28 },
        kneeL: { x: 0.67, y: 0.76 }, ankleL: { x: 0.78, y: 0.84 },
        kneeR: { x: 0.67, y: 0.74 }, ankleR: { x: 0.78, y: 0.82 },
      };
      return { pose: cycleTwoFrames(lowHip, highHip, c), phaseIndex, viewType: 'side', prop: 'mat' };
    }

    case 'bicycle_crunch': {
      const leftKneeIn: SkeletonPose2D = {
        head: { x: 0.28, y: 0.66 }, neck: { x: 0.34, y: 0.71 }, hip: { x: 0.52, y: 0.81 },
        shoulderL: { x: 0.34, y: 0.72 }, elbowL: { x: 0.28, y: 0.62 }, wristL: { x: 0.28, y: 0.65 },
        shoulderR: { x: 0.37, y: 0.7 }, elbowR: { x: 0.46, y: 0.6 }, wristR: { x: 0.31, y: 0.64 },
        kneeL: { x: 0.5, y: 0.6 }, ankleL: { x: 0.63, y: 0.63 },
        kneeR: { x: 0.66, y: 0.75 }, ankleR: { x: 0.79, y: 0.74 },
      };
      const rightKneeIn: SkeletonPose2D = {
        ...leftKneeIn,
        kneeL: { x: 0.66, y: 0.75 }, ankleL: { x: 0.79, y: 0.74 },
        kneeR: { x: 0.5, y: 0.6 }, ankleR: { x: 0.63, y: 0.63 },
      };
      return { pose: cycleTwoFrames(leftKneeIn, rightKneeIn, c), phaseIndex, viewType: 'side', prop: 'mat' };
    }

    case 'bent_row': {
      const extended: SkeletonPose2D = {
        head: { x: 0.63, y: 0.3 }, neck: { x: 0.58, y: 0.35 }, hip: { x: 0.41, y: 0.5 },
        shoulderL: { x: 0.57, y: 0.36 }, elbowL: { x: 0.58, y: 0.5 }, wristL: { x: 0.59, y: 0.63 },
        shoulderR: { x: 0.6, y: 0.37 }, elbowR: { x: 0.61, y: 0.5 }, wristR: { x: 0.62, y: 0.63 },
        kneeL: { x: 0.47, y: 0.68 }, ankleL: { x: 0.45, y: 0.84 },
        kneeR: { x: 0.51, y: 0.68 }, ankleR: { x: 0.49, y: 0.84 },
      };
      const pulled: SkeletonPose2D = {
        ...extended,
        elbowL: { x: 0.45, y: 0.34 }, wristL: { x: 0.48, y: 0.47 },
        elbowR: { x: 0.48, y: 0.35 }, wristR: { x: 0.51, y: 0.47 },
      };
      return { pose: cycleTwoFrames(extended, pulled, c), phaseIndex, viewType: 'side', prop: 'dumbbells' };
    }

    case 'shoulder_press': {
      const rack: SkeletonPose2D = {
        head: { x: 0.5, y: 0.21 }, neck: { x: 0.5, y: 0.28 }, hip: { x: 0.5, y: 0.51 },
        shoulderL: { x: 0.44, y: 0.3 }, elbowL: { x: 0.36, y: 0.34 }, wristL: { x: 0.36, y: 0.23 },
        shoulderR: { x: 0.56, y: 0.3 }, elbowR: { x: 0.64, y: 0.34 }, wristR: { x: 0.64, y: 0.23 },
        kneeL: { x: 0.46, y: 0.67 }, ankleL: { x: 0.46, y: 0.84 },
        kneeR: { x: 0.54, y: 0.67 }, ankleR: { x: 0.54, y: 0.84 },
      };
      const overhead: SkeletonPose2D = {
        ...rack,
        elbowL: { x: 0.43, y: 0.17 }, wristL: { x: 0.44, y: 0.06 },
        elbowR: { x: 0.57, y: 0.17 }, wristR: { x: 0.56, y: 0.06 },
      };
      return { pose: cycleTwoFrames(rack, overhead, c), phaseIndex, viewType: 'front', prop: 'dumbbells' };
    }

    case 'renegade_row': {
      const plank: SkeletonPose2D = {
        head: { x: 0.74, y: 0.5 }, neck: { x: 0.68, y: 0.55 }, hip: { x: 0.45, y: 0.65 },
        shoulderL: { x: 0.66, y: 0.56 }, elbowL: { x: 0.66, y: 0.7 }, wristL: { x: 0.67, y: 0.82 },
        shoulderR: { x: 0.69, y: 0.56 }, elbowR: { x: 0.69, y: 0.7 }, wristR: { x: 0.69, y: 0.82 },
        kneeL: { x: 0.34, y: 0.74 }, ankleL: { x: 0.22, y: 0.84 },
        kneeR: { x: 0.36, y: 0.74 }, ankleR: { x: 0.24, y: 0.84 },
      };
      const pushLow: SkeletonPose2D = {
        ...plank,
        head: { x: 0.75, y: 0.66 }, neck: { x: 0.68, y: 0.7 }, hip: { x: 0.45, y: 0.74 },
        shoulderL: { x: 0.66, y: 0.7 }, elbowL: { x: 0.6, y: 0.66 },
        shoulderR: { x: 0.69, y: 0.7 }, elbowR: { x: 0.62, y: 0.67 },
      };
      const rowPull: SkeletonPose2D = {
        ...plank,
        elbowR: { x: 0.6, y: 0.49 }, wristR: { x: 0.56, y: 0.6 },
      };
      return { pose: cycleThreeFrames([plank, pushLow, rowPull], c), phaseIndex, viewType: 'side', prop: 'dumbbells' };
    }

    case 'cat_camel': {
      const cat: SkeletonPose2D = {
        head: { x: 0.68, y: 0.62 }, neck: { x: 0.64, y: 0.55 }, hip: { x: 0.39, y: 0.58 },
        shoulderL: { x: 0.63, y: 0.57 }, elbowL: { x: 0.64, y: 0.7 }, wristL: { x: 0.64, y: 0.84 },
        shoulderR: { x: 0.65, y: 0.57 }, elbowR: { x: 0.66, y: 0.7 }, wristR: { x: 0.66, y: 0.84 },
        kneeL: { x: 0.38, y: 0.83 }, ankleL: { x: 0.24, y: 0.84 },
        kneeR: { x: 0.4, y: 0.83 }, ankleR: { x: 0.26, y: 0.84 },
      };
      const camel: SkeletonPose2D = {
        ...cat,
        head: { x: 0.71, y: 0.5 }, neck: { x: 0.65, y: 0.58 }, hip: { x: 0.39, y: 0.64 },
      };
      return { pose: cycleTwoFrames(cat, camel, c), phaseIndex, viewType: 'side', prop: 'mat' };
    }

    case 'child_pose': {
      const breath = 0.008 * Math.sin(c * Math.PI * 2);
      const pose: SkeletonPose2D = {
        head: { x: 0.56, y: 0.77 + breath }, neck: { x: 0.51, y: 0.73 + breath }, hip: { x: 0.31, y: 0.74 },
        shoulderL: { x: 0.51, y: 0.75 + breath }, elbowL: { x: 0.64, y: 0.81 }, wristL: { x: 0.76, y: 0.83 },
        shoulderR: { x: 0.53, y: 0.75 + breath }, elbowR: { x: 0.65, y: 0.81 }, wristR: { x: 0.77, y: 0.83 },
        kneeL: { x: 0.4, y: 0.83 }, ankleL: { x: 0.26, y: 0.84 },
        kneeR: { x: 0.42, y: 0.83 }, ankleR: { x: 0.27, y: 0.84 },
      };
      return { pose, phaseIndex, viewType: 'side', prop: 'mat' };
    }

    case 'cobra_stretch': {
      const rest: SkeletonPose2D = {
        head: { x: 0.72, y: 0.74 }, neck: { x: 0.67, y: 0.78 }, hip: { x: 0.46, y: 0.82 },
        shoulderL: { x: 0.66, y: 0.79 }, elbowL: { x: 0.65, y: 0.83 }, wristL: { x: 0.69, y: 0.84 },
        shoulderR: { x: 0.68, y: 0.79 }, elbowR: { x: 0.67, y: 0.83 }, wristR: { x: 0.71, y: 0.84 },
        kneeL: { x: 0.32, y: 0.83 }, ankleL: { x: 0.19, y: 0.84 },
        kneeR: { x: 0.33, y: 0.83 }, ankleR: { x: 0.2, y: 0.84 },
      };
      const lift: SkeletonPose2D = {
        ...rest,
        head: { x: 0.68, y: 0.52 }, neck: { x: 0.64, y: 0.59 },
        shoulderL: { x: 0.63, y: 0.61 }, elbowL: { x: 0.66, y: 0.72 }, wristL: { x: 0.68, y: 0.84 },
        shoulderR: { x: 0.65, y: 0.61 }, elbowR: { x: 0.68, y: 0.72 }, wristR: { x: 0.7, y: 0.84 },
      };
      return { pose: cycleTwoFrames(rest, lift, c), phaseIndex, viewType: 'side', prop: 'mat' };
    }

    case 'hamstring_stretch': {
      const up: SkeletonPose2D = {
        head: { x: 0.5, y: 0.22 }, neck: { x: 0.5, y: 0.29 }, hip: { x: 0.49, y: 0.52 },
        shoulderL: { x: 0.48, y: 0.31 }, elbowL: { x: 0.49, y: 0.43 }, wristL: { x: 0.5, y: 0.53 },
        shoulderR: { x: 0.52, y: 0.31 }, elbowR: { x: 0.52, y: 0.43 }, wristR: { x: 0.53, y: 0.53 },
        kneeL: { x: 0.49, y: 0.68 }, ankleL: { x: 0.49, y: 0.84 },
        kneeR: { x: 0.51, y: 0.68 }, ankleR: { x: 0.51, y: 0.84 },
      };
      const fold: SkeletonPose2D = {
        ...up,
        head: { x: 0.59, y: 0.59 }, neck: { x: 0.56, y: 0.55 }, hip: { x: 0.44, y: 0.53 },
        shoulderL: { x: 0.55, y: 0.56 }, elbowL: { x: 0.54, y: 0.68 }, wristL: { x: 0.52, y: 0.79 },
        shoulderR: { x: 0.57, y: 0.56 }, elbowR: { x: 0.56, y: 0.68 }, wristR: { x: 0.53, y: 0.79 },
      };
      return { pose: cycleTwoFrames(up, fold, c), phaseIndex, viewType: 'side' };
    }

    case 'mobility_twist': {
      const downReach: SkeletonPose2D = {
        head: { x: 0.66, y: 0.52 }, neck: { x: 0.61, y: 0.56 }, hip: { x: 0.44, y: 0.67 },
        shoulderL: { x: 0.6, y: 0.58 }, elbowL: { x: 0.61, y: 0.71 }, wristL: { x: 0.61, y: 0.84 },
        shoulderR: { x: 0.62, y: 0.57 }, elbowR: { x: 0.64, y: 0.7 }, wristR: { x: 0.64, y: 0.82 },
        kneeL: { x: 0.67, y: 0.66 }, ankleL: { x: 0.68, y: 0.84 },
        kneeR: { x: 0.33, y: 0.75 }, ankleR: { x: 0.21, y: 0.84 },
      };
      const openTwist: SkeletonPose2D = {
        ...downReach,
        shoulderR: { x: 0.61, y: 0.52 }, elbowR: { x: 0.61, y: 0.37 }, wristR: { x: 0.6, y: 0.22 },
      };
      return { pose: cycleTwoFrames(downReach, openTwist, c), phaseIndex, viewType: 'side', prop: 'mat' };
    }

    default: {
      return {
        pose: cycleTwoFrames(
          {
            head: { x: 0.5, y: 0.2 }, neck: { x: 0.5, y: 0.27 }, hip: { x: 0.49, y: 0.5 },
            shoulderL: { x: 0.47, y: 0.29 }, elbowL: { x: 0.49, y: 0.41 }, wristL: { x: 0.53, y: 0.51 },
            shoulderR: { x: 0.51, y: 0.29 }, elbowR: { x: 0.53, y: 0.41 }, wristR: { x: 0.56, y: 0.51 },
            kneeL: { x: 0.48, y: 0.67 }, ankleL: { x: 0.48, y: 0.84 },
            kneeR: { x: 0.52, y: 0.67 }, ankleR: { x: 0.52, y: 0.84 },
          },
          {
            head: { x: 0.54, y: 0.36 }, neck: { x: 0.52, y: 0.43 }, hip: { x: 0.38, y: 0.63 },
            shoulderL: { x: 0.5, y: 0.44 }, elbowL: { x: 0.61, y: 0.46 }, wristL: { x: 0.71, y: 0.44 },
            shoulderR: { x: 0.53, y: 0.44 }, elbowR: { x: 0.63, y: 0.46 }, wristR: { x: 0.73, y: 0.45 },
            kneeL: { x: 0.56, y: 0.65 }, ankleL: { x: 0.49, y: 0.84 },
            kneeR: { x: 0.59, y: 0.66 }, ankleR: { x: 0.52, y: 0.84 },
          },
          c
        ),
        phaseIndex,
        viewType: 'side',
      };
    }
  }
}
