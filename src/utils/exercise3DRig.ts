import * as THREE from 'three';
import type { ExerciseTutorialSpec, SkeletonPose2D } from '../types';
import { interpolatePose } from './exerciseTutorials';

export type PropType = 'none' | 'mat' | 'bench' | 'chair_back' | 'dumbbells';

export interface Pose3DState {
  pelvis: THREE.Vector3;
  lumbarMid: THREE.Vector3;
  chestCenter: THREE.Vector3;
  neck: THREE.Vector3;
  head: THREE.Vector3;

  torsoLeft: THREE.Vector3;
  torsoUp: THREE.Vector3;
  torsoForward: THREE.Vector3;

  headForward: THREE.Vector3;
  headUp: THREE.Vector3;

  shoulderL: THREE.Vector3;
  elbowL: THREE.Vector3;
  wristL: THREE.Vector3;

  shoulderR: THREE.Vector3;
  elbowR: THREE.Vector3;
  wristR: THREE.Vector3;

  hipL: THREE.Vector3;
  kneeL: THREE.Vector3;
  ankleL: THREE.Vector3;

  hipR: THREE.Vector3;
  kneeR: THREE.Vector3;
  ankleR: THREE.Vector3;

  footDirL: THREE.Vector3;
  footDirR: THREE.Vector3;

  centerOfMass: THREE.Vector3;
  facingAxis: 'z' | 'x';
  prop: PropType;
  propPosition: THREE.Vector3;
  phaseIndex: 0 | 1 | 2;
}

export function createEmptyPose3DState(): Pose3DState {
  return {
    pelvis: new THREE.Vector3(),
    lumbarMid: new THREE.Vector3(),
    chestCenter: new THREE.Vector3(),
    neck: new THREE.Vector3(),
    head: new THREE.Vector3(),
    torsoLeft: new THREE.Vector3(1, 0, 0),
    torsoUp: new THREE.Vector3(0, 1, 0),
    torsoForward: new THREE.Vector3(0, 0, 1),
    headForward: new THREE.Vector3(0, 0, 1),
    headUp: new THREE.Vector3(0, 1, 0),
    shoulderL: new THREE.Vector3(),
    elbowL: new THREE.Vector3(),
    wristL: new THREE.Vector3(),
    shoulderR: new THREE.Vector3(),
    elbowR: new THREE.Vector3(),
    wristR: new THREE.Vector3(),
    hipL: new THREE.Vector3(),
    kneeL: new THREE.Vector3(),
    ankleL: new THREE.Vector3(),
    hipR: new THREE.Vector3(),
    kneeR: new THREE.Vector3(),
    ankleR: new THREE.Vector3(),
    footDirL: new THREE.Vector3(0, 0, 1),
    footDirR: new THREE.Vector3(0, 0, 1),
    centerOfMass: new THREE.Vector3(0, 0.85, 0),
    facingAxis: 'z',
    prop: 'none',
    propPosition: new THREE.Vector3(),
    phaseIndex: 0,
  };
}

// Dimensões anatômicas constantes (atleta ~1,75m) — zero esticamento de membros!
const PELVIS_HALF = 0.095;
const SHOULDER_HALF = 0.185;
const SPINE_LEN = 0.48;
const NECK_LEN = 0.135;
const THIGH_LEN = 0.405;
const SHIN_LEN = 0.395;
const UPPER_ARM_LEN = 0.275;
const FOREARM_LEN = 0.255;
const ANKLE_FLOOR_Y = 0.055;

// Vetores temporários de módulo (Zero GC no loop de animação)
const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _tmpC = new THREE.Vector3();
const _tmpPole = new THREE.Vector3();
const _tmpRot = new THREE.Vector3();
const _ancLeft = new THREE.Vector3();
const _ancUp = new THREE.Vector3();
const _ancFwd = new THREE.Vector3();
const _ancAxis = new THREE.Vector3();
const _ancRot = new THREE.Vector3();

function smooth01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function wave01(cycle: number): number {
  return 0.5 - 0.5 * Math.cos(cycle * Math.PI * 2);
}

function waveSigned(cycle: number): number {
  return Math.sin(cycle * Math.PI * 2);
}

/**
 * Solucionador analítico exato de Cinemática Inversa para 2 ossos (L1 e L2 constantes).
 * Garante que coxas, panturrilhas, braços e antebraços nunca estiquem nem dobrem ao contrário.
 */
function solveTwoBoneIK(
  root: THREE.Vector3,
  target: THREE.Vector3,
  l1: number,
  l2: number,
  poleDir: THREE.Vector3,
  outMid: THREE.Vector3,
  outEnd: THREE.Vector3
) {
  _tmpA.subVectors(target, root);
  const rawDist = _tmpA.length();
  const minDist = Math.abs(l1 - l2) + 0.04;
  const maxDist = l1 + l2 - 0.004;
  const dist = Math.max(minDist, Math.min(maxDist, rawDist));

  if (rawDist < 1e-5) {
    _tmpA.set(0, -1, 0);
  } else {
    _tmpA.divideScalar(rawDist);
  }

  // Ajusta o ponto final para respeitar rigorosamente o comprimento máximo anatômico
  outEnd.copy(root).addScaledVector(_tmpA, dist);

  // Ortogonaliza o vetor pole em relação ao eixo root->target
  const dot = poleDir.dot(_tmpA);
  _tmpPole.copy(poleDir).addScaledVector(_tmpA, -dot);
  if (_tmpPole.lengthSq() < 1e-6) {
    // Fallback perpendicular seguro se pole coincidir com a linha do membro
    _tmpB.set(0, 1, 0);
    if (Math.abs(_tmpA.y) > 0.9) _tmpB.set(0, 0, 1);
    _tmpPole.crossVectors(_tmpA, _tmpB);
  }
  _tmpPole.normalize();

  // Lei dos cossenos para posição exata do cotovelo/joelho
  const proj = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const heightSq = Math.max(0, l1 * l1 - proj * proj);
  const height = Math.sqrt(heightSq);

  outMid
    .copy(root)
    .addScaledVector(_tmpA, proj)
    .addScaledVector(_tmpPole, height);
}

/**
 * Estica o alvo do tornozelo apenas no eixo X até atingir o comprimento completo da perna
 * (THIGH_LEN + SHIN_LEN + 0.012), preservando altura (Y) e largura (Z).
 */
function stretchAnkleToFullLeg(hip: THREE.Vector3, target: THREE.Vector3): void {
  const fullLen = THIGH_LEN + SHIN_LEN + 0.012;
  const dy = target.y - hip.y;
  const dz = target.z - hip.z;
  const remSq = fullLen * fullLen - dy * dy - dz * dz;
  if (remSq > 0) {
    const sign = target.x >= hip.x ? 1 : -1;
    target.x = hip.x + sign * Math.sqrt(remSq);
  }
}

/**
 * Constrói a base ortonormal direita (det = +1) do tronco a partir de `up` e `forwardDesired`:
 * +X = esquerda do atleta, +Y = cabeça/cima do tronco, +Z = frente (peito/abdômen).
 */
function setTorsoBasis(
  outLeft: THREE.Vector3,
  outUp: THREE.Vector3,
  outForward: THREE.Vector3,
  upDir: THREE.Vector3,
  forwardHint: THREE.Vector3
) {
  outUp.copy(upDir).normalize();
  outLeft.crossVectors(outUp, forwardHint);
  if (outLeft.lengthSq() < 1e-6) {
    outLeft.set(1, 0, 0);
  } else {
    outLeft.normalize();
  }
  outForward.crossVectors(outLeft, outUp).normalize();
}

/**
 * Posiciona ombros e quadris com espaçamento anatômico exato a partir da base do tronco.
 */
function computeTorsoAnchors(state: Pose3DState, pelvis: THREE.Vector3, spineDir: THREE.Vector3, forwardHint: THREE.Vector3, torsoYawRad = 0) {
  state.pelvis.copy(pelvis);
  _ancRot.copy(forwardHint).normalize();
  if (Math.abs(torsoYawRad) > 1e-4) {
    _ancAxis.copy(spineDir).normalize();
    _ancRot.applyAxisAngle(_ancAxis, torsoYawRad);
  }

  setTorsoBasis(state.torsoLeft, state.torsoUp, state.torsoForward, spineDir, _ancRot);

  // Quadris acompanham a base sem torcer com o giro da caixa torácica
  setTorsoBasis(_ancLeft, _ancUp, _ancFwd, spineDir, forwardHint);
  state.hipL.copy(state.pelvis).addScaledVector(_ancLeft, PELVIS_HALF).addScaledVector(state.torsoUp, -0.02);
  state.hipR.copy(state.pelvis).addScaledVector(_ancLeft, -PELVIS_HALF).addScaledVector(state.torsoUp, -0.02);

  state.lumbarMid.copy(state.pelvis).addScaledVector(state.torsoUp, SPINE_LEN * 0.44);
  state.chestCenter.copy(state.pelvis).addScaledVector(state.torsoUp, SPINE_LEN * 0.74);
  state.neck.copy(state.pelvis).addScaledVector(state.torsoUp, SPINE_LEN);
  state.head.copy(state.neck).addScaledVector(state.torsoUp, NECK_LEN);
  state.headUp.copy(state.torsoUp);
  state.headForward.copy(state.torsoForward);

  state.shoulderL
    .copy(state.neck)
    .addScaledVector(state.torsoLeft, SHOULDER_HALF)
    .addScaledVector(state.torsoUp, -0.045);
  state.shoulderR
    .copy(state.neck)
    .addScaledVector(state.torsoLeft, -SHOULDER_HALF)
    .addScaledVector(state.torsoUp, -0.045);
}

/**
 * Helper para posicionamento padrão em pé (facing +Z).
 */
function buildStandingPose(
  state: Pose3DState,
  opts: {
    pelvisX?: number;
    pelvisY: number;
    pelvisZ: number;
    spinePitchRad?: number; // positivo inclina o tronco para frente (+Z)
    spineRollRad?: number;
    torsoYawRad?: number;
    footLX: number;
    footLY?: number;
    footLZ: number;
    footRX: number;
    footRY?: number;
    footRZ: number;
    kneePoleL?: [number, number, number];
    kneePoleR?: [number, number, number];
    handL: [number, number, number];
    handR: [number, number, number];
    elbowPoleL?: [number, number, number];
    elbowPoleR?: [number, number, number];
    footDirL?: [number, number, number];
    footDirR?: [number, number, number];
  }
) {
  state.facingAxis = 'z';
  const standingLift = 0.03 * Math.max(0, Math.min(1, (opts.pelvisY - 0.62) / 0.2));
  const pitch = opts.spinePitchRad ?? 0;
  const roll = opts.spineRollRad ?? 0;
  _tmpC.set(Math.sin(roll), Math.cos(pitch) * Math.cos(roll), Math.sin(pitch)).normalize();
  _tmpA.set(0, -Math.sin(pitch), Math.cos(pitch)).normalize();

  _tmpB.set(opts.pelvisX ?? 0, opts.pelvisY + standingLift, opts.pelvisZ);
  computeTorsoAnchors(state, _tmpB, _tmpC, _tmpA, opts.torsoYawRad ?? 0);

  // Pernas com IK
  const ankleTargetL = _tmpA.set(opts.footLX, opts.footLY ?? ANKLE_FLOOR_Y, opts.footLZ);
  const kneePoleL = _tmpPole.set(...(opts.kneePoleL ?? [0.18, 0.25, 1.0]));
  solveTwoBoneIK(state.hipL, ankleTargetL, THIGH_LEN, SHIN_LEN, kneePoleL, state.kneeL, state.ankleL);

  const ankleTargetR = _tmpA.set(opts.footRX, opts.footRY ?? ANKLE_FLOOR_Y, opts.footRZ);
  const kneePoleR = _tmpPole.set(...(opts.kneePoleR ?? [-0.18, 0.25, 1.0]));
  solveTwoBoneIK(state.hipR, ankleTargetR, THIGH_LEN, SHIN_LEN, kneePoleR, state.kneeR, state.ankleR);

  // Braços com IK
  const handTargetL = _tmpA.set(opts.handL[0], opts.handL[1] + standingLift, opts.handL[2]);
  const elbowPoleL = _tmpPole.set(...(opts.elbowPoleL ?? [0.5, -0.2, -0.8]));
  solveTwoBoneIK(state.shoulderL, handTargetL, UPPER_ARM_LEN, FOREARM_LEN, elbowPoleL, state.elbowL, state.wristL);

  const handTargetR = _tmpA.set(opts.handR[0], opts.handR[1] + standingLift, opts.handR[2]);
  const elbowPoleR = _tmpPole.set(...(opts.elbowPoleR ?? [-0.5, -0.2, -0.8]));
  solveTwoBoneIK(state.shoulderR, handTargetR, UPPER_ARM_LEN, FOREARM_LEN, elbowPoleR, state.elbowR, state.wristR);

  state.footDirL.set(...(opts.footDirL ?? [0.12, 0, 1])).normalize();
  state.footDirR.set(...(opts.footDirR ?? [-0.12, 0, 1])).normalize();
  state.centerOfMass.set(0, Math.max(0.55, state.pelvis.y + 0.14), 0);
}

/**
 * Helper para posicionamento no chão/colchonete ao longo do eixo X (facingAxis = 'x').
 */
function buildFloorPose(
  state: Pose3DState,
  opts: {
    pelvis: [number, number, number];
    neck: [number, number, number];
    torsoForwardHint: [number, number, number];
    torsoYawRad?: number;
    headTiltUp?: number;
    ankleL: [number, number, number];
    ankleR: [number, number, number];
    kneePoleL: [number, number, number];
    kneePoleR: [number, number, number];
    handL: [number, number, number];
    handR: [number, number, number];
    elbowPoleL: [number, number, number];
    elbowPoleR: [number, number, number];
    footDirL?: [number, number, number];
    footDirR?: [number, number, number];
    straightLegs?: boolean;
    prop?: PropType;
    propPosition?: [number, number, number];
  }
) {
  state.facingAxis = 'x';
  state.prop = opts.prop ?? 'mat';
  if (opts.propPosition) {
    state.propPosition.set(...opts.propPosition);
  } else {
    state.propPosition.set(0, 0, 0);
  }

  _tmpB.set(...opts.pelvis);
  _tmpC.set(...opts.neck).sub(_tmpB).normalize();
  _tmpA.set(...opts.torsoForwardHint).normalize();
  computeTorsoAnchors(state, _tmpB, _tmpC, _tmpA, opts.torsoYawRad ?? 0);

  if (opts.headTiltUp) {
    state.head.y += opts.headTiltUp * 0.05;
  }

  const ankleTargetL = _tmpA.set(...opts.ankleL);
  if (opts.straightLegs) stretchAnkleToFullLeg(state.hipL, ankleTargetL);
  const kneePoleL = _tmpPole.set(...opts.kneePoleL);
  solveTwoBoneIK(state.hipL, ankleTargetL, THIGH_LEN, SHIN_LEN, kneePoleL, state.kneeL, state.ankleL);

  const ankleTargetR = _tmpA.set(...opts.ankleR);
  if (opts.straightLegs) stretchAnkleToFullLeg(state.hipR, ankleTargetR);
  const kneePoleR = _tmpPole.set(...opts.kneePoleR);
  solveTwoBoneIK(state.hipR, ankleTargetR, THIGH_LEN, SHIN_LEN, kneePoleR, state.kneeR, state.ankleR);

  const handTargetL = _tmpA.set(...opts.handL);
  const elbowPoleL = _tmpPole.set(...opts.elbowPoleL);
  solveTwoBoneIK(state.shoulderL, handTargetL, UPPER_ARM_LEN, FOREARM_LEN, elbowPoleL, state.elbowL, state.wristL);

  const handTargetR = _tmpA.set(...opts.handR);
  const elbowPoleR = _tmpPole.set(...opts.elbowPoleR);
  solveTwoBoneIK(state.shoulderR, handTargetR, UPPER_ARM_LEN, FOREARM_LEN, elbowPoleR, state.elbowR, state.wristR);

  state.footDirL.set(...(opts.footDirL ?? [-0.4, -0.9, 0])).normalize();
  state.footDirR.set(...(opts.footDirR ?? [-0.4, -0.9, 0])).normalize();

  const midX = (state.pelvis.x + state.neck.x) * 0.5;
  const midY = Math.max(0.26, (state.pelvis.y + state.chestCenter.y + state.kneeL.y) / 3);
  state.centerOfMass.set(midX, midY, 0);
}

/**
 * Fallback 3D normalizado para keyframes customizados vindos da IA Gemini.
 */
function buildFromCustomKeyframes(state: Pose3DState, frames: [SkeletonPose2D, SkeletonPose2D, SkeletonPose2D], cycle: number) {
  let pose: SkeletonPose2D;
  if (cycle < 0.38) {
    pose = interpolatePose(frames[0], frames[1], smooth01(cycle / 0.38));
  } else if (cycle < 0.62) {
    pose = interpolatePose(frames[1], frames[2], smooth01((cycle - 0.38) / 0.24));
  } else {
    pose = interpolatePose(frames[2], frames[0], smooth01((cycle - 0.62) / 0.38));
  }

  const toX = (x: number) => (x - 0.5) * 2.2;
  const toY = (y: number) => Math.max(0.055, (0.85 - y) * 2.25);

  const hipX = toX(pose.hip.x);
  const hipY = toY(pose.hip.y);
  const neckX = toX(pose.neck.x);
  const neckY = toY(pose.neck.y);

  const dx = neckX - hipX;
  const dy = neckY - hipY;
  const isHorizontal = Math.abs(dx) > Math.abs(dy);

  if (isHorizontal) {
    buildFloorPose(state, {
      pelvis: [hipX, hipY, 0],
      neck: [neckX, neckY, 0],
      torsoForwardHint: [0, dy >= 0 ? -1 : 1, 0],
      ankleL: [toX(pose.ankleL.x), toY(pose.ankleL.y), -0.1],
      ankleR: [toX(pose.ankleR.x), toY(pose.ankleR.y), 0.1],
      kneePoleL: [0, 0.7, -0.2],
      kneePoleR: [0, 0.7, 0.2],
      handL: [toX(pose.wristL.x), toY(pose.wristL.y), -0.19],
      handR: [toX(pose.wristR.x), toY(pose.wristR.y), 0.19],
      elbowPoleL: [-0.7, 0.4, -0.35],
      elbowPoleR: [-0.7, 0.4, 0.35],
      prop: 'mat',
    });
  } else {
    buildStandingPose(state, {
      pelvisX: 0,
      pelvisY: Math.max(0.46, hipY),
      pelvisZ: 0,
      spinePitchRad: Math.atan2(Math.abs(dx), Math.max(0.15, dy)) * 0.7,
      footLX: 0.14,
      footLZ: 0,
      footRX: -0.14,
      footRZ: 0,
      handL: [0.22, toY(pose.wristL.y), Math.max(-0.2, toX(pose.wristL.x) - hipX)],
      handR: [-0.22, toY(pose.wristR.y), Math.max(-0.2, toX(pose.wristR.x) - hipX)],
    });
  }
}

export function evaluateExercisePose3D(spec: ExerciseTutorialSpec, cycleProgress: number, state: Pose3DState): void {
  const c = ((cycleProgress % 1) + 1) % 1;
  state.phaseIndex = c < 0.34 ? 0 : c < 0.72 ? 1 : 2;
  state.prop = 'none';
  state.propPosition.set(0, 0, 0);

  if (spec.archetype === 'custom' && spec.custom_keyframes && spec.custom_keyframes.length === 3) {
    buildFromCustomKeyframes(state, spec.custom_keyframes, c);
    return;
  }

  const w = wave01(c);
  const s = waveSigned(c);

  switch (spec.archetype) {
    case 'squat': {
      const pelvisY = THREE.MathUtils.lerp(0.84, 0.5, w);
      const pelvisZ = THREE.MathUtils.lerp(0.0, -0.14, w);
      const pitch = THREE.MathUtils.lerp(0.05, 0.38, w);
      buildStandingPose(state, {
        pelvisY,
        pelvisZ,
        spinePitchRad: pitch,
        footLX: 0.165,
        footLZ: 0.02,
        footRX: -0.165,
        footRZ: -0.02,
        kneePoleL: [0.24, 0.15, 1.0],
        kneePoleR: [-0.24, 0.15, 1.0],
        handL: [0.19, THREE.MathUtils.lerp(0.8, 0.86, w), THREE.MathUtils.lerp(0.1, 0.56, w)],
        handR: [-0.19, THREE.MathUtils.lerp(0.8, 0.86, w), THREE.MathUtils.lerp(0.1, 0.56, w)],
        elbowPoleL: [0.45, -0.45, -0.45],
        elbowPoleR: [-0.45, -0.45, -0.45],
        footDirL: [0.18, 0, 1],
        footDirR: [-0.18, 0, 1],
      });
      return;
    }

    case 'knee_circles': {
      const theta = c * Math.PI * 2;
      const circleX = Math.cos(theta) * 0.075;
      const circleZ = Math.sin(theta) * 0.045;
      const pelvisY = 0.74 + Math.sin(theta) * 0.012;
      const kneeLX = 0.075 + circleX;
      const kneeRX = -0.075 + circleX;
      const kneeZ = 0.23 + circleZ;
      buildStandingPose(state, {
        pelvisX: circleX * 0.16,
        pelvisY,
        pelvisZ: -0.1,
        spinePitchRad: 0.36,
        footLX: 0.075,
        footLZ: 0.02,
        footRX: -0.075,
        footRZ: 0.02,
        kneePoleL: [kneeLX, 0.2, Math.max(0.45, kneeZ + 0.78)],
        kneePoleR: [kneeRX, 0.2, Math.max(0.45, kneeZ + 0.78)],
        handL: [kneeLX * 0.88, 0.49, 0.25 + circleZ * 0.5],
        handR: [kneeRX * 0.88, 0.49, 0.25 + circleZ * 0.5],
        elbowPoleL: [0.85, 0.1, 0.25],
        elbowPoleR: [-0.85, 0.1, 0.25],
        footDirL: [0.05, 0, 1],
        footDirR: [-0.05, 0, 1],
      });
      state.head.y = state.neck.y + 0.112;
      state.head.z = state.neck.z + 0.068;
      return;
    }

    case 'sumo_squat': {
      const pelvisY = THREE.MathUtils.lerp(0.81, 0.43, w);
      const pelvisZ = THREE.MathUtils.lerp(0.0, -0.1, w);
      buildStandingPose(state, {
        pelvisY,
        pelvisZ,
        spinePitchRad: THREE.MathUtils.lerp(0.04, 0.3, w),
        footLX: 0.31,
        footLZ: 0.04,
        footRX: -0.31,
        footRZ: 0.04,
        kneePoleL: [0.75, 0.12, 0.7],
        kneePoleR: [-0.75, 0.12, 0.7],
        handL: [0.09, THREE.MathUtils.lerp(0.82, 0.58, w), 0.22],
        handR: [-0.09, THREE.MathUtils.lerp(0.82, 0.58, w), 0.22],
        elbowPoleL: [0.75, -0.35, -0.25],
        elbowPoleR: [-0.75, -0.35, -0.25],
        footDirL: [0.65, 0, 0.75],
        footDirR: [-0.65, 0, 0.75],
      });
      return;
    }

    case 'jump_squat': {
      let pelvisY = 0.84;
      let pelvisZ = 0;
      let footY = ANKLE_FLOOR_Y;
      let pitch = 0.08;
      let armY = 0.86;
      let armZ = 0.16;

      if (c < 0.36) {
        const t = smooth01(c / 0.36);
        pelvisY = THREE.MathUtils.lerp(0.84, 0.48, t);
        pelvisZ = THREE.MathUtils.lerp(0, -0.14, t);
        pitch = THREE.MathUtils.lerp(0.05, 0.44, t);
        armY = THREE.MathUtils.lerp(0.86, 0.72, t);
        armZ = THREE.MathUtils.lerp(0.16, 0.04, t);
      } else if (c < 0.72) {
        const airArc = Math.sin(((c - 0.36) / 0.36) * Math.PI);
        pelvisY = 0.84 + airArc * 0.34;
        footY = ANKLE_FLOOR_Y + airArc * 0.34;
        pitch = 0.04;
        armY = THREE.MathUtils.lerp(1.16, 1.56, airArc);
        armZ = 0.16;
      } else {
        const t = smooth01((c - 0.72) / 0.28);
        pelvisY = THREE.MathUtils.lerp(0.68, 0.84, t);
        pelvisZ = THREE.MathUtils.lerp(-0.07, 0, t);
        pitch = THREE.MathUtils.lerp(0.26, 0.05, t);
        armY = THREE.MathUtils.lerp(0.88, 0.86, t);
        armZ = THREE.MathUtils.lerp(0.28, 0.16, t);
      }

      buildStandingPose(state, {
        pelvisY,
        pelvisZ,
        spinePitchRad: pitch,
        footLX: 0.14,
        footLY: footY,
        footLZ: 0,
        footRX: -0.14,
        footRY: footY,
        footRZ: 0,
        handL: [0.22, armY, armZ],
        handR: [-0.22, armY, armZ],
        elbowPoleL: [0.35, -0.35, -0.65],
        elbowPoleR: [-0.35, -0.35, -0.65],
      });
      return;
    }

    case 'lunge': {
      const pelvisY = THREE.MathUtils.lerp(0.83, 0.52, w);
      const pelvisZ = THREE.MathUtils.lerp(0.04, 0.12, w);
      buildStandingPose(state, {
        pelvisY,
        pelvisZ,
        spinePitchRad: THREE.MathUtils.lerp(0.04, 0.14, w),
        footLX: 0.12,
        footLY: ANKLE_FLOOR_Y,
        footLZ: THREE.MathUtils.lerp(0.18, 0.42, w),
        footRX: -0.12,
        footRY: THREE.MathUtils.lerp(ANKLE_FLOOR_Y, 0.11, w),
        footRZ: THREE.MathUtils.lerp(-0.18, -0.36, w),
        kneePoleL: [0.05, 0.2, 1.0],
        kneePoleR: [-0.05, THREE.MathUtils.lerp(0.35, -0.25, w), 0.95],
        handL: [0.22, pelvisY + 0.06, pelvisZ + 0.04],
        handR: [-0.22, pelvisY + 0.06, pelvisZ + 0.04],
        footDirL: [0, 0, 1],
        footDirR: [0, -0.45 * w, 1],
      });
      return;
    }

    case 'bulgarian': {
      state.prop = 'bench';
      state.propPosition.set(0, 0, -0.58);
      const pelvisY = THREE.MathUtils.lerp(0.82, 0.51, w);
      const pelvisZ = THREE.MathUtils.lerp(0.04, 0.08, w);
      buildStandingPose(state, {
        pelvisY,
        pelvisZ,
        spinePitchRad: THREE.MathUtils.lerp(0.08, 0.24, w),
        footLX: 0.12,
        footLY: ANKLE_FLOOR_Y,
        footLZ: 0.34,
        footRX: -0.12,
        footRY: 0.52,
        footRZ: -0.52,
        kneePoleL: [0.04, 0.2, 1.0],
        kneePoleR: [-0.05, -0.8, 0.55],
        handL: [0.23, pelvisY + 0.05, pelvisZ + 0.06],
        handR: [-0.23, pelvisY + 0.05, pelvisZ + 0.06],
        footDirL: [0, 0, 1],
        footDirR: [0, -0.75, 0.65],
      });
      return;
    }

    case 'calf_raise': {
      const lift = w * 0.085;
      buildStandingPose(state, {
        pelvisY: 0.84 + lift,
        pelvisZ: 0,
        spinePitchRad: 0.03,
        footLX: 0.12,
        footLY: ANKLE_FLOOR_Y + lift,
        footLZ: 0,
        footRX: -0.12,
        footRY: ANKLE_FLOOR_Y + lift,
        footRZ: 0,
        handL: [0.23, 0.85 + lift, 0.05],
        handR: [-0.23, 0.85 + lift, 0.05],
        footDirL: [0, -0.52 * w, 1],
        footDirR: [0, -0.52 * w, 1],
      });
      return;
    }

    case 'jumping_jack': {
      const jump = w * 0.065;
      const footLift = Math.sin(w * Math.PI) * 0.04;
      const spreadX = THREE.MathUtils.lerp(0.105, 0.34, w);
      const handX = THREE.MathUtils.lerp(0.24, 0.56, w);
      const handY = THREE.MathUtils.lerp(0.74, 1.69, w);
      buildStandingPose(state, {
        pelvisY: 0.84 + jump + footLift,
        pelvisZ: 0,
        footLX: spreadX,
        footLY: ANKLE_FLOOR_Y + footLift,
        footLZ: 0,
        footRX: -spreadX,
        footRY: ANKLE_FLOOR_Y + footLift,
        footRZ: 0,
        handL: [handX, handY, 0.02],
        handR: [-handX, handY, 0.02],
        elbowPoleL: [0.35, -0.2, -0.35],
        elbowPoleR: [-0.35, -0.2, -0.35],
        footDirL: [0.22 * w, 0, 1],
        footDirR: [-0.22 * w, 0, 1],
      });
      return;
    }

    case 'high_knees': {
      const leftLift = Math.max(0, s);
      const rightLift = Math.max(0, -s);
      const bounce = Math.abs(s) * 0.03;
      buildStandingPose(state, {
        pelvisY: 0.83 + bounce,
        pelvisZ: 0,
        spinePitchRad: 0.08,
        footLX: 0.12,
        footLY: ANKLE_FLOOR_Y + leftLift * 0.42,
        footLZ: leftLift * 0.28,
        footRX: -0.12,
        footRY: ANKLE_FLOOR_Y + rightLift * 0.42,
        footRZ: rightLift * 0.28,
        kneePoleL: [0.05, 0.5, 1.0],
        kneePoleR: [-0.05, 0.5, 1.0],
        handL: [0.22, 1.02 + rightLift * 0.22 - leftLift * 0.08, 0.14 + rightLift * 0.18 - leftLift * 0.12],
        handR: [-0.22, 1.02 + leftLift * 0.22 - rightLift * 0.08, 0.14 + leftLift * 0.18 - rightLift * 0.12],
        elbowPoleL: [0.3, -0.5, -0.8],
        elbowPoleR: [-0.3, -0.5, -0.8],
      });
      return;
    }

    case 'bicep_curl': {
      state.prop = 'dumbbells';
      const angle = THREE.MathUtils.lerp(0.18, 2.32, w);
      const handY = 1.02 - Math.cos(angle) * FOREARM_LEN;
      const handZ = 0.06 + Math.sin(angle) * FOREARM_LEN;
      buildStandingPose(state, {
        pelvisY: 0.84,
        pelvisZ: 0,
        footLX: 0.13,
        footLZ: 0,
        footRX: -0.13,
        footRZ: 0,
        handL: [0.23, handY, handZ],
        handR: [-0.23, handY, handZ],
        elbowPoleL: [0.15, -0.5, -0.85],
        elbowPoleR: [-0.15, -0.5, -0.85],
      });
      return;
    }

    case 'shoulder_press': {
      state.prop = 'dumbbells';
      const handY = THREE.MathUtils.lerp(1.36, 1.86, w);
      const handX = THREE.MathUtils.lerp(0.32, 0.17, w);
      buildStandingPose(state, {
        pelvisY: 0.84,
        pelvisZ: 0,
        footLX: 0.14,
        footLZ: 0,
        footRX: -0.14,
        footRZ: 0,
        handL: [handX, handY, 0.06],
        handR: [-handX, handY, 0.06],
        elbowPoleL: [0.85, -0.3, -0.2],
        elbowPoleR: [-0.85, -0.3, -0.2],
      });
      return;
    }

    case 'lateral_raise': {
      state.prop = 'dumbbells';
      const angle = THREE.MathUtils.lerp(0.16, 1.48, w);
      const armReach = UPPER_ARM_LEN + FOREARM_LEN - 0.03;
      const handX = 0.185 + Math.sin(angle) * armReach;
      const handY = 1.28 - Math.cos(angle) * armReach;
      buildStandingPose(state, {
        pelvisY: 0.84,
        pelvisZ: 0,
        footLX: 0.13,
        footLZ: 0,
        footRX: -0.13,
        footRZ: 0,
        handL: [handX, handY, 0.08],
        handR: [-handX, handY, 0.08],
        elbowPoleL: [0.2, 0.25, -0.9],
        elbowPoleR: [-0.2, 0.25, -0.9],
      });
      return;
    }

    case 'arm_circles': {
      const theta = c * Math.PI * 2;
      const radius = 0.38;
      const handY = 1.28 + Math.sin(theta) * radius;
      const handZ = Math.cos(theta) * radius;
      buildStandingPose(state, {
        pelvisY: 0.84,
        pelvisZ: 0,
        footLX: 0.13,
        footLZ: 0,
        footRX: -0.13,
        footRZ: 0,
        handL: [0.36, handY, handZ],
        handR: [-0.36, handY, handZ],
        elbowPoleL: [0.4, -0.1, -0.6],
        elbowPoleR: [-0.4, -0.1, -0.6],
      });
      return;
    }

    case 'torso_twist': {
      const yaw = s * 0.82;
      const r = 0.27;
      const handLX = Math.sin(yaw + 0.65) * r;
      const handLZ = Math.max(0.14, Math.cos(yaw + 0.65) * r);
      const handRX = Math.sin(yaw - 0.65) * r;
      const handRZ = Math.max(0.14, Math.cos(yaw - 0.65) * r);
      buildStandingPose(state, {
        pelvisY: 0.84,
        pelvisZ: 0,
        torsoYawRad: yaw,
        footLX: 0.19,
        footLZ: 0,
        footRX: -0.19,
        footRZ: 0,
        handL: [handLX, 1.21, handLZ],
        handR: [handRX, 1.21, handRZ],
        elbowPoleL: [Math.cos(yaw) * 0.7, -0.85, -Math.sin(yaw) * 0.5],
        elbowPoleR: [-Math.cos(yaw) * 0.7, -0.85, Math.sin(yaw) * 0.5],
      });
      return;
    }

    case 'bent_row': {
      state.prop = 'dumbbells';
      const pull = w;
      const handY = THREE.MathUtils.lerp(0.55, 0.87, pull);
      const handZ = THREE.MathUtils.lerp(0.38, 0.16, pull);
      buildStandingPose(state, {
        pelvisY: 0.80,
        pelvisZ: -0.14,
        spinePitchRad: 0.82,
        footLX: 0.14,
        footLZ: 0.02,
        footRX: -0.14,
        footRZ: 0.02,
        kneePoleL: [0.1, 0.2, 1.0],
        kneePoleR: [-0.1, 0.2, 1.0],
        handL: [0.22, handY, handZ],
        handR: [-0.22, handY, handZ],
        elbowPoleL: [0.25, 0.65, -0.7],
        elbowPoleR: [-0.25, 0.65, -0.7],
      });
      return;
    }

    case 'hamstring_stretch': {
      const pitch = THREE.MathUtils.lerp(0.06, 1.38, w);
      const handY = THREE.MathUtils.lerp(0.84, 0.25, w);
      const handZ = THREE.MathUtils.lerp(0.14, 0.34, w);
      buildStandingPose(state, {
        pelvisY: THREE.MathUtils.lerp(0.84, 0.82, w),
        pelvisZ: THREE.MathUtils.lerp(0, -0.10, w),
        spinePitchRad: pitch,
        footLX: 0.12,
        footLZ: 0.06,
        footRX: -0.12,
        footRZ: 0.06,
        kneePoleL: [0.05, 0.1, 1.0],
        kneePoleR: [-0.05, 0.1, 1.0],
        handL: [0.15, handY, handZ],
        handR: [-0.15, handY, handZ],
        elbowPoleL: [0.2, 0.35, -0.6],
        elbowPoleR: [-0.2, 0.35, -0.6],
      });
      return;
    }

    // --- POSES PRONADAS NO EIXO X (L = -Z, R = +Z) ---
    case 'pushup':
    case 'diamond_pushup': {
      const low = w;
      const handX = 0.40;
      const handY = 0.05;
      const ankleY = 0.075;
      const armLen = UPPER_ARM_LEN + FOREARM_LEN;
      const legReach = THIGH_LEN + SHIN_LEN + 0.03;
      const shoulderReach = legReach + SPINE_LEN - 0.045;
      const topShoulderY = handY + armLen * 0.985;
      const sinTop = Math.min(0.99, (topShoulderY - ankleY) / shoulderReach);
      const cosTop = Math.sqrt(Math.max(0, 1 - sinTop * sinTop));
      const ankleX = handX - 0.05 - shoulderReach * cosTop;

      const shoulderY = THREE.MathUtils.lerp(topShoulderY, 0.20, low);
      const sinTheta = Math.max(0.02, Math.min(0.99, (shoulderY - ankleY) / shoulderReach));
      const cosTheta = Math.sqrt(Math.max(0, 1 - sinTheta * sinTheta));

      const pelvisX = ankleX + legReach * cosTheta;
      const pelvisY = ankleY + legReach * sinTheta;
      const neckX = pelvisX + SPINE_LEN * cosTheta;
      const neckY = pelvisY + SPINE_LEN * sinTheta;
      const handSpread = spec.archetype === 'diamond_pushup' ? 0.06 : 0.23;

      buildFloorPose(state, {
        pelvis: [pelvisX, pelvisY, 0],
        neck: [neckX, neckY, 0],
        torsoForwardHint: [sinTheta, -cosTheta, 0],
        ankleL: [ankleX, ankleY, -0.09],
        ankleR: [ankleX, ankleY, 0.09],
        kneePoleL: [-sinTheta, cosTheta, -0.1],
        kneePoleR: [-sinTheta, cosTheta, 0.1],
        handL: [handX, handY, -handSpread],
        handR: [handX, handY, handSpread],
        elbowPoleL: [-0.65, 0.75, -0.6],
        elbowPoleR: [-0.65, 0.75, 0.6],
      });
      return;
    }

    case 'box_pushup': {
      const low = w;
      const chestY = THREE.MathUtils.lerp(0.58, 0.25, low);
      const pelvisY = THREE.MathUtils.lerp(0.51, 0.44, low);
      buildFloorPose(state, {
        pelvis: [-0.21, pelvisY, 0],
        neck: [0.27, chestY, 0],
        torsoForwardHint: [0, -1, 0],
        ankleL: [-0.63, 0.065, -0.12],
        ankleR: [-0.63, 0.065, 0.12],
        kneePoleL: [0.55, -0.75, -0.06],
        kneePoleR: [0.55, -0.75, 0.06],
        handL: [0.27, 0.05, -0.21],
        handR: [0.27, 0.05, 0.21],
        elbowPoleL: [-0.85, 0.45, -0.45],
        elbowPoleR: [-0.85, 0.45, 0.45],
        footDirL: [-0.45, -0.88, 0],
        footDirR: [-0.45, -0.88, 0],
      });
      state.head.y = state.neck.y - 0.035;
      state.head.x = state.neck.x + 0.125;
      return;
    }

    case 'incline_pushup': {
      const low = w;
      const chestY = THREE.MathUtils.lerp(1.06, 0.68, low);
      const pelvisY = THREE.MathUtils.lerp(0.70, 0.44, low);
      const chestX = THREE.MathUtils.lerp(0.39, 0.35, low);
      const pelvisX = THREE.MathUtils.lerp(0.02, -0.06, low);
      buildFloorPose(state, {
        pelvis: [pelvisX, pelvisY, 0],
        neck: [chestX, chestY, 0],
        torsoForwardHint: [0, -1, 0],
        ankleL: [-0.72, 0.065, -0.09],
        ankleR: [-0.72, 0.065, 0.09],
        kneePoleL: [-0.1, 0.85, -0.15],
        kneePoleR: [-0.1, 0.85, 0.15],
        handL: [0.46, 0.49, -0.19],
        handR: [0.46, 0.49, 0.19],
        elbowPoleL: [-0.85, 0.25, -0.45],
        elbowPoleR: [-0.85, 0.25, 0.45],
        straightLegs: true,
        prop: 'bench',
        propPosition: [0.58, 0, 0],
      });
      return;
    }

    case 'tricep_dip': {
      const low = w;
      const pelvisY = THREE.MathUtils.lerp(0.59, 0.22, low);
      const neckY = THREE.MathUtils.lerp(1.05, 0.68, low);
      buildFloorPose(state, {
        pelvis: [-0.16, pelvisY, 0],
        neck: [-0.21, neckY, 0],
        torsoForwardHint: [1, 0, 0],
        ankleL: [0.58, 0.055, -0.09],
        ankleR: [0.58, 0.055, 0.09],
        kneePoleL: [0.4, 0.95, -0.08],
        kneePoleR: [0.4, 0.95, 0.08],
        handL: [-0.34, 0.49, -0.19],
        handR: [-0.34, 0.49, 0.19],
        elbowPoleL: [-0.95, 0.25, -0.18],
        elbowPoleR: [-0.95, 0.25, 0.18],
        footDirL: [0.6, 0.8, 0],
        footDirR: [0.6, 0.8, 0],
        prop: 'chair_back',
        propPosition: [-0.62, 0, 0],
      });
      return;
    }

    case 'plank': {
      const breathe = 0.012 * Math.sin(c * Math.PI * 2);
      buildFloorPose(state, {
        pelvis: [-0.08, 0.29 + breathe * 0.5, 0],
        neck: [0.39, 0.34 + breathe, 0],
        torsoForwardHint: [0, -1, 0],
        ankleL: [-0.82, 0.075, -0.09],
        ankleR: [-0.82, 0.075, 0.09],
        kneePoleL: [-0.1, 0.85, -0.1],
        kneePoleR: [-0.1, 0.85, 0.1],
        handL: [0.58, 0.05, -0.14],
        handR: [0.58, 0.05, 0.14],
        elbowPoleL: [0.3, -1.0, -0.05],
        elbowPoleR: [0.3, -1.0, 0.05],
        straightLegs: true,
      });
      return;
    }

    case 'mountain_climber': {
      const leftIn = Math.max(0, s);
      const rightIn = Math.max(0, -s);
      buildFloorPose(state, {
        pelvis: [-0.08, 0.47, 0],
        neck: [0.37, 0.58, 0],
        torsoForwardHint: [0, -1, 0],
        ankleL: [THREE.MathUtils.lerp(-0.82, -0.18, leftIn), THREE.MathUtils.lerp(0.085, 0.18, leftIn), -0.1],
        ankleR: [THREE.MathUtils.lerp(-0.82, -0.18, rightIn), THREE.MathUtils.lerp(0.085, 0.18, rightIn), 0.1],
        kneePoleL: [0.45, -0.25 - leftIn * 0.3, -0.12],
        kneePoleR: [0.45, -0.25 - rightIn * 0.3, 0.12],
        handL: [0.41, 0.05, -0.2],
        handR: [0.41, 0.05, 0.2],
        elbowPoleL: [-0.7, 0.35, -0.35],
        elbowPoleR: [-0.7, 0.35, 0.35],
      });
      return;
    }

    case 'burpee': {
      // Todo o burpee alinhado no mesmo eixo (+X à frente, L = -Z, R = +Z) sem girar a câmera!
      if (c < 0.30) {
        const t = smooth01(c / 0.30);
        const pitch = THREE.MathUtils.lerp(0.04, 0.86, t);
        const pelvisX = THREE.MathUtils.lerp(0.0, -0.16, t);
        const pelvisY = THREE.MathUtils.lerp(0.84, 0.39, t);
        const neckX = pelvisX + Math.sin(pitch) * SPINE_LEN;
        const neckY = pelvisY + Math.cos(pitch) * SPINE_LEN;
        buildFloorPose(state, {
          pelvis: [pelvisX, pelvisY, 0],
          neck: [neckX, neckY, 0],
          torsoForwardHint: [Math.cos(pitch), -Math.sin(pitch), 0],
          ankleL: [0.02, ANKLE_FLOOR_Y, -0.13],
          ankleR: [0.02, ANKLE_FLOOR_Y, 0.13],
          kneePoleL: [1.0, 0.25, -0.12],
          kneePoleR: [1.0, 0.25, 0.12],
          handL: [THREE.MathUtils.lerp(0.14, 0.38, t), THREE.MathUtils.lerp(1.56, 0.055, t), -0.18],
          handR: [THREE.MathUtils.lerp(0.14, 0.38, t), THREE.MathUtils.lerp(1.56, 0.055, t), 0.18],
          elbowPoleL: [-0.7, 0.2, -0.35],
          elbowPoleR: [-0.7, 0.2, 0.35],
          footDirL: [1, 0, 0],
          footDirR: [1, 0, 0],
          prop: 'none',
        });
      } else if (c < 0.70) {
        const t = Math.sin(((c - 0.30) / 0.40) * Math.PI);
        const pelvisX = THREE.MathUtils.lerp(-0.16, -0.08, t);
        const pelvisY = THREE.MathUtils.lerp(0.39, 0.44, t);
        const neckX = THREE.MathUtils.lerp(0.20, 0.39, t);
        const neckY = THREE.MathUtils.lerp(0.70, 0.56, t);
        buildFloorPose(state, {
          pelvis: [pelvisX, pelvisY, 0],
          neck: [neckX, neckY, 0],
          torsoForwardHint: [0.25 * (1 - t), -1, 0],
          ankleL: [THREE.MathUtils.lerp(0.02, -0.80, t), THREE.MathUtils.lerp(ANKLE_FLOOR_Y, 0.075, t), -0.11],
          ankleR: [THREE.MathUtils.lerp(0.02, -0.80, t), THREE.MathUtils.lerp(ANKLE_FLOOR_Y, 0.075, t), 0.11],
          kneePoleL: [THREE.MathUtils.lerp(1.0, -0.1, t), THREE.MathUtils.lerp(0.25, 0.85, t), -0.12],
          kneePoleR: [THREE.MathUtils.lerp(1.0, -0.1, t), THREE.MathUtils.lerp(0.25, 0.85, t), 0.12],
          handL: [0.40, 0.055, -0.19],
          handR: [0.40, 0.055, 0.19],
          elbowPoleL: [-0.7, 0.35, -0.3],
          elbowPoleR: [-0.7, 0.35, 0.3],
          footDirL: [THREE.MathUtils.lerp(1, -0.4, t), THREE.MathUtils.lerp(0, -0.9, t), 0],
          footDirR: [THREE.MathUtils.lerp(1, -0.4, t), THREE.MathUtils.lerp(0, -0.9, t), 0],
          prop: 'none',
        });
      } else {
        const t = smooth01((c - 0.70) / 0.30);
        const pitch = THREE.MathUtils.lerp(0.86, 0.04, t);
        const pelvisX = THREE.MathUtils.lerp(-0.16, 0.0, t);
        const pelvisY = THREE.MathUtils.lerp(0.39, 0.84, t);
        const neckX = pelvisX + Math.sin(pitch) * SPINE_LEN;
        const neckY = pelvisY + Math.cos(pitch) * SPINE_LEN;
        buildFloorPose(state, {
          pelvis: [pelvisX, pelvisY, 0],
          neck: [neckX, neckY, 0],
          torsoForwardHint: [Math.cos(pitch), -Math.sin(pitch), 0],
          ankleL: [0.02, ANKLE_FLOOR_Y, -0.13],
          ankleR: [0.02, ANKLE_FLOOR_Y, 0.13],
          kneePoleL: [1.0, 0.25, -0.12],
          kneePoleR: [1.0, 0.25, 0.12],
          handL: [THREE.MathUtils.lerp(0.38, 0.14, t), THREE.MathUtils.lerp(0.055, 1.56, t), -0.18],
          handR: [THREE.MathUtils.lerp(0.38, 0.14, t), THREE.MathUtils.lerp(0.055, 1.56, t), 0.18],
          elbowPoleL: [-0.7, 0.2, -0.35],
          elbowPoleR: [-0.7, 0.2, 0.35],
          footDirL: [1, 0, 0],
          footDirR: [1, 0, 0],
          prop: 'none',
        });
      }
      return;
    }

    case 'renegade_row': {
      let chestY = 0.60;
      let pelvisY = 0.48;
      let handRY = 0.065;
      let handRX = 0.39;

      if (c < 0.36) {
        const push = Math.sin((c / 0.36) * Math.PI);
        chestY = THREE.MathUtils.lerp(0.60, 0.21, push);
        pelvisY = THREE.MathUtils.lerp(0.48, 0.17, push);
      } else if (c < 0.82) {
        const row = Math.sin(((c - 0.36) / 0.46) * Math.PI);
        handRY = THREE.MathUtils.lerp(0.065, 0.38, row);
        handRX = THREE.MathUtils.lerp(0.39, 0.22, row);
      }

      buildFloorPose(state, {
        pelvis: [-0.08, pelvisY, 0],
        neck: [0.38, chestY, 0],
        torsoForwardHint: [0, -1, 0],
        ankleL: [-0.82, 0.075, -0.14],
        ankleR: [-0.82, 0.075, 0.14],
        kneePoleL: [0, 0.9, -0.1],
        kneePoleR: [0, 0.9, 0.1],
        handL: [0.39, 0.065, -0.21],
        handR: [handRX, handRY, 0.21],
        elbowPoleL: [-0.7, 0.45, -0.4],
        elbowPoleR: [-0.85, 0.95, 0.35],
        straightLegs: true,
        prop: 'dumbbells',
      });
      return;
    }

    // --- POSES SUPINAS / SENTADAS NO EIXO X (L = -Z, R = +Z) ---
    case 'glute_bridge': {
      const lift = w;
      const pelvisY = THREE.MathUtils.lerp(0.11, 0.35, lift);
      const pelvisX = THREE.MathUtils.lerp(-0.02, 0.03, lift);
      buildFloorPose(state, {
        pelvis: [pelvisX, pelvisY, 0],
        neck: [-0.46, 0.1, 0],
        torsoForwardHint: [0, 1, 0],
        ankleL: [0.4, ANKLE_FLOOR_Y + 0.012, -0.12],
        ankleR: [0.4, ANKLE_FLOOR_Y + 0.012, 0.12],
        kneePoleL: [0.3, 1.0, -0.08],
        kneePoleR: [0.3, 1.0, 0.08],
        handL: [-0.02, 0.058, -0.22],
        handR: [-0.02, 0.058, 0.22],
        elbowPoleL: [-0.4, 0.1, -0.8],
        elbowPoleR: [-0.4, 0.1, 0.8],
        footDirL: [1, 0, 0],
        footDirR: [1, 0, 0],
      });
      state.head.y = 0.11;
      state.head.x = state.neck.x - 0.128;
      return;
    }

    case 'crunch': {
      const curl = w;
      const neckX = THREE.MathUtils.lerp(-0.46, -0.26, curl);
      const neckY = THREE.MathUtils.lerp(0.11, 0.38, curl);
      buildFloorPose(state, {
        pelvis: [0.02, 0.1, 0],
        neck: [neckX, neckY, 0],
        torsoForwardHint: [0.48 * curl, 1, 0],
        ankleL: [0.58, ANKLE_FLOOR_Y + 0.015, -0.12],
        ankleR: [0.58, ANKLE_FLOOR_Y + 0.015, 0.12],
        kneePoleL: [0.25, 1.0, -0.05],
        kneePoleR: [0.25, 1.0, 0.05],
        handL: [THREE.MathUtils.lerp(-0.08, 0.25, curl), THREE.MathUtils.lerp(0.16, 0.48, curl), -0.16],
        handR: [THREE.MathUtils.lerp(-0.08, 0.25, curl), THREE.MathUtils.lerp(0.16, 0.48, curl), 0.16],
        elbowPoleL: [-0.3, -0.4, -0.6],
        elbowPoleR: [-0.3, -0.4, 0.6],
        footDirL: [1, 0, 0],
        footDirR: [1, 0, 0],
      });
      // Mantém a lombar apoiada e flexiona suavemente a cervical acompanhando o movimento
      state.lumbarMid.set(-0.14, 0.105 + curl * 0.02, 0);
      state.chestCenter.set(THREE.MathUtils.lerp(-0.32, -0.19, curl), THREE.MathUtils.lerp(0.11, 0.26, curl), 0);
      state.head.x = state.neck.x + THREE.MathUtils.lerp(-0.125, -0.048, curl);
      state.head.y = state.neck.y + THREE.MathUtils.lerp(0.02, 0.122, curl);
      return;
    }

    case 'bicycle_crunch': {
      const twist = s;
      const kneeLX = THREE.MathUtils.lerp(0.65, 0.08, Math.max(0, twist));
      const kneeLY = THREE.MathUtils.lerp(0.2, 0.42, Math.max(0, twist));
      const kneeRX = THREE.MathUtils.lerp(0.65, 0.08, Math.max(0, -twist));
      const kneeRY = THREE.MathUtils.lerp(0.2, 0.42, Math.max(0, -twist));

      buildFloorPose(state, {
        pelvis: [0.02, 0.11, 0],
        neck: [-0.3, 0.38, 0],
        torsoForwardHint: [0.35, 1, 0],
        torsoYawRad: twist * 0.45,
        ankleL: [kneeLX + (twist > 0 ? 0.1 : 0.25), kneeLY - (twist > 0 ? 0.02 : 0.04), -0.12],
        ankleR: [kneeRX + (twist < 0 ? 0.1 : 0.25), kneeRY - (twist < 0 ? 0.02 : 0.04), 0.12],
        kneePoleL: [-0.2, 1.0, -0.08],
        kneePoleR: [-0.2, 1.0, 0.08],
        handL: [-0.31, 0.45, -0.14 + twist * 0.05],
        handR: [-0.31, 0.45, 0.14 + twist * 0.05],
        elbowPoleL: [0.25, 0.35, -0.9],
        elbowPoleR: [0.25, 0.35, 0.9],
        footDirL: [0.7, 0.7, 0],
        footDirR: [0.7, 0.7, 0],
      });
      return;
    }

    case 'russian_twist': {
      const yaw = s * 0.85;
      const forwardX = Math.cos(yaw);
      const forwardZ = -Math.sin(yaw);
      buildFloorPose(state, {
        pelvis: [-0.08, 0.14, 0],
        neck: [-0.32, 0.5, 0],
        torsoForwardHint: [1, 0.55, 0],
        torsoYawRad: yaw,
        ankleL: [0.52, 0.24, -0.08],
        ankleR: [0.52, 0.24, 0.08],
        kneePoleL: [0.1, 1.0, -0.1],
        kneePoleR: [0.1, 1.0, 0.1],
        handL: [0.12 + forwardX * 0.24, 0.39, forwardZ * 0.34 - 0.03],
        handR: [0.12 + forwardX * 0.24, 0.39, forwardZ * 0.34 + 0.03],
        elbowPoleL: [-0.3, -0.55, -0.75],
        elbowPoleR: [-0.3, -0.55, 0.75],
        footDirL: [0.45, 0.85, 0],
        footDirR: [0.45, 0.85, 0],
      });
      return;
    }

    case 'leg_raise': {
      const raise = w;
      const angle = THREE.MathUtils.lerp(0.12, 1.48, raise);
      const legLen = THIGH_LEN + SHIN_LEN - 0.02;
      const ankleX = Math.cos(angle) * legLen;
      const ankleY = 0.11 + Math.sin(angle) * legLen;
      buildFloorPose(state, {
        pelvis: [0, 0.11, 0],
        neck: [-0.48, 0.11, 0],
        torsoForwardHint: [0, 1, 0],
        ankleL: [ankleX, ankleY, -0.1],
        ankleR: [ankleX, ankleY, 0.1],
        kneePoleL: [0.1, 1.0, 0],
        kneePoleR: [0.1, 1.0, 0],
        handL: [-0.04, 0.055, -0.24],
        handR: [-0.04, 0.055, 0.24],
        elbowPoleL: [-0.5, 0.2, -0.7],
        elbowPoleR: [-0.5, 0.2, 0.7],
        footDirL: [-Math.sin(angle), Math.cos(angle), 0],
        footDirR: [-Math.sin(angle), Math.cos(angle), 0],
        straightLegs: true,
      });
      return;
    }

    case 'dead_bug': {
      const ext = w;
      buildFloorPose(state, {
        pelvis: [0.05, 0.11, 0],
        neck: [-0.43, 0.11, 0],
        torsoForwardHint: [0, 1, 0],
        ankleL: [0.34, 0.56, -0.11],
        ankleR: [THREE.MathUtils.lerp(0.34, 0.82, ext), THREE.MathUtils.lerp(0.56, 0.16, ext), 0.11],
        kneePoleL: [-0.6, 0.8, -0.05],
        kneePoleR: [-0.6, 0.8, 0.05],
        handL: [THREE.MathUtils.lerp(-0.4, -0.92, ext), THREE.MathUtils.lerp(0.6, 0.16, ext), -0.18],
        handR: [-0.4, 0.6, 0.18],
        elbowPoleL: [0.3, 0.4, -0.3],
        elbowPoleR: [0.3, 0.4, 0.3],
        footDirL: [1, 0.3, 0],
        footDirR: [1, 0.3, 0],
      });
      return;
    }

    case 'side_plank': {
      // Cabeça para +X, peito para +Z => left = (0, -1, 0) (chão = L, teto = R)
      const lift = w;
      const pelvisY = THREE.MathUtils.lerp(0.25, 0.44, lift);
      const neckY = THREE.MathUtils.lerp(0.47, 0.56, lift);
      buildFloorPose(state, {
        pelvis: [0.04, pelvisY, 0],
        neck: [0.46, neckY, 0],
        torsoForwardHint: [0, 0, 1],
        ankleL: [-0.68, 0.08, -0.03],
        ankleR: [-0.68, 0.16, 0.03],
        kneePoleL: [0, 0.5, 0.9],
        kneePoleR: [0, 0.5, 0.9],
        handL: [0.64, 0.065, 0.14],
        handR: [0.36, neckY + 0.72, 0.04],
        elbowPoleL: [-0.25, -0.95, -0.25],
        elbowPoleR: [-0.2, 0.2, -0.9],
        footDirL: [0, 0.2, 1],
        footDirR: [0, 0.2, 1],
        straightLegs: true,
      });
      state.facingAxis = 'x';
      return;
    }

    case 'donkey_kick': {
      const kick = w;
      buildFloorPose(state, {
        pelvis: [-0.26, 0.54, 0],
        neck: [0.22, 0.58, 0],
        torsoForwardHint: [0, -1, 0],
        ankleL: [-0.62, 0.085, -0.11],
        ankleR: [THREE.MathUtils.lerp(-0.56, -0.78, kick), THREE.MathUtils.lerp(0.1, 0.86, kick), 0.11],
        kneePoleL: [0.55, -0.65, -0.1],
        kneePoleR: [THREE.MathUtils.lerp(0.55, -0.35, kick), -0.75, 0.05],
        handL: [0.26, 0.05, -0.18],
        handR: [0.26, 0.05, 0.18],
        elbowPoleL: [-0.7, 0.25, -0.25],
        elbowPoleR: [-0.7, 0.25, 0.25],
      });
      return;
    }

    case 'fire_hydrant': {
      const open = w;
      const thighAngle = THREE.MathUtils.lerp(0.08, 1.28, open);
      const kneeY = 0.52 - Math.cos(thighAngle) * THIGH_LEN;
      const kneeZ = 0.12 + Math.sin(thighAngle) * THIGH_LEN;
      buildFloorPose(state, {
        pelvis: [-0.26, 0.54, 0],
        neck: [0.22, 0.58, 0],
        torsoForwardHint: [0, -1, 0],
        ankleL: [-0.62, 0.085, -0.11],
        ankleR: [-0.54, Math.max(0.12, kneeY - 0.12), kneeZ + 0.16],
        kneePoleL: [0.55, -0.65, -0.1],
        kneePoleR: [0.2, 0.15, 0.96],
        handL: [0.26, 0.05, -0.18],
        handR: [0.26, 0.05, 0.18],
        elbowPoleL: [-0.7, 0.25, -0.25],
        elbowPoleR: [-0.7, 0.25, 0.25],
      });
      return;
    }

    case 'superman': {
      const lift = w;
      buildFloorPose(state, {
        pelvis: [-0.05, 0.11, 0],
        neck: [0.41, THREE.MathUtils.lerp(0.13, 0.29, lift), 0],
        torsoForwardHint: [0, -1, 0],
        ankleL: [-0.82, THREE.MathUtils.lerp(0.08, 0.35, lift), -0.1],
        ankleR: [-0.82, THREE.MathUtils.lerp(0.08, 0.35, lift), 0.1],
        kneePoleL: [0, 0.9, -0.1],
        kneePoleR: [0, 0.9, 0.1],
        handL: [0.88, THREE.MathUtils.lerp(0.08, 0.34, lift), -0.21],
        handR: [0.88, THREE.MathUtils.lerp(0.08, 0.34, lift), 0.21],
        elbowPoleL: [0, 0.25, -0.85],
        elbowPoleR: [0, 0.25, 0.85],
        straightLegs: true,
      });
      state.head.y = state.neck.y + 0.045;
      state.head.x = state.neck.x + 0.115;
      return;
    }

    case 'cat_camel': {
      const arch = s;
      buildFloorPose(state, {
        pelvis: [-0.26, 0.54 + arch * 0.04, 0],
        neck: [0.22, 0.58 + arch * 0.05, 0],
        torsoForwardHint: [0, -1, 0],
        headTiltUp: -arch,
        ankleL: [-0.62, 0.085, -0.11],
        ankleR: [-0.62, 0.085, 0.11],
        kneePoleL: [0.55, -0.65, -0.05],
        kneePoleR: [0.55, -0.65, 0.05],
        handL: [0.24, 0.05, -0.18],
        handR: [0.24, 0.05, 0.18],
        elbowPoleL: [-0.7, 0.25, -0.25],
        elbowPoleR: [-0.7, 0.25, 0.25],
      });
      state.lumbarMid.y += arch * 0.095;
      state.chestCenter.y += arch * 0.07;
      return;
    }

    case 'child_pose': {
      const breath = 0.012 * Math.sin(c * Math.PI * 2);
      buildFloorPose(state, {
        pelvis: [-0.54, 0.28, 0],
        neck: [-0.07, 0.22 + breath, 0],
        torsoForwardHint: [0, -1, 0],
        ankleL: [-0.575, 0.085, -0.11],
        ankleR: [-0.575, 0.085, 0.11],
        kneePoleL: [1.0, 0.0, -0.25],
        kneePoleR: [1.0, 0.0, 0.25],
        handL: [0.42, 0.06, -0.17],
        handR: [0.42, 0.06, 0.17],
        elbowPoleL: [0, 0.25, -0.65],
        elbowPoleR: [0, 0.25, 0.65],
      });
      return;
    }

    case 'cobra_stretch': {
      const lift = w;
      buildFloorPose(state, {
        pelvis: [-0.05, THREE.MathUtils.lerp(0.12, 0.23, lift), 0],
        neck: [0.25, THREE.MathUtils.lerp(0.16, 0.65, lift), 0],
        torsoForwardHint: [0.45 * lift, -1, 0],
        ankleL: [-0.82, 0.075, -0.1],
        ankleR: [-0.82, 0.075, 0.1],
        kneePoleL: [0, 0.9, -0.1],
        kneePoleR: [0, 0.9, 0.1],
        handL: [0.25, 0.05, -0.19],
        handR: [0.25, 0.05, 0.19],
        elbowPoleL: [-0.85, 0.3, -0.35],
        elbowPoleR: [-0.85, 0.3, 0.35],
        straightLegs: true,
      });
      return;
    }

    case 'mobility_twist': {
      const twist = w;
      buildFloorPose(state, {
        pelvis: [-0.08, 0.36, 0],
        neck: [0.32, 0.58, 0],
        torsoForwardHint: [0, -1, 0],
        torsoYawRad: twist * 1.15,
        ankleL: [0.42, 0.06, -0.18],
        ankleR: [-0.74, 0.085, 0.1],
        kneePoleL: [0.3, 0.95, -0.15],
        kneePoleR: [0, -0.55, 0.1],
        handL: [0.34, 0.05, -0.04],
        handR: [THREE.MathUtils.lerp(0.34, 0.31, twist), THREE.MathUtils.lerp(0.06, 1.24, twist), THREE.MathUtils.lerp(0.18, 0.16, twist)],
        elbowPoleL: [-0.6, 0.25, -0.3],
        elbowPoleR: [-0.6, 0.1, 0.7],
        footDirL: [1, 0, 0],
        footDirR: [-0.5, -0.85, 0],
      });
      return;
    }

    case 'bird_dog': {
      const extL = smooth01(Math.max(0, s));
      const extR = smooth01(Math.max(0, -s));
      buildFloorPose(state, {
        pelvis: [-0.24, 0.54, 0],
        neck: [0.24, 0.58, 0],
        torsoForwardHint: [0, -1, 0],
        ankleL: [THREE.MathUtils.lerp(-0.62, -1.07, extL), THREE.MathUtils.lerp(0.08, 0.52, extL), -0.11],
        ankleR: [THREE.MathUtils.lerp(-0.62, -1.07, extR), THREE.MathUtils.lerp(0.08, 0.52, extR), 0.11],
        kneePoleL: [THREE.MathUtils.lerp(0.55, 0.0, extL), THREE.MathUtils.lerp(-0.65, 0.02, extL), -0.08],
        kneePoleR: [THREE.MathUtils.lerp(0.55, 0.0, extR), THREE.MathUtils.lerp(-0.65, 0.02, extR), 0.08],
        handL: [THREE.MathUtils.lerp(0.24, 0.75, extR), THREE.MathUtils.lerp(0.05, 0.58, extR), -0.16],
        handR: [THREE.MathUtils.lerp(0.24, 0.75, extL), THREE.MathUtils.lerp(0.05, 0.58, extL), 0.16],
        elbowPoleL: [-0.5, 0.25, -0.25],
        elbowPoleR: [-0.5, 0.25, 0.25],
        footDirL: [THREE.MathUtils.lerp(-0.35, -0.55, extL), THREE.MathUtils.lerp(-0.92, -0.82, extL), 0],
        footDirR: [THREE.MathUtils.lerp(-0.35, -0.55, extR), THREE.MathUtils.lerp(-0.92, -0.82, extR), 0],
      });
      return;
    }

    case 'pigeon_pose': {
      const fold = w * 0.05;
      buildFloorPose(state, {
        pelvis: [-0.08, 0.14, 0],
        neck: [0.17 + fold * 1.1, 0.31 - fold * 0.7, 0],
        torsoForwardHint: [0.65, -0.75, 0],
        ankleL: [-0.9, 0.065, -0.07],
        ankleR: [0.12, 0.075, -0.04],
        kneePoleL: [0, 0.45, -0.15],
        kneePoleR: [0.42, 0.05, 0.95],
        handL: [0.49, 0.05, -0.02],
        handR: [0.49, 0.05, 0.08],
        elbowPoleL: [0.08, -0.96, -0.35],
        elbowPoleR: [0.08, -0.96, 0.35],
        footDirL: [-0.8, -0.55, 0],
        footDirR: [-0.5, -0.6, -0.6],
      });
      return;
    }

    default: {
      const pelvisY = THREE.MathUtils.lerp(0.84, 0.46, w);
      buildStandingPose(state, {
        pelvisY,
        pelvisZ: THREE.MathUtils.lerp(0, -0.15, w),
        spinePitchRad: THREE.MathUtils.lerp(0.05, 0.5, w),
        footLX: 0.15,
        footLZ: 0,
        footRX: -0.15,
        footRZ: 0,
        handL: [0.21, THREE.MathUtils.lerp(0.8, 0.92, w), THREE.MathUtils.lerp(0.1, 0.44, w)],
        handR: [-0.21, THREE.MathUtils.lerp(0.8, 0.92, w), THREE.MathUtils.lerp(0.1, 0.44, w)],
      });
      return;
    }
  }
}
