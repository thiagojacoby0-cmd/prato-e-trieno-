import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Box, Camera, Gauge, Pause, Play, Settings2, UserRound, Volume2, VolumeX } from 'lucide-react';
import type { ExerciseTutorialSpec, TutorialArchetype } from '../types';
import { createEmptyPose3DState, evaluateExercisePose3D, type Pose3DState } from '../utils/exercise3DRig';

interface VectorExerciseDemoProps {
  exerciseName: string;
  muscleGroup: string;
  spec: ExerciseTutorialSpec;
  correctPosition?: string;
  playing?: boolean;
  onTogglePlaying?: () => void;
  onSwitchTo3D?: () => void;
  onOpenSettings?: () => void;
  showControls?: boolean;
  minimalStage?: boolean;
  frameless?: boolean;
  countdownOverlay?: number | null;
  topLeftSlot?: React.ReactNode;
  bottomRightSlot?: React.ReactNode;
  heightClass?: string;
  stepCounterLabel?: string;
  onCycleComplete?: (completedReps: number) => void;
  resetSignal?: string | number;
}

export type ProjectionMode = 'front' | 'profile_z' | 'profile_x' | 'diag_x';

export interface Pt2 {
  x: number;
  y: number;
  depth: number;
}

export interface ProjectedAnchors {
  chest: Pt2;
  neck: Pt2;
  pelvis: Pt2;
  lumbarMid: Pt2;
  sL: Pt2;
  sR: Pt2;
  eL: Pt2;
  eR: Pt2;
  wL: Pt2;
  wR: Pt2;
  hL: Pt2;
  hR: Pt2;
  kL: Pt2;
  kR: Pt2;
  aL: Pt2;
  aR: Pt2;
  facingSign: number;
  mode: ProjectionMode;
}

export interface MuscleSpot {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
}

export const MUSCLE_ZONE_LABELS: Record<string, string> = {
  quadriceps: 'Quadríceps',
  glutes: 'Glúteos',
  abs: 'Abdômen',
  core: 'Core',
  chest: 'Peito',
  shoulders: 'Ombros',
  back: 'Costas',
  arms: 'Braços',
  calves: 'Panturrilhas',
  hamstrings: 'Posteriores',
};

function normalizeMuscleZone(zone: string): string {
  const z = zone.trim().toLowerCase();
  if (z === 'quadríceps' || z === 'quads' || z === 'coxa') return 'quadriceps';
  if (z === 'glúteos' || z === 'gluteos' || z === 'glúteo') return 'glutes';
  if (z === 'abdômen' || z === 'abdomen' || z === 'abdominal') return 'abs';
  if (z === 'peito' || z === 'peitoral') return 'chest';
  if (z === 'ombros' || z === 'ombro' || z === 'deltoides') return 'shoulders';
  if (z === 'costas' || z === 'dorsal' || z === 'lombar') return 'back';
  if (z === 'braços' || z === 'bracos' || z === 'biceps' || z === 'bíceps' || z === 'triceps' || z === 'tríceps') return 'arms';
  if (z === 'panturrilhas' || z === 'panturrilha') return 'calves';
  if (z === 'posteriores' || z === 'posterior') return 'hamstrings';
  return z;
}

function makeSegmentSpot(
  a: Pt2,
  b: Pt2,
  t: number,
  rx: number,
  ry: number,
  shiftX = 0,
  shiftY = 0
): MuscleSpot {
  const x = a.x + (b.x - a.x) * t + shiftX;
  const y = a.y + (b.y - a.y) * t + shiftY;
  const rot = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return { x, y, rx, ry, rot };
}

export function computeMuscleSpots(
  zones: string[],
  anchors: ProjectedAnchors,
  scale: number
): MuscleSpot[] {
  const sF = scale / 128;
  const isFront = anchors.mode === 'front';
  const fwdX = isFront ? 0 : anchors.facingSign;
  const spots: MuscleSpot[] = [];
  const seen = new Set<string>();

  for (const rawZone of zones) {
    const zone = normalizeMuscleZone(rawZone);
    if (seen.has(zone)) continue;
    seen.add(zone);

    switch (zone) {
      case 'quadriceps': {
        spots.push(makeSegmentSpot(anchors.hL, anchors.kL, 0.58, 16.0 * sF, 7.6 * sF, fwdX * 2.4 * sF, 0));
        spots.push(makeSegmentSpot(anchors.hR, anchors.kR, 0.58, 16.0 * sF, 7.6 * sF, fwdX * 2.4 * sF, 0));
        break;
      }
      case 'hamstrings': {
        spots.push(makeSegmentSpot(anchors.hL, anchors.kL, 0.56, 15.0 * sF, 6.8 * sF, -fwdX * 2.2 * sF, 0));
        spots.push(makeSegmentSpot(anchors.hR, anchors.kR, 0.56, 15.0 * sF, 6.8 * sF, -fwdX * 2.2 * sF, 0));
        break;
      }
      case 'glutes': {
        spots.push(makeSegmentSpot(anchors.pelvis, anchors.hL, 0.50, 8.8 * sF, 7.2 * sF, -fwdX * 2.4 * sF, 1.0 * sF));
        spots.push(makeSegmentSpot(anchors.pelvis, anchors.hR, 0.50, 8.8 * sF, 7.2 * sF, -fwdX * 2.4 * sF, 1.0 * sF));
        break;
      }
      case 'abs': {
        spots.push(makeSegmentSpot(anchors.pelvis, anchors.chest, 0.42, 11.4 * sF, 6.2 * sF, fwdX * 2.6 * sF, 0));
        spots.push(makeSegmentSpot(anchors.pelvis, anchors.chest, 0.66, 10.0 * sF, 5.4 * sF, fwdX * 2.4 * sF, 0));
        break;
      }
      case 'core': {
        if (!seen.has('abs')) {
          spots.push(makeSegmentSpot(anchors.pelvis, anchors.chest, 0.46, 12.2 * sF, 6.8 * sF, fwdX * 1.6 * sF, 0));
        }
        spots.push(makeSegmentSpot(anchors.pelvis, anchors.lumbarMid, 0.55, 9.4 * sF, 5.8 * sF));
        break;
      }
      case 'chest': {
        if (isFront) {
          spots.push(makeSegmentSpot(anchors.chest, anchors.sL, 0.42, 9.4 * sF, 6.6 * sF, 0, 2.0 * sF));
          spots.push(makeSegmentSpot(anchors.chest, anchors.sR, 0.42, 9.4 * sF, 6.6 * sF, 0, 2.0 * sF));
        } else {
          spots.push(makeSegmentSpot(anchors.chest, anchors.neck, 0.14, 9.6 * sF, 6.8 * sF, fwdX * 3.4 * sF, 1.2 * sF));
        }
        break;
      }
      case 'shoulders': {
        spots.push(makeSegmentSpot(anchors.sL, anchors.eL, 0.21, 10.6 * sF, 8.2 * sF));
        spots.push(makeSegmentSpot(anchors.sR, anchors.eR, 0.21, 10.6 * sF, 8.2 * sF));
        break;
      }
      case 'back': {
        spots.push(makeSegmentSpot(anchors.lumbarMid, anchors.neck, 0.58, 12.6 * sF, 6.8 * sF, -fwdX * 2.8 * sF, 0));
        spots.push(makeSegmentSpot(anchors.pelvis, anchors.chest, 0.42, 9.8 * sF, 5.6 * sF, -fwdX * 2.6 * sF, 0));
        break;
      }
      case 'arms': {
        spots.push(makeSegmentSpot(anchors.sL, anchors.eL, 0.46, 11.4 * sF, 5.4 * sF));
        spots.push(makeSegmentSpot(anchors.sR, anchors.eR, 0.46, 11.4 * sF, 5.4 * sF));
        break;
      }
      case 'calves': {
        spots.push(makeSegmentSpot(anchors.kL, anchors.aL, 0.34, 11.2 * sF, 5.2 * sF, -fwdX * 1.8 * sF, 0));
        spots.push(makeSegmentSpot(anchors.kR, anchors.aR, 0.34, 11.2 * sF, 5.2 * sF, -fwdX * 1.8 * sF, 0));
        break;
      }
      default:
        break;
    }

    if (spots.length >= 10) break;
  }

  return spots.slice(0, 10);
}

export function getProjectionMode(archetype: TutorialArchetype): ProjectionMode {
  switch (archetype) {
    case 'jumping_jack':
    case 'sumo_squat':
    case 'lateral_raise':
    case 'shoulder_press':
    case 'torso_twist':
    case 'knee_circles':
    case 'side_plank':
      return 'front';

    case 'plank':
    case 'pushup':
    case 'box_pushup':
    case 'incline_pushup':
    case 'diamond_pushup':
    case 'tricep_dip':
    case 'renegade_row':
    case 'mountain_climber':
    case 'burpee':
    case 'glute_bridge':
    case 'crunch':
    case 'leg_raise':
    case 'dead_bug':
    case 'donkey_kick':
    case 'bird_dog':
    case 'superman':
    case 'cat_camel':
    case 'child_pose':
    case 'cobra_stretch':
    case 'pigeon_pose':
    case 'mobility_twist':
      return 'profile_x';

    case 'fire_hydrant':
    case 'russian_twist':
    case 'bicycle_crunch':
      return 'diag_x';

    default:
      return 'profile_z';
  }
}

export function isFloorProjection(mode: ProjectionMode): boolean {
  return mode === 'profile_x' || mode === 'diag_x';
}

export function projectPoint(
  v: THREE.Vector3,
  mode: ProjectionMode,
  scale: number,
  groundY: number,
  originX: number
): Pt2 {
  if (mode === 'front') {
    return {
      x: originX + (v.x + v.z * 0.12) * scale,
      y: groundY - (v.y - v.z * 0.04) * scale,
      depth: v.z,
    };
  }
  if (mode === 'profile_x') {
    return {
      x: originX + (v.x * 0.94 + v.z * 0.30) * scale,
      y: groundY - (v.y - v.z * 0.10) * scale,
      depth: v.z * 0.94 - v.x * 0.30,
    };
  }
  if (mode === 'diag_x') {
    return {
      x: originX + (v.x * 0.84 + v.z * 0.48) * scale,
      y: groundY - (v.y - v.z * 0.12) * scale,
      depth: v.z * 0.84 - v.x * 0.48,
    };
  }
  return {
    x: originX + (v.z * 0.96 + v.x * 0.26) * scale,
    y: groundY - (v.y + v.x * 0.08) * scale,
    depth: -v.x * 0.96 + v.z * 0.26,
  };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function f(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(1);
}

function buildCapsuleSegment(a: Pt2, b: Pt2, rA: number, rB: number): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.8) {
    const r = Math.max(rA, rB);
    const cx = (a.x + b.x) * 0.5;
    const cy = (a.y + b.y) * 0.5;
    return `M ${f(cx - r)} ${f(cy)} A ${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)} A ${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)} Z`;
  }
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  return (
    `M ${f(a.x + nx * rA)} ${f(a.y + ny * rA)} ` +
    `L ${f(b.x + nx * rB)} ${f(b.y + ny * rB)} ` +
    `A ${f(rB)} ${f(rB)} 0 0 0 ${f(b.x - nx * rB)} ${f(b.y - ny * rB)} ` +
    `L ${f(a.x - nx * rA)} ${f(a.y - ny * rA)} ` +
    `A ${f(rA)} ${f(rA)} 0 0 0 ${f(a.x + nx * rA)} ${f(a.y + ny * rA)} Z`
  );
}

interface LimbProfileSpec {
  limbKind?: 'arm' | 'leg';
  rRoot: number;
  // Upper segment (0..1 along p0->p1): radial widths on anterior and posterior edges at t=0.20 and t=0.56
  rUpperStartA: number;
  rUpperStartP: number;
  rUpperMidA: number;
  rUpperMidP: number;
  rJointOuter: number;
  rJointInner: number;
  // Lower segment (0..1 along p1->p2): radial widths at t=0.28 (calf/forearm belly) and t=0.68
  rLowerBellyA: number;
  rLowerBellyP: number;
  rLowerTaperA: number;
  rLowerTaperP: number;
  rEnd: number;
  anteriorHintX: number;
  anteriorHintY: number;
}

/**
 * Construtor anatômico 2D musculoso para braços e pernas (P0 -> P1 -> P2) usando curvas cúbicas/quadráticas
 * com deltoide arredondado, bíceps/antebraço definidos, quadríceps/panturrilha esculpidos e linhas internas limpas.
 */
function buildAnatomicalLimb(
  p0: Pt2,
  p1: Pt2,
  p2: Pt2,
  spec: LimbProfileSpec
): { path: string; creasePath: string; detailPath: string } {
  const dx1 = p1.x - p0.x;
  const dy1 = p1.y - p0.y;
  const l1 = Math.hypot(dx1, dy1);
  const dx2 = p2.x - p1.x;
  const dy2 = p2.y - p1.y;
  const l2 = Math.hypot(dx2, dy2);

  // Proteção contra escorço extremo (osso apontando direto para a câmera)
  if (l1 < 5 || l2 < 5) {
    if (l1 < 1.5 && l2 < 1.5) {
      return {
        path: buildCapsuleSegment(p0, p2, Math.max(spec.rRoot, spec.rJointOuter), Math.max(spec.rJointOuter, spec.rEnd)),
        creasePath: '',
        detailPath: '',
      };
    }
    if (l1 < 5) {
      return {
        path: buildCapsuleSegment(p1, p2, spec.rJointOuter, spec.rEnd),
        creasePath: '',
        detailPath: '',
      };
    }
    return {
      path: buildCapsuleSegment(p0, p1, spec.rRoot, spec.rJointOuter),
      creasePath: '',
      detailPath: '',
    };
  }

  const u1x = dx1 / l1;
  const u1y = dy1 / l1;
  const u2x = dx2 / l2;
  const u2y = dy2 / l2;

  // Normal esquerda dos ossos (+n = esquerda do vetor)
  const n1x = -u1y;
  const n1y = u1x;
  const n2x = -u2y;
  const n2y = u2x;

  // Determina qual lado é anterior (+n ou -n) sem inversões
  const leftDot = (n1x + n2x) * spec.anteriorHintX + (n1y + n2y) * spec.anteriorHintY;
  const leftIsAnt = leftDot >= 0;

  // Suaviza o volume muscular quando o osso está escorçado
  const upperScale = clamp((l1 - 6) / 18, 0.35, 1);
  const lowerScale = clamp((l2 - 6) / 18, 0.35, 1);
  const blendU = (full: number, base: number) => base + (full - base) * upperScale;
  const blendL = (full: number, base: number) => base + (full - base) * lowerScale;

  const r1StartLeft = blendU(leftIsAnt ? spec.rUpperStartA : spec.rUpperStartP, spec.rRoot);
  const r1StartRight = blendU(leftIsAnt ? spec.rUpperStartP : spec.rUpperStartA, spec.rRoot);
  const r1MidLeft = blendU(leftIsAnt ? spec.rUpperMidA : spec.rUpperMidP, spec.rJointOuter);
  const r1MidRight = blendU(leftIsAnt ? spec.rUpperMidP : spec.rUpperMidA, spec.rJointOuter);

  const r2BellyLeft = blendL(leftIsAnt ? spec.rLowerBellyA : spec.rLowerBellyP, spec.rJointOuter);
  const r2BellyRight = blendL(leftIsAnt ? spec.rLowerBellyP : spec.rLowerBellyA, spec.rJointOuter);
  const r2TaperLeft = leftIsAnt ? spec.rLowerTaperA : spec.rLowerTaperP;
  const r2TaperRight = leftIsAnt ? spec.rLowerTaperP : spec.rLowerTaperA;

  // Bissetriz da articulação
  let mx = n1x + n2x;
  let my = n1y + n2y;
  let mLen = Math.hypot(mx, my);
  if (mLen < 0.2) {
    const cx = p2.x - p0.x;
    const cy = p2.y - p0.y;
    const cLen = Math.hypot(cx, cy) || 1;
    mx = -cy / cLen;
    my = cx / cLen;
    mLen = 1;
  }
  const nmx = mx / mLen;
  const nmy = my / mLen;

  const dot = clamp(u1x * u2x + u1y * u2y, -0.9, 1);
  const bend = (1 - dot) * 0.5;

  // Identifica lado interno da dobra usando o ponto médio da corda P0-P2
  const chordMidX = (p0.x + p2.x) * 0.5 - p1.x;
  const chordMidY = (p0.y + p2.y) * 0.5 - p1.y;
  const leftIsInner = nmx * chordMidX + nmy * chordMidY > 0;

  // Ajuste anatômico nos raios da junta
  const outerOffset = spec.rJointOuter * (1.0 + bend * 0.16);
  const innerOffset = Math.max(
    spec.rJointInner * 0.50,
    spec.rJointInner * (0.94 - bend * 0.34)
  );

  // Recuo proporcional próximo à articulação para transição arredondada
  const trim1 = Math.min(l1 * 0.24, spec.rJointOuter * 0.85);
  const trim2 = Math.min(l2 * 0.24, spec.rJointOuter * 0.85);

  const aRoot: [number, number] = [p0.x + n1x * spec.rRoot, p0.y + n1y * spec.rRoot];
  const bRoot: [number, number] = [p0.x - n1x * spec.rRoot, p0.y - n1y * spec.rRoot];
  const aEnd: [number, number] = [p2.x + n2x * spec.rEnd, p2.y + n2y * spec.rEnd];
  const bEnd: [number, number] = [p2.x - n2x * spec.rEnd, p2.y - n2y * spec.rEnd];

  // Lado A (+n)
  const aUpper1: [number, number] = [p0.x + dx1 * 0.20 + n1x * r1StartLeft, p0.y + dy1 * 0.20 + n1y * r1StartLeft];
  const aUpper2: [number, number] = [p0.x + dx1 * 0.56 + n1x * r1MidLeft, p0.y + dy1 * 0.56 + n1y * r1MidLeft];
  const aJoinIn: [number, number] = [
    p1.x - u1x * trim1 + n1x * (leftIsInner ? innerOffset * 0.96 : spec.rJointOuter),
    p1.y - u1y * trim1 + n1y * (leftIsInner ? innerOffset * 0.96 : spec.rJointOuter),
  ];
  const aJoinMid: [number, number] = [
    p1.x + nmx * (leftIsInner ? innerOffset : outerOffset),
    p1.y + nmy * (leftIsInner ? innerOffset : outerOffset),
  ];
  const aJoinOut: [number, number] = [
    p1.x + u2x * trim2 + n2x * (leftIsInner ? innerOffset * 0.96 : spec.rJointOuter),
    p1.y + u2y * trim2 + n2y * (leftIsInner ? innerOffset * 0.96 : spec.rJointOuter),
  ];
  const aLower1: [number, number] = [p1.x + dx2 * 0.28 + n2x * r2BellyLeft, p1.y + dy2 * 0.28 + n2y * r2BellyLeft];
  const aLower2: [number, number] = [p1.x + dx2 * 0.68 + n2x * r2TaperLeft, p1.y + dy2 * 0.68 + n2y * r2TaperLeft];

  // Lado B (-n)
  const bLower2: [number, number] = [p1.x + dx2 * 0.68 - n2x * r2TaperRight, p1.y + dy2 * 0.68 - n2y * r2TaperRight];
  const bLower1: [number, number] = [p1.x + dx2 * 0.28 - n2x * r2BellyRight, p1.y + dy2 * 0.28 - n2y * r2BellyRight];
  const bJoinOut: [number, number] = [
    p1.x + u2x * trim2 - n2x * (!leftIsInner ? innerOffset * 0.96 : spec.rJointOuter),
    p1.y + u2y * trim2 - n2y * (!leftIsInner ? innerOffset * 0.96 : spec.rJointOuter),
  ];
  const bJoinMid: [number, number] = [
    p1.x - nmx * (!leftIsInner ? innerOffset : outerOffset),
    p1.y - nmy * (!leftIsInner ? innerOffset : outerOffset),
  ];
  const bJoinIn: [number, number] = [
    p1.x - u1x * trim1 - n1x * (!leftIsInner ? innerOffset * 0.96 : spec.rJointOuter),
    p1.y - u1y * trim1 - n1y * (!leftIsInner ? innerOffset * 0.96 : spec.rJointOuter),
  ];
  const bUpper2: [number, number] = [p0.x + dx1 * 0.56 - n1x * r1MidRight, p0.y + dy1 * 0.56 - n1y * r1MidRight];
  const bUpper1: [number, number] = [p0.x + dx1 * 0.20 - n1x * r1StartRight, p0.y + dy1 * 0.20 - n1y * r1StartRight];

  const traceSmooth = (pts: Array<[number, number]>): string => {
    const out: string[] = [];
    const m0x = (pts[0][0] + pts[1][0]) * 0.5;
    const m0y = (pts[0][1] + pts[1][1]) * 0.5;
    out.push(`L ${f(m0x)} ${f(m0y)}`);
    for (let i = 1; i < pts.length - 1; i++) {
      const nmxP = (pts[i][0] + pts[i + 1][0]) * 0.5;
      const nmyP = (pts[i][1] + pts[i + 1][1]) * 0.5;
      out.push(`Q ${f(pts[i][0])} ${f(pts[i][1])} ${f(nmxP)} ${f(nmyP)}`);
    }
    const last = pts[pts.length - 1];
    out.push(`L ${f(last[0])} ${f(last[1])}`);
    return out.join(' ');
  };

  const aPts: Array<[number, number]> = [aRoot, aUpper1, aUpper2, aJoinIn, aJoinMid, aJoinOut, aLower1, aLower2, aEnd];
  const bPts: Array<[number, number]> = [bEnd, bLower2, bLower1, bJoinOut, bJoinMid, bJoinIn, bUpper2, bUpper1, bRoot];

  const path =
    `M ${f(aRoot[0])} ${f(aRoot[1])} ` +
    `${traceSmooth(aPts)} ` +
    `A ${f(spec.rEnd)} ${f(spec.rEnd)} 0 0 0 ${f(bEnd[0])} ${f(bEnd[1])} ` +
    `${traceSmooth(bPts)} ` +
    `A ${f(spec.rRoot)} ${f(spec.rRoot)} 0 0 0 ${f(aRoot[0])} ${f(aRoot[1])} Z`;

  // Vincos sutis de dobra articular
  let creasePath = '';
  if (bend > 0.24) {
    const inSign = leftIsInner ? 1 : -1;
    const cx = p1.x + nmx * inSign * (innerOffset * 0.62);
    const cy = p1.y + nmy * inSign * (innerOffset * 0.62);
    const c1x = cx - nmx * inSign * (spec.rJointInner * 0.42);
    const c1y = cy - nmy * inSign * (spec.rJointInner * 0.42);
    creasePath = `M ${f(cx)} ${f(cy)} Q ${f((cx + c1x) * 0.5 + u1x * 1.4)} ${f((cy + c1y) * 0.5 + u1y * 1.4)} ${f(c1x)} ${f(c1y)}`;
  }

  // Traços anatômicos internos discretos (deltoide/bíceps no braço; gota do quadríceps/joelho/panturrilha na perna)
  const details: string[] = [];
  if (spec.limbKind === 'arm' && l1 > 16 && l2 > 14) {
    const dSign = leftIsAnt ? 1 : -1;
    // Curva inferior do deltoide
    const d1x = p0.x + dx1 * 0.30 + n1x * (r1StartLeft * 0.62);
    const d1y = p0.y + dy1 * 0.30 + n1y * (r1StartLeft * 0.62);
    const d2x = p0.x + dx1 * 0.42;
    const d2y = p0.y + dy1 * 0.42;
    const d3x = p0.x + dx1 * 0.28 - n1x * (r1StartRight * 0.62);
    const d3y = p0.y + dy1 * 0.28 - n1y * (r1StartRight * 0.62);
    details.push(`M ${f(d1x)} ${f(d1y)} Q ${f(d2x)} ${f(d2y)} ${f(d3x)} ${f(d3y)}`);

    // Separação sutil bíceps / braquiorradial do antebraço
    const b1x = p0.x + dx1 * 0.48 + n1x * (dSign * 1.4);
    const b1y = p0.y + dy1 * 0.48 + n1y * (dSign * 1.4);
    const b2x = p0.x + dx1 * 0.84 + n1x * (dSign * 0.8);
    const b2y = p0.y + dy1 * 0.84 + n1y * (dSign * 0.8);
    details.push(`M ${f(b1x)} ${f(b1y)} L ${f(b2x)} ${f(b2y)}`);

    const f1x = p1.x + dx2 * 0.22 + n2x * (dSign * 1.2);
    const f1y = p1.y + dy2 * 0.22 + n2y * (dSign * 1.2);
    const f2x = p1.x + dx2 * 0.62 + n2x * (dSign * 0.3);
    const f2y = p1.y + dy2 * 0.62 + n2y * (dSign * 0.3);
    details.push(`M ${f(f1x)} ${f(f1y)} Q ${f((f1x + f2x) * 0.5 + n2x * (dSign * 0.8))} ${f((f1y + f2y) * 0.5 + n2y * (dSign * 0.8))} ${f(f2x)} ${f(f2y)}`);
  } else if (spec.limbKind === 'leg' && l1 > 18 && l2 > 18) {
    const qSign = leftIsAnt ? 1 : -1;
    // Definição do quadríceps (VMO e vasto lateral) acima do joelho
    const q1x = p0.x + dx1 * 0.58 + n1x * (qSign * spec.rJointOuter * 0.45);
    const q1y = p0.y + dy1 * 0.58 + n1y * (qSign * spec.rJointOuter * 0.45);
    const q2x = p0.x + dx1 * 0.86 + n1x * (qSign * spec.rJointOuter * 0.25);
    const q2y = p0.y + dy1 * 0.86 + n1y * (qSign * spec.rJointOuter * 0.25);
    details.push(`M ${f(q1x)} ${f(q1y)} Q ${f(p0.x + dx1 * 0.76 + n1x * (qSign * spec.rJointOuter * 0.55))} ${f(p0.y + dy1 * 0.76 + n1y * (qSign * spec.rJointOuter * 0.55))} ${f(q2x)} ${f(q2y)}`);

    // Contorno sutil da patela e curva tibial/panturrilha
    const patCx = p1.x + nmx * (qSign * spec.rJointOuter * 0.32);
    const patCy = p1.y + nmy * (qSign * spec.rJointOuter * 0.32);
    details.push(`M ${f(patCx - u2x * 2.2)} ${f(patCy - u2y * 2.2)} Q ${f(patCx + nmx * (qSign * 1.4))} ${f(patCy + nmy * (qSign * 1.4))} ${f(patCx + u2x * 2.6)} ${f(patCy + u2y * 2.6)}`);

    const c1x = p1.x + dx2 * 0.20 - n2x * (qSign * spec.rJointOuter * 0.30);
    const c1y = p1.y + dy2 * 0.20 - n2y * (qSign * spec.rJointOuter * 0.30);
    const c2x = p1.x + dx2 * 0.54 - n2x * (qSign * spec.rJointOuter * 0.20);
    const c2y = p1.y + dy2 * 0.54 - n2y * (qSign * spec.rJointOuter * 0.20);
    details.push(`M ${f(c1x)} ${f(c1y)} Q ${f(p1.x + dx2 * 0.36 - n2x * (qSign * spec.rJointOuter * 0.52))} ${f(p1.y + dy2 * 0.36 - n2y * (qSign * spec.rJointOuter * 0.52))} ${f(c2x)} ${f(c2y)}`);
  }

  return { path, creasePath, detailPath: details.join(' ') };
}

/**
 * Manga/perna da bermuda atlética encaixada limpo sobre o topo da coxa.
 */
function buildShortsLegPath(
  hip: Pt2,
  knee: Pt2,
  rRoot: number,
  rJoint: number,
  sF: number
): { path: string; hemLine: string } {
  const dx = knee.x - hip.x;
  const dy = knee.y - hip.y;
  const len = Math.hypot(dx, dy);
  if (len < 6) {
    const rTop = rRoot + 0.8 * sF;
    const rCuff = rJoint + (rRoot - rJoint) * 0.44 + 0.9 * sF;
    const cuff: Pt2 = { x: hip.x + dx * 0.50, y: hip.y + dy * 0.50, depth: hip.depth };
    return { path: buildCapsuleSegment(hip, cuff, rTop, rCuff), hemLine: '' };
  }
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  const endT = 0.50;
  const cuffX = hip.x + dx * endT;
  const cuffY = hip.y + dy * endT;
  const rTop = rRoot + 0.8 * sF;
  const rCuff = rJoint + (rRoot - rJoint) * 0.44 + 0.9 * sF;

  const pTopA: [number, number] = [hip.x + nx * rTop, hip.y + ny * rTop];
  const pTopB: [number, number] = [hip.x - nx * rTop, hip.y - ny * rTop];
  const pCuffA: [number, number] = [cuffX + nx * rCuff, cuffY + ny * rCuff];
  const pCuffB: [number, number] = [cuffX - nx * rCuff, cuffY - ny * rCuff];
  const cuffArcCtrl: [number, number] = [cuffX + ux * 1.6 * sF, cuffY + uy * 1.6 * sF];

  const path =
    `M ${f(pTopA[0])} ${f(pTopA[1])} ` +
    `Q ${f(hip.x + dx * 0.25 + nx * ((rTop + rCuff) * 0.5))} ${f(hip.y + dy * 0.25 + ny * ((rTop + rCuff) * 0.5))} ${f(pCuffA[0])} ${f(pCuffA[1])} ` +
    `Q ${f(cuffArcCtrl[0])} ${f(cuffArcCtrl[1])} ${f(pCuffB[0])} ${f(pCuffB[1])} ` +
    `Q ${f(hip.x + dx * 0.25 - nx * ((rTop + rCuff) * 0.5))} ${f(hip.y + dy * 0.25 - ny * ((rTop + rCuff) * 0.5))} ${f(pTopB[0])} ${f(pTopB[1])} ` +
    `A ${f(rTop)} ${f(rTop)} 0 0 0 ${f(pTopA[0])} ${f(pTopA[1])} Z`;

  const hemLine = `M ${f(pCuffA[0])} ${f(pCuffA[1])} Q ${f(cuffArcCtrl[0])} ${f(cuffArcCtrl[1])} ${f(pCuffB[0])} ${f(pCuffB[1])}`;
  return { path, hemLine };
}

/**
 * Desenha o tronco atlético musculoso em 2D (trapézio forte, peitoral largo em V, cintura atlética,
 * regata com linhas musculares peitorais e cós da bermuda) a partir dos pontos exatos do esqueleto 3D.
 */
function buildUnifiedTorsoPaths(
  pelvis: Pt2,
  lumbarMid: Pt2,
  chest: Pt2,
  neck: Pt2,
  chestFwd2D: Pt2,
  hipL: Pt2,
  hipR: Pt2,
  shL: Pt2,
  shR: Pt2,
  mode: ProjectionMode,
  sF: number
): {
  skinBody: string;
  topGarment: string;
  topStrapAccent: string;
  topCollarTrim: string;
  topDetailPath: string;
  bottomsGarment: string;
  waistbandPath: string;
} {
  const sx = neck.x - pelvis.x;
  const sy = neck.y - pelvis.y;
  const sLen = Math.hypot(sx, sy) || 1;
  const ux = sx / sLen;
  const uy = sy / sLen;

  if (mode === 'front') {
    let lx = -uy;
    let ly = ux;
    if (lx * (hipL.x - hipR.x) + ly * (hipL.y - hipR.y) < 0) {
      lx = -lx;
      ly = -ly;
    }

    const pt = (t: number, sideDist: number): Pt2 => ({
      x: pelvis.x + sx * t + lx * sideDist,
      y: pelvis.y + sy * t + ly * sideDist,
      depth: 0,
    });

    const shDist = Math.hypot(shL.x - shR.x, shL.y - shR.y) * 0.5;
    const hipDist = Math.hypot(hipL.x - hipR.x, hipL.y - hipR.y) * 0.5;
    const shHalf = clamp(shDist + 1.8 * sF, 17.6 * sF, 24.8 * sF);
    const chestHalf = clamp(shHalf * 0.84, 15.8 * sF, 21.4 * sF);
    const waistHalf = clamp(hipDist + 5.8 * sF, 13.6 * sF, 17.6 * sF);
    const hipHalf = Math.max(waistHalf * 1.10, hipDist + 9.4 * sF);
    const neckHalf = 5.6 * sF;

    const lNeck = pt(1.02, neckHalf);
    const rNeck = pt(1.02, -neckHalf);
    const lTrap = pt(0.955, shHalf * 0.54);
    const rTrap = pt(0.955, -shHalf * 0.54);
    const lShTop = pt(0.895, shHalf * 0.84);
    const rShTop = pt(0.895, -shHalf * 0.84);
    const lShOut = pt(0.79, shHalf * 0.94);
    const rShOut = pt(0.79, -shHalf * 0.94);
    const lChest = pt(0.64, chestHalf);
    const rChest = pt(0.64, -chestHalf);
    const lWaist = pt(0.24, waistHalf);
    const rWaist = pt(0.24, -waistHalf);
    const lHipOut = pt(0.01, hipHalf);
    const rHipOut = pt(0.01, -hipHalf);
    const crotch = pt(-0.07, 0);

    const skinBody =
      `M ${f(lNeck.x)} ${f(lNeck.y)} ` +
      `Q ${f(lTrap.x)} ${f(lTrap.y)} ${f(lShTop.x)} ${f(lShTop.y)} ` +
      `Q ${f(lShOut.x)} ${f(lShOut.y)} ${f(lChest.x)} ${f(lChest.y)} ` +
      `Q ${f(pt(0.43, waistHalf * 1.03).x)} ${f(pt(0.43, waistHalf * 1.03).y)} ${f(lWaist.x)} ${f(lWaist.y)} ` +
      `L ${f(lHipOut.x)} ${f(lHipOut.y)} ` +
      `Q ${f(crotch.x)} ${f(crotch.y)} ${f(rHipOut.x)} ${f(rHipOut.y)} ` +
      `L ${f(rWaist.x)} ${f(rWaist.y)} ` +
      `Q ${f(pt(0.43, -waistHalf * 1.03).x)} ${f(pt(0.43, -waistHalf * 1.03).y)} ${f(rChest.x)} ${f(rChest.y)} ` +
      `Q ${f(rShOut.x)} ${f(rShOut.y)} ${f(rShTop.x)} ${f(rShTop.y)} ` +
      `Q ${f(rTrap.x)} ${f(rTrap.y)} ${f(rNeck.x)} ${f(rNeck.y)} Z`;

    const lCollarIn = pt(0.955, neckHalf * 1.15);
    const lStrapOut = pt(0.925, clamp(shDist * 0.67, 11.0 * sF, 15.8 * sF));
    const rCollarIn = pt(0.955, -neckHalf * 1.15);
    const rStrapOut = pt(0.925, -clamp(shDist * 0.67, 11.0 * sF, 15.8 * sF));
    const neckDip = pt(0.75, 0);
    const lArmPit = pt(0.64, chestHalf);
    const rArmPit = pt(0.64, -chestHalf);

    const topGarment =
      `M ${f(lCollarIn.x)} ${f(lCollarIn.y)} ` +
      `Q ${f(neckDip.x)} ${f(neckDip.y)} ${f(rCollarIn.x)} ${f(rCollarIn.y)} ` +
      `L ${f(rStrapOut.x)} ${f(rStrapOut.y)} ` +
      `Q ${f(pt(0.77, -chestHalf * 0.72).x)} ${f(pt(0.77, -chestHalf * 0.72).y)} ${f(rArmPit.x)} ${f(rArmPit.y)} ` +
      `Q ${f(pt(0.44, -waistHalf * 1.01).x)} ${f(pt(0.44, -waistHalf * 1.01).y)} ${f(pt(0.22, -waistHalf * 1.04).x)} ${f(pt(0.22, -waistHalf * 1.04).y)} ` +
      `Q ${f(pt(0.19, 0).x)} ${f(pt(0.19, 0).y)} ${f(pt(0.22, waistHalf * 1.04).x)} ${f(pt(0.22, waistHalf * 1.04).y)} ` +
      `Q ${f(pt(0.44, waistHalf * 1.01).x)} ${f(pt(0.44, waistHalf * 1.01).y)} ${f(lArmPit.x)} ${f(lArmPit.y)} ` +
      `Q ${f(pt(0.77, chestHalf * 0.72).x)} ${f(pt(0.77, chestHalf * 0.72).y)} ${f(lStrapOut.x)} ${f(lStrapOut.y)} Z`;

    const topCollarTrim =
      `M ${f(lCollarIn.x)} ${f(lCollarIn.y)} Q ${f(neckDip.x)} ${f(neckDip.y)} ${f(rCollarIn.x)} ${f(rCollarIn.y)}`;

    const topStrapAccent =
      `M ${f(rArmPit.x)} ${f(rArmPit.y)} ` +
      `Q ${f(pt(0.44, -waistHalf * 1.01).x)} ${f(pt(0.44, -waistHalf * 1.01).y)} ${f(pt(0.22, -waistHalf * 1.04).x)} ${f(pt(0.22, -waistHalf * 1.04).y)} ` +
      `L ${f(pt(0.215, -waistHalf * 0.80).x)} ${f(pt(0.215, -waistHalf * 0.80).y)} ` +
      `Q ${f(pt(0.44, -waistHalf * 0.78).x)} ${f(pt(0.44, -waistHalf * 0.78).y)} ${f(pt(0.64, -chestHalf * 0.76).x)} ${f(pt(0.64, -chestHalf * 0.76).y)} Z`;

    const topDetailPath =
      // Linha inferior do peitoral esquerdo e direito + linha central sutil do tronco
      `M ${f(pt(0.60, chestHalf * 0.74).x)} ${f(pt(0.60, chestHalf * 0.74).y)} ` +
      `Q ${f(pt(0.55, chestHalf * 0.36).x)} ${f(pt(0.55, chestHalf * 0.36).y)} ${f(pt(0.62, 1.4 * sF).x)} ${f(pt(0.62, 1.4 * sF).y)} ` +
      `M ${f(pt(0.60, -chestHalf * 0.74).x)} ${f(pt(0.60, -chestHalf * 0.74).y)} ` +
      `Q ${f(pt(0.55, -chestHalf * 0.36).x)} ${f(pt(0.55, -chestHalf * 0.36).y)} ${f(pt(0.62, -1.4 * sF).x)} ${f(pt(0.62, -1.4 * sF).y)} ` +
      `M ${f(pt(0.53, 0).x)} ${f(pt(0.53, 0).y)} L ${f(pt(0.30, 0).x)} ${f(pt(0.30, 0).y)}`;

    const bandTop = pt(0.235, 0);
    const bandBot = pt(0.175, 0);
    const lWaistOut = pt(0.24, waistHalf * 1.03);
    const rWaistOut = pt(0.24, -waistHalf * 1.03);
    const lWaistBot = pt(0.18, waistHalf * 1.06);
    const rWaistBot = pt(0.18, -waistHalf * 1.06);

    const bottomsGarment =
      `M ${f(lWaistOut.x)} ${f(lWaistOut.y)} ` +
      `Q ${f(bandTop.x)} ${f(bandTop.y)} ${f(rWaistOut.x)} ${f(rWaistOut.y)} ` +
      `Q ${f(pt(0.11, -hipHalf * 0.99).x)} ${f(pt(0.11, -hipHalf * 0.99).y)} ${f(rHipOut.x)} ${f(rHipOut.y)} ` +
      `L ${f(pt(-0.04, -hipHalf * 0.84).x)} ${f(pt(-0.04, -hipHalf * 0.84).y)} ` +
      `Q ${f(crotch.x)} ${f(crotch.y)} ${f(pt(-0.04, hipHalf * 0.84).x)} ${f(pt(-0.04, hipHalf * 0.84).y)} ` +
      `L ${f(lHipOut.x)} ${f(lHipOut.y)} ` +
      `Q ${f(pt(0.11, hipHalf * 0.99).x)} ${f(pt(0.11, hipHalf * 0.99).y)} ${f(lWaistOut.x)} ${f(lWaistOut.y)} Z`;

    const waistbandPath =
      `M ${f(lWaistOut.x)} ${f(lWaistOut.y)} ` +
      `Q ${f(bandTop.x)} ${f(bandTop.y)} ${f(rWaistOut.x)} ${f(rWaistOut.y)} ` +
      `L ${f(rWaistBot.x)} ${f(rWaistBot.y)} ` +
      `Q ${f(bandBot.x)} ${f(bandBot.y)} ${f(lWaistBot.x)} ${f(lWaistBot.y)} Z`;

    return { skinBody, topGarment, topStrapAccent, topCollarTrim, topDetailPath, bottomsGarment, waistbandPath };
  }

  // Modo perfil / 3/4 seguindo a curvatura anatômica real da coluna
  let fx = -uy;
  let fy = ux;
  if (fx * chestFwd2D.x + fy * chestFwd2D.y < 0) {
    fx = -fx;
    fy = -fy;
  }

  const midSpineX = lumbarMid.x + (chest.x - lumbarMid.x) * 0.24;
  const midSpineY = lumbarMid.y + (chest.y - lumbarMid.y) * 0.24;
  const ctrlX = 2 * midSpineX - 0.5 * (pelvis.x + neck.x);
  const ctrlY = 2 * midSpineY - 0.5 * (pelvis.y + neck.y);

  const evalSpine = (t: number): { x: number; y: number; nx: number; ny: number } => {
    const tc = clamp(t, -0.25, 1.15);
    const omt = 1 - tc;
    const bx = omt * omt * pelvis.x + 2 * omt * tc * ctrlX + tc * tc * neck.x;
    const by = omt * omt * pelvis.y + 2 * omt * tc * ctrlY + tc * tc * neck.y;

    const dxdt = 2 * omt * (ctrlX - pelvis.x) + 2 * tc * (neck.x - ctrlX);
    const dydt = 2 * omt * (ctrlY - pelvis.y) + 2 * tc * (neck.y - ctrlY);
    const dLen = Math.hypot(dxdt, dydt) || 1;
    let nx = -dydt / dLen;
    let ny = dxdt / dLen;
    if (nx * fx + ny * fy < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { x: bx, y: by, nx, ny };
  };

  const p = (t: number, offset: number): Pt2 => {
    const sp = evalSpine(t);
    return {
      x: sp.x + sp.nx * offset * sF,
      y: sp.y + sp.ny * offset * sF,
      depth: 0,
    };
  };

  // Mede o deslocamento real dos ombros 3D em relação à coluna curva para nunca desconectar em torções/3-4
  const shLAlong = clamp(((shL.x - pelvis.x) * ux + (shL.y - pelvis.y) * uy) / sLen, 0.56, 1.00);
  const shRAlong = clamp(((shR.x - pelvis.x) * ux + (shR.y - pelvis.y) * uy) / sLen, 0.56, 1.00);
  const shLAxis = evalSpine(shLAlong);
  const shRAxis = evalSpine(shRAlong);
  const shLOff = ((shL.x - shLAxis.x) * shLAxis.nx + (shL.y - shLAxis.y) * shLAxis.ny) / Math.max(0.4, sF);
  const shROff = ((shR.x - shRAxis.x) * shRAxis.nx + (shR.y - shRAxis.y) * shRAxis.ny) / Math.max(0.4, sF);

  const frontShEdge = Math.max(shLOff, shROff);
  const backShEdge = Math.min(shLOff, shROff);
  const frontShT = shLOff >= shROff ? shLAlong : shRAlong;
  const backShT = shLOff <= shROff ? shLAlong : shRAlong;

  const frontChestW = clamp(Math.max(14.8, frontShEdge + 6.2), 14.8, 34.0);
  const backScapW = clamp(Math.min(-12.6, backShEdge - 6.2), -34.0, -12.6);
  const frontChestT = clamp(0.73 * 0.35 + frontShT * 0.65, 0.62, 0.90);
  const backScapT = clamp(0.74 * 0.35 + backShT * 0.65, 0.62, 0.90);
  const frontCollarT = clamp(Math.max(0.92, frontShT * 0.95), 0.91, 1.00);
  const backTrapT = clamp(Math.max(0.90, backShT * 0.94), 0.89, 0.98);

  // Silhueta atlética musculosa (peitoral cheio + dorsal em V + cintura firme + glúteo proporcional)
  const fNeck = p(1.01, 4.9);
  const fCollar = p(frontCollarT, Math.max(7.2, frontChestW * 0.62));
  const fChest = p(frontChestT, frontChestW);
  const fRib = p(0.50, Math.max(11.4, frontChestW * 0.72));
  const fBand = p(0.24, 9.9);
  const fHip = p(-0.02, 10.0);
  const botMid = p(-0.11, -0.2);
  const bHip = p(-0.02, -9.8);
  const bGlute = p(0.11, -11.0);
  const bBand = p(0.25, -9.4);
  const bLumbar = p(0.46, Math.min(-8.6, backScapW * 0.64));
  const bScapula = p(backScapT, backScapW);
  const bTrap = p(backTrapT, Math.min(-8.4, backScapW * 0.72));
  const bNeck = p(1.01, -4.8);

  const skinBody =
    `M ${f(fNeck.x)} ${f(fNeck.y)} ` +
    `L ${f(fCollar.x)} ${f(fCollar.y)} ` +
    `Q ${f(p(Math.min(0.98, frontChestT + 0.11), frontChestW * 0.94).x)} ${f(p(Math.min(0.98, frontChestT + 0.11), frontChestW * 0.94).y)} ${f(fChest.x)} ${f(fChest.y)} ` +
    `Q ${f(p(0.61, Math.max(12.2, frontChestW * 0.84)).x)} ${f(p(0.61, Math.max(12.2, frontChestW * 0.84)).y)} ${f(fRib.x)} ${f(fRib.y)} ` +
    `Q ${f(p(0.36, 10.2).x)} ${f(p(0.36, 10.2).y)} ${f(fBand.x)} ${f(fBand.y)} ` +
    `L ${f(fHip.x)} ${f(fHip.y)} ` +
    `Q ${f(botMid.x)} ${f(botMid.y)} ${f(bHip.x)} ${f(bHip.y)} ` +
    `Q ${f(bGlute.x)} ${f(bGlute.y)} ${f(bBand.x)} ${f(bBand.y)} ` +
    `Q ${f(bLumbar.x)} ${f(bLumbar.y)} ${f(bScapula.x)} ${f(bScapula.y)} ` +
    `Q ${f(p(Math.min(0.97, backScapT + 0.10), backScapW * 0.86).x)} ${f(p(Math.min(0.97, backScapT + 0.10), backScapW * 0.86).y)} ${f(bTrap.x)} ${f(bTrap.y)} ` +
    `L ${f(bNeck.x)} ${f(bNeck.y)} Z`;

  const strapFront = p(0.94, 5.2);
  const strapBack = p(0.93, -4.4);
  const fTopNeck = p(Math.min(0.94, frontChestT + 0.12), Math.min(20.0, frontChestW * 0.82));
  const fArmhole = p(frontChestT, Math.min(21.5, frontChestW * 0.94));
  const bArmhole = p(backScapT, Math.max(-20.5, backScapW * 0.94));
  const hemCenter = p(0.22, -0.2);
  const fHem = p(0.24, 10.1);
  const bHem = p(0.25, -9.6);

  const topGarment =
    `M ${f(strapFront.x)} ${f(strapFront.y)} ` +
    `Q ${f(fTopNeck.x)} ${f(fTopNeck.y)} ${f(fArmhole.x)} ${f(fArmhole.y)} ` +
    `Q ${f(p(0.61, Math.max(12.4, frontChestW * 0.86)).x)} ${f(p(0.61, Math.max(12.4, frontChestW * 0.86)).y)} ${f(fRib.x)} ${f(fRib.y)} ` +
    `Q ${f(p(0.36, 10.4).x)} ${f(p(0.36, 10.4).y)} ${f(fHem.x)} ${f(fHem.y)} ` +
    `Q ${f(hemCenter.x)} ${f(hemCenter.y)} ${f(bHem.x)} ${f(bHem.y)} ` +
    `Q ${f(bLumbar.x)} ${f(bLumbar.y)} ${f(bArmhole.x)} ${f(bArmhole.y)} ` +
    `Q ${f(p(Math.min(0.94, backScapT + 0.12), Math.max(-18.0, backScapW * 0.76)).x)} ${f(p(Math.min(0.94, backScapT + 0.12), Math.max(-18.0, backScapW * 0.76)).y)} ${f(strapBack.x)} ${f(strapBack.y)} ` +
    `Q ${f(p(0.92, 0.5).x)} ${f(p(0.92, 0.5).y)} ${f(strapFront.x)} ${f(strapFront.y)} Z`;

  const topCollarTrim =
    `M ${f(strapFront.x)} ${f(strapFront.y)} Q ${f(p(0.89, 1.2).x)} ${f(p(0.89, 1.2).y)} ${f(p(0.86, -1.8).x)} ${f(p(0.86, -1.8).y)}`;

  const topStrapAccent =
    `M ${f(bArmhole.x)} ${f(bArmhole.y)} ` +
    `Q ${f(bLumbar.x)} ${f(bLumbar.y)} ${f(bHem.x)} ${f(bHem.y)} ` +
    `L ${f(p(0.24, -6.5).x)} ${f(p(0.24, -6.5).y)} ` +
    `Q ${f(p(0.46, -5.6).x)} ${f(p(0.46, -5.6).y)} ${f(p(backScapT, backScapW * 0.70).x)} ${f(p(backScapT, backScapW * 0.70).y)} Z`;

  const topDetailPath =
    `M ${f(p(0.66, frontChestW * 0.78).x)} ${f(p(0.66, frontChestW * 0.78).y)} ` +
    `Q ${f(p(0.58, frontChestW * 0.54).x)} ${f(p(0.58, frontChestW * 0.54).y)} ${f(p(0.65, frontChestW * 0.24).x)} ${f(p(0.65, frontChestW * 0.24).y)}`;

  const waistMid = p(0.245, -0.2);
  const waistBotMid = p(0.185, -0.2);
  const fWaistBot = p(0.18, 10.1);
  const bWaistBot = p(0.19, -10.2);

  const bottomsGarment =
    `M ${f(fHem.x)} ${f(fHem.y)} ` +
    `Q ${f(waistMid.x)} ${f(waistMid.y)} ${f(bHem.x)} ${f(bHem.y)} ` +
    `Q ${f(bGlute.x)} ${f(bGlute.y)} ${f(bHip.x)} ${f(bHip.y)} ` +
    `Q ${f(botMid.x)} ${f(botMid.y)} ${f(fHip.x)} ${f(fHip.y)} Z`;

  const waistbandPath =
    `M ${f(fHem.x)} ${f(fHem.y)} ` +
    `Q ${f(waistMid.x)} ${f(waistMid.y)} ${f(bHem.x)} ${f(bHem.y)} ` +
    `L ${f(bWaistBot.x)} ${f(bWaistBot.y)} ` +
    `Q ${f(waistBotMid.x)} ${f(waistBotMid.y)} ${f(fWaistBot.x)} ${f(fWaistBot.y)} Z`;

  return { skinBody, topGarment, topStrapAccent, topCollarTrim, topDetailPath, bottomsGarment, waistbandPath };
}

/**
 * Mão humana limpa em estilo estúdio 2D (apoiada no chão, segurando halter ou relaxada).
 */
function buildSculptedHandPath(
  elbow: Pt2,
  wrist: Pt2,
  sF: number,
  facingSign: number,
  opts?: { isFloor: boolean; wristWorldY: number; isDumbbell?: boolean }
): string {
  const dx = wrist.x - elbow.x;
  const dy = wrist.y - elbow.y;
  const len = Math.hypot(dx, dy) || 1;
  const isPlantedOnMat =
    Boolean(opts?.isFloor) &&
    (opts?.wristWorldY ?? 1) < 0.095 &&
    dy > len * 0.26;

  if (opts?.isDumbbell && !isPlantedOnMat) {
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const cx = wrist.x + ux * 1.4 * sF;
    const cy = wrist.y + uy * 1.4 * sF;
    const rx = 4.2 * sF;
    const ry = 3.2 * sF;
    return (
      `M ${f(cx - nx * rx - ux * ry * 0.6)} ${f(cy - ny * rx - uy * ry * 0.6)} ` +
      `Q ${f(cx + ux * ry * 1.15)} ${f(cy + uy * ry * 1.15)} ${f(cx + nx * rx - ux * ry * 0.6)} ${f(cy + ny * rx - uy * ry * 0.6)} ` +
      `Q ${f(cx + nx * rx * 0.9 - ux * ry * 1.35)} ${f(cy + ny * rx * 0.9 - uy * ry * 1.35)} ${f(wrist.x - nx * 2.4 * sF)} ${f(wrist.y - ny * 2.4 * sF)} Z`
    );
  }

  const ux = isPlantedOnMat ? facingSign : dx / len;
  const uy = isPlantedOnMat ? 0.04 : dy / len;
  let nx = -uy;
  let ny = ux;
  if (nx * facingSign + ny * -0.4 < 0) {
    nx = -nx;
    ny = -ny;
  }

  const rWrist = 3.0 * sF;
  const palmLen = (isPlantedOnMat ? 5.6 : 5.4) * sF;
  const fingerLen = (isPlantedOnMat ? 9.6 : 9.4) * sF;
  const palmHalf = 3.3 * sF;

  const w1x = wrist.x + nx * rWrist;
  const w1y = wrist.y + ny * rWrist;
  const w2x = wrist.x - nx * rWrist;
  const w2y = wrist.y - ny * rWrist;

  const thumbBaseX = wrist.x + ux * (palmLen * 0.36) + nx * (palmHalf * 0.96);
  const thumbBaseY = wrist.y + uy * (palmLen * 0.36) + ny * (palmHalf * 0.96);
  const thumbTipX = wrist.x + ux * (palmLen * 0.84) + nx * (palmHalf * 1.24);
  const thumbTipY = wrist.y + uy * (palmLen * 0.84) + ny * (palmHalf * 1.24);
  const fingerTipX = wrist.x + ux * (fingerLen + 1.0 * sF);
  const fingerTipY = wrist.y + uy * (fingerLen + 1.0 * sF);
  const fingerIdxX = wrist.x + ux * fingerLen + nx * (2.0 * sF);
  const fingerIdxY = wrist.y + uy * fingerLen + ny * (2.0 * sF);
  const outerKnuckleX = wrist.x + ux * (palmLen * 0.92) - nx * palmHalf;
  const outerKnuckleY = wrist.y + uy * (palmLen * 0.92) - ny * palmHalf;

  return (
    `M ${f(w1x)} ${f(w1y)} ` +
    `Q ${f(thumbBaseX)} ${f(thumbBaseY)} ${f(thumbTipX)} ${f(thumbTipY)} ` +
    `Q ${f(fingerIdxX)} ${f(fingerIdxY)} ${f(fingerTipX)} ${f(fingerTipY)} ` +
    `Q ${f(wrist.x + ux * (fingerLen * 0.88) - nx * (palmHalf * 0.85))} ${f(wrist.y + uy * (fingerLen * 0.88) - ny * (palmHalf * 0.85))} ${f(outerKnuckleX)} ${f(outerKnuckleY)} ` +
    `L ${f(w2x)} ${f(w2y)} Z`
  );
}

/**
 * Tênis esportivo moderno 2D (cabedal + entressola branca + detalhe lateral) em vista frontal e lateral.
 */
function buildAthleticShoePaths(
  ankle: Pt2,
  footVecX: number,
  footVecY: number,
  sF: number,
  opts: { groundY: number; isFloor: boolean; mode: ProjectionMode; facingSign: number; worldAnkleY: number; isLeft?: boolean }
): { upperPath: string; solePath: string; detailPath: string } {
  if (opts.mode === 'front') {
    const side = opts.isLeft ? 1 : -1;
    const cx = ankle.x + side * 1.8 * sF;
    const cy = ankle.y + 3.0 * sF;
    const w = 6.7 * sF;
    const h = 5.4 * sF;
    const soleH = 2.3 * sF;

    const upperPath =
      `M ${f(cx - w * 0.58)} ${f(cy - h * 0.92)} ` +
      `Q ${f(cx)} ${f(cy - h * 0.54)} ${f(cx + w * 0.58)} ${f(cy - h * 0.92)} ` +
      `Q ${f(cx + w * 1.04)} ${f(cy + h * 0.14)} ${f(cx + w * 0.94)} ${f(cy + h * 0.84)} ` +
      `Q ${f(cx)} ${f(cy + h * 1.04)} ${f(cx - w * 0.94)} ${f(cy + h * 0.84)} ` +
      `Q ${f(cx - w * 1.04)} ${f(cy + h * 0.14)} ${f(cx - w * 0.58)} ${f(cy - h * 0.92)} Z`;

    const solePath =
      `M ${f(cx - w * 0.96)} ${f(cy + h * 0.64)} ` +
      `Q ${f(cx)} ${f(cy + h * 0.92)} ${f(cx + w * 0.96)} ${f(cy + h * 0.64)} ` +
      `L ${f(cx + w * 0.90)} ${f(cy + h * 0.64 + soleH)} ` +
      `Q ${f(cx)} ${f(cy + h * 0.92 + soleH)} ${f(cx - w * 0.90)} ${f(cy + h * 0.64 + soleH)} Z`;

    const detailPath =
      `M ${f(cx - w * 0.42)} ${f(cy - h * 0.16)} Q ${f(cx)} ${f(cy - h * 0.30)} ${f(cx + w * 0.42)} ${f(cy - h * 0.16)}`;

    return { upperPath, solePath, detailPath };
  }

  let fx = footVecX;
  let fy = footVecY;
  let fLen = Math.hypot(fx, fy);
  if (fLen < 0.08) {
    fx = opts.facingSign;
    fy = 0;
    fLen = 1;
  }
  const ux = fx / fLen;
  const uy = fy / fLen;

  let upX = uy;
  let upY = -ux;

  const isTuckedBackToe = opts.isFloor && uy > 0.25 && ux <= 0.2;
  if (isTuckedBackToe) {
    if (upX < 0) {
      upX = -upX;
      upY = -upY;
    }
  } else {
    if (upY > 0.15) {
      upX = -upX;
      upY = -upY;
    }
  }

  const shoeLen = isTuckedBackToe ? 13.0 * sF : 15.6 * sF;
  const heelBack = 4.6 * sF;
  const ankleDrop = isTuckedBackToe ? 1.8 * sF : 4.2 * sF;

  let heelX = ankle.x - ux * heelBack - upX * ankleDrop;
  let heelY = ankle.y - uy * heelBack - upY * ankleDrop;
  let toeX = ankle.x + ux * shoeLen - upX * ankleDrop;
  let toeY = ankle.y + uy * shoeLen - upY * ankleDrop;

  if (!isTuckedBackToe && !opts.isFloor && opts.worldAnkleY < 0.11) {
    const soleTargetY = ankle.y + 4.2 * sF;
    if (Math.abs(uy) < 0.25) {
      heelY = soleTargetY;
      toeY = soleTargetY;
    }
  }

  const collarH = 7.2 * sF;
  const vampH = 4.6 * sF;
  const soleThick = 2.2 * sF;

  const heelRoundX = heelX + upX * (collarH * 0.36) - ux * 1.4 * sF;
  const heelRoundY = heelY + upY * (collarH * 0.36) - uy * 1.4 * sF;
  const heelTopX = heelX + upX * (collarH * 0.86) + ux * (1.8 * sF);
  const heelTopY = heelY + upY * (collarH * 0.86) + uy * (1.8 * sF);
  const tongueX = ankle.x + ux * (3.6 * sF) + upX * (2.9 * sF);
  const tongueY = ankle.y + uy * (3.6 * sF) + upY * (2.9 * sF);
  const toeTopX = toeX + upX * (vampH * 0.72) - ux * (3.2 * sF);
  const toeTopY = toeY + upY * (vampH * 0.72) - uy * (3.2 * sF);
  const toeTipX = toeX + upX * (vampH * 0.28) + ux * (0.5 * sF);
  const toeTipY = toeY + upY * (vampH * 0.28) + uy * (0.5 * sF);
  const midVampX = ankle.x + ux * (shoeLen * 0.56) + upX * (vampH * 0.92);
  const midVampY = ankle.y + uy * (shoeLen * 0.56) + upY * (vampH * 0.92);

  const upperPath =
    `M ${f(heelX + ux * 1.0 * sF)} ${f(heelY + uy * 1.0 * sF)} ` +
    `Q ${f(heelRoundX)} ${f(heelRoundY)} ${f(heelTopX)} ${f(heelTopY)} ` +
    `Q ${f((heelTopX + tongueX) * 0.5)} ${f((heelTopY + tongueY) * 0.5 + 0.9 * sF)} ${f(tongueX)} ${f(tongueY)} ` +
    `Q ${f(midVampX)} ${f(midVampY)} ${f(toeTopX)} ${f(toeTopY)} ` +
    `Q ${f(toeTipX + ux * 1.5 * sF)} ${f(toeTipY + uy * 1.5 * sF)} ${f(toeX - ux * 1.2 * sF)} ${f(toeY - uy * 1.2 * sF)} Z`;

  const solePath =
    `M ${f(heelX + ux * 0.9 * sF)} ${f(heelY + uy * 0.9 * sF)} ` +
    `L ${f(toeX - ux * 1.0 * sF)} ${f(toeY - uy * 1.0 * sF)} ` +
    `Q ${f(toeX - upX * (soleThick * 0.85))} ${f(toeY - upY * (soleThick * 0.85))} ${f(toeX - ux * 2.0 * sF - upX * soleThick)} ${f(toeY - uy * 2.0 * sF - upY * soleThick)} ` +
    `L ${f(heelX + ux * 1.6 * sF - upX * soleThick)} ${f(heelY + uy * 1.6 * sF - upY * soleThick)} ` +
    `Q ${f(heelX - upX * (soleThick * 0.75))} ${f(heelY - upY * (soleThick * 0.75))} ${f(heelX + ux * 0.9 * sF)} ${f(heelY + uy * 0.9 * sF)} Z`;

  const detailPath =
    `M ${f(heelX + ux * 3.8 * sF + upX * (collarH * 0.34))} ${f(heelY + uy * 3.8 * sF + upY * (collarH * 0.34))} ` +
    `Q ${f(ankle.x + ux * (shoeLen * 0.32) + upX * (vampH * 0.25))} ${f(ankle.y + uy * (shoeLen * 0.32) + upY * (vampH * 0.25))} ` +
    `${f(toeX - ux * 4.5 * sF + upX * (vampH * 0.26))} ${f(toeY - uy * 4.5 * sF + upY * (vampH * 0.26))}`;

  return { upperPath, solePath, detailPath };
}

interface ArrowOverlay {
  path: string;
  tipX: number;
  tipY: number;
  tipAngle: number;
}

function getMotionArrow(
  archetype: TutorialArchetype,
  w: number,
  s: number,
  pts: { head: Pt2; chest: Pt2; pelvis: Pt2; fKnee: Pt2; fAnkle: Pt2; fSh: Pt2; fWr: Pt2 }
): ArrowOverlay | null {
  switch (archetype) {
    case 'lunge':
    case 'bulgarian':
    case 'squat':
    case 'jump_squat':
    case 'sumo_squat': {
      const kx = pts.fKnee.x + 28;
      const ky = pts.fKnee.y - 34 + w * 10;
      return {
        path: `M ${f(kx - 4)} ${f(ky - 24)} Q ${f(kx + 20)} ${f(ky + 2)} ${f(kx + 12)} ${f(ky + 32)}`,
        tipX: kx + 11,
        tipY: ky + 34,
        tipAngle: 108,
      };
    }
    case 'pushup':
    case 'incline_pushup':
    case 'diamond_pushup':
    case 'tricep_dip':
    case 'renegade_row': {
      const dir = s >= 0 ? 1 : -1;
      const ax = pts.chest.x + 42;
      const ay = pts.chest.y;
      return {
        path:
          dir > 0
            ? `M ${f(ax)} ${f(ay - 24)} Q ${f(ax + 11)} ${f(ay)} ${f(ax)} ${f(ay + 22)}`
            : `M ${f(ax)} ${f(ay + 22)} Q ${f(ax + 11)} ${f(ay)} ${f(ax)} ${f(ay - 24)}`,
        tipX: ax,
        tipY: dir > 0 ? ay + 24 : ay - 26,
        tipAngle: dir > 0 ? 102 : -102,
      };
    }
    case 'glute_bridge': {
      const bx = pts.pelvis.x;
      const by = pts.pelvis.y - 14;
      return {
        path: `M ${f(bx - 4)} ${f(by + 24)} Q ${f(bx - 14)} ${f(by)} ${f(bx)} ${f(by - 24)}`,
        tipX: bx + 1,
        tipY: by - 26,
        tipAngle: -75,
      };
    }
    case 'crunch':
    case 'bicycle_crunch':
    case 'leg_raise': {
      const cx = pts.chest.x;
      const cy = pts.chest.y - 18;
      return {
        path: `M ${f(cx - 16)} ${f(cy + 14)} Q ${f(cx + 8)} ${f(cy - 18)} ${f(cx + 38)} ${f(cy - 16)}`,
        tipX: cx + 40,
        tipY: cy - 16,
        tipAngle: -6,
      };
    }
    case 'jumping_jack':
    case 'lateral_raise':
    case 'shoulder_press': {
      const sx = pts.fSh.x - 42;
      const sy = pts.fSh.y + 8;
      return {
        path: `M ${f(sx)} ${f(sy + 24)} Q ${f(sx - 20)} ${f(sy - 10)} ${f(sx + 10)} ${f(sy - 42)}`,
        tipX: sx + 12,
        tipY: sy - 44,
        tipAngle: -40,
      };
    }
    case 'russian_twist':
    case 'torso_twist':
    case 'mobility_twist': {
      const rx = pts.chest.x;
      const ry = pts.chest.y + 4;
      return {
        path: `M ${f(rx - 40)} ${f(ry)} Q ${f(rx)} ${f(ry + 18)} ${f(rx + 40)} ${f(ry)}`,
        tipX: rx + 42,
        tipY: ry,
        tipAngle: -20,
      };
    }
    case 'donkey_kick':
    case 'fire_hydrant': {
      const ax = pts.fAnkle.x - 16;
      const ay = pts.fAnkle.y;
      return {
        path: `M ${f(ax + 12)} ${f(ay + 20)} Q ${f(ax - 16)} ${f(ay - 4)} ${f(ax - 4)} ${f(ay - 32)}`,
        tipX: ax - 3,
        tipY: ay - 34,
        tipAngle: -72,
      };
    }
    case 'bicep_curl': {
      const wx = pts.fWr.x + 22;
      const wy = pts.fWr.y;
      return {
        path: `M ${f(wx)} ${f(wy + 22)} Q ${f(wx + 16)} ${f(wy)} ${f(wx - 2)} ${f(wy - 24)}`,
        tipX: wx - 3,
        tipY: wy - 26,
        tipAngle: -115,
      };
    }
    case 'calf_raise': {
      const cx = pts.fAnkle.x + 30;
      const cy = pts.fAnkle.y - 12;
      return {
        path: `M ${f(cx)} ${f(cy + 16)} L ${f(cx)} ${f(cy - 18)}`,
        tipX: cx,
        tipY: cy - 20,
        tipAngle: -90,
      };
    }
    default:
      return null;
  }
}

export function computeVectorFramePaths(spec: ExerciseTutorialSpec, cycle: number, poseState: Pose3DState) {
  evaluateExercisePose3D(spec, cycle, poseState);

  const mode = getProjectionMode(spec.archetype);
  const isFloor = isFloorProjection(mode);
  const groundY = isFloor ? 242 : 262;
  const baseScale = isFloor ? 176 : 142;
  const topClearance = isFloor ? 28 : 26;
  const bottomLimit = 280;

  let uMinX = Infinity;
  let uMaxX = -Infinity;
  let uMinY = Infinity;
  let uMaxY = -Infinity;
  const expandUnit = (v: THREE.Vector3, padX: number, padTop: number, padBot: number) => {
    const u = projectPoint(v, mode, 1, 0, 0);
    if (u.x - padX < uMinX) uMinX = u.x - padX;
    if (u.x + padX > uMaxX) uMaxX = u.x + padX;
    if (u.y - padTop < uMinY) uMinY = u.y - padTop;
    if (u.y + padBot > uMaxY) uMaxY = u.y + padBot;
  };

  expandUnit(poseState.head, 18 / 128, 20 / 128, 15 / 128);
  expandUnit(poseState.neck, 12 / 128, 9 / 128, 9 / 128);
  expandUnit(poseState.chestCenter, 19 / 128, 14 / 128, 14 / 128);
  expandUnit(poseState.lumbarMid, 15 / 128, 11 / 128, 11 / 128);
  expandUnit(poseState.pelvis, 16 / 128, 13 / 128, 15 / 128);
  expandUnit(poseState.shoulderL, 16 / 128, 12 / 128, 12 / 128);
  expandUnit(poseState.shoulderR, 16 / 128, 12 / 128, 12 / 128);
  expandUnit(poseState.elbowL, 10 / 128, 10 / 128, 10 / 128);
  expandUnit(poseState.elbowR, 10 / 128, 10 / 128, 10 / 128);
  const handPad = poseState.prop === 'dumbbells' ? 17 / 128 : 11 / 128;
  expandUnit(poseState.wristL, handPad, handPad, handPad);
  expandUnit(poseState.wristR, handPad, handPad, handPad);
  expandUnit(poseState.hipL, 12 / 128, 12 / 128, 12 / 128);
  expandUnit(poseState.hipR, 12 / 128, 12 / 128, 12 / 128);
  expandUnit(poseState.kneeL, 10 / 128, 10 / 128, 10 / 128);
  expandUnit(poseState.kneeR, 10 / 128, 10 / 128, 10 / 128);
  expandUnit(poseState.ankleL, 16 / 128, 10 / 128, 10 / 128);
  expandUnit(poseState.ankleR, 16 / 128, 10 / 128, 10 / 128);
  const tipL = poseState.ankleL.clone().addScaledVector(poseState.footDirL, 0.125);
  const tipR = poseState.ankleR.clone().addScaledVector(poseState.footDirR, 0.125);
  expandUnit(tipL, 7 / 128, 8 / 128, 8 / 128);
  expandUnit(tipR, 7 / 128, 8 / 128, 8 / 128);

  if (poseState.prop === 'bench' || poseState.prop === 'chair_back') {
    const bu = projectPoint(poseState.propPosition, mode, 1, 0, 0);
    uMinX = Math.min(uMinX, bu.x - 36 / 128);
    uMaxX = Math.max(uMaxX, bu.x + 36 / 128);
    uMinY = Math.min(uMinY, -0.48);
    uMaxY = Math.max(uMaxY, 0.02);
  }

  const maxScaleTop = uMinY < -0.01 ? (groundY - topClearance) / -uMinY : baseScale;
  const maxScaleBot = uMaxY > 0.01 ? (bottomLimit - groundY) / uMaxY : baseScale;
  const uSpanX = Math.max(0.01, uMaxX - uMinX);
  const maxScaleWidth = 388 / uSpanX;
  const scale = clamp(Math.min(baseScale, maxScaleTop, maxScaleBot, maxScaleWidth), 68, baseScale);

  const originX = 210;
  const sF = scale / 128;

  const head = projectPoint(poseState.head, mode, scale, groundY, originX);
  const neck = projectPoint(poseState.neck, mode, scale, groundY, originX);
  const chest = projectPoint(poseState.chestCenter, mode, scale, groundY, originX);
  const lumbarMid = projectPoint(poseState.lumbarMid, mode, scale, groundY, originX);
  const pelvis = projectPoint(poseState.pelvis, mode, scale, groundY, originX);

  const sL = projectPoint(poseState.shoulderL, mode, scale, groundY, originX);
  const eL = projectPoint(poseState.elbowL, mode, scale, groundY, originX);
  const wL = projectPoint(poseState.wristL, mode, scale, groundY, originX);

  const sR = projectPoint(poseState.shoulderR, mode, scale, groundY, originX);
  const eR = projectPoint(poseState.elbowR, mode, scale, groundY, originX);
  const wR = projectPoint(poseState.wristR, mode, scale, groundY, originX);

  const hL = projectPoint(poseState.hipL, mode, scale, groundY, originX);
  const kL = projectPoint(poseState.kneeL, mode, scale, groundY, originX);
  const aL = projectPoint(poseState.ankleL, mode, scale, groundY, originX);

  const hR = projectPoint(poseState.hipR, mode, scale, groundY, originX);
  const kR = projectPoint(poseState.kneeR, mode, scale, groundY, originX);
  const aR = projectPoint(poseState.ankleR, mode, scale, groundY, originX);

  const paddedMinX = originX + uMinX * scale;
  const paddedMaxX = originX + uMaxX * scale;
  const shiftX = 210 - (paddedMinX + paddedMaxX) * 0.5;

  const fwdProj = projectPoint(poseState.pelvis.clone().add(poseState.torsoForward), mode, scale, groundY, originX);
  const chestFwd2D: Pt2 = { x: fwdProj.x - pelvis.x, y: fwdProj.y - pelvis.y, depth: fwdProj.depth - pelvis.depth };
  const facingSign = chestFwd2D.x >= 0 ? 1 : -1;

  // Ordenação 3D real por profundidade Z da câmera
  const leftLegFront = (hL.depth + kL.depth + aL.depth) / 3 >= (hR.depth + kR.depth + aR.depth) / 3;
  const leftArmFront = (sL.depth + eL.depth * 1.4 + wL.depth * 1.6) >= (sR.depth + eR.depth * 1.4 + wR.depth * 1.6);

  const fHip = leftLegFront ? hL : hR;
  const fKnee = leftLegFront ? kL : kR;
  const fAnkle = leftLegFront ? aL : aR;
  const fFootDir = leftLegFront ? poseState.footDirL : poseState.footDirR;
  const fAnkleWorldY = leftLegFront ? poseState.ankleL.y : poseState.ankleR.y;
  const fAnkleWorld = leftLegFront ? poseState.ankleL : poseState.ankleR;

  const bHip = leftLegFront ? hR : hL;
  const bKnee = leftLegFront ? kR : kL;
  const bAnkle = leftLegFront ? aR : aL;
  const bFootDir = leftLegFront ? poseState.footDirR : poseState.footDirL;
  const bAnkleWorldY = leftLegFront ? poseState.ankleR.y : poseState.ankleL.y;
  const bAnkleWorld = leftLegFront ? poseState.ankleR : poseState.ankleL;

  const fSh = leftArmFront ? sL : sR;
  const fEl = leftArmFront ? eL : eR;
  const fWr = leftArmFront ? wL : wR;

  const bSh = leftArmFront ? sR : sL;
  const bEl = leftArmFront ? eR : eL;
  const bWr = leftArmFront ? wR : wL;

  const legFwdHintX = mode === 'front' ? (bHip.x >= pelvis.x ? 1 : -1) : chestFwd2D.x;
  const legFwdHintY = mode === 'front' ? 0 : chestFwd2D.y;
  const bHipHintX = mode === 'front' ? (bHip.x - pelvis.x || -1) : legFwdHintX;
  const fHipHintX = mode === 'front' ? (fHip.x - pelvis.x || 1) : legFwdHintX;

  const legRootPull = mode === 'front' ? 0.12 : 0.34;
  const bHipRoot: Pt2 = {
    x: bHip.x + (pelvis.x - bHip.x) * legRootPull,
    y: bHip.y + (pelvis.y - bHip.y) * legRootPull,
    depth: bHip.depth,
  };
  const fHipRoot: Pt2 = {
    x: fHip.x + (pelvis.x - fHip.x) * legRootPull,
    y: fHip.y + (pelvis.y - fHip.y) * legRootPull,
    depth: fHip.depth,
  };

  const isFrontView = mode === 'front';
  const backLeg = buildAnatomicalLimb(bHipRoot, bKnee, bAnkle, {
    limbKind: 'leg',
    rRoot: (isFrontView ? 10.6 : 11.4) * sF,
    rUpperStartA: (isFrontView ? 11.4 : 12.2) * sF,
    rUpperStartP: (isFrontView ? 11.0 : 11.4) * sF,
    rUpperMidA: (isFrontView ? 10.4 : 10.8) * sF,
    rUpperMidP: (isFrontView ? 9.6 : 9.8) * sF,
    rJointOuter: (isFrontView ? 7.1 : 7.2) * sF,
    rJointInner: (isFrontView ? 6.7 : 6.8) * sF,
    rLowerBellyA: (isFrontView ? 7.6 : 5.8) * sF,
    rLowerBellyP: (isFrontView ? 7.8 : 8.8) * sF,
    rLowerTaperA: (isFrontView ? 4.9 : 4.6) * sF,
    rLowerTaperP: (isFrontView ? 5.0 : 4.8) * sF,
    rEnd: (isFrontView ? 4.2 : 3.9) * sF,
    anteriorHintX: bHipHintX,
    anteriorHintY: legFwdHintY,
  });

  const frontLeg = buildAnatomicalLimb(fHipRoot, fKnee, fAnkle, {
    limbKind: 'leg',
    rRoot: (isFrontView ? 10.6 : 11.6) * sF,
    rUpperStartA: (isFrontView ? 11.4 : 12.4) * sF,
    rUpperStartP: (isFrontView ? 11.0 : 11.6) * sF,
    rUpperMidA: (isFrontView ? 10.4 : 11.0) * sF,
    rUpperMidP: (isFrontView ? 9.6 : 10.0) * sF,
    rJointOuter: (isFrontView ? 7.1 : 7.4) * sF,
    rJointInner: (isFrontView ? 6.7 : 7.0) * sF,
    rLowerBellyA: (isFrontView ? 7.6 : 6.0) * sF,
    rLowerBellyP: (isFrontView ? 7.8 : 9.0) * sF,
    rLowerTaperA: (isFrontView ? 4.9 : 4.7) * sF,
    rLowerTaperP: (isFrontView ? 5.0 : 4.9) * sF,
    rEnd: (isFrontView ? 4.2 : 4.0) * sF,
    anteriorHintX: fHipHintX,
    anteriorHintY: legFwdHintY,
  });

  const backShorts = buildShortsLegPath(bHipRoot, bKnee, (isFrontView ? 10.6 : 11.4) * sF, (isFrontView ? 7.1 : 7.2) * sF, sF);
  const frontShorts = buildShortsLegPath(fHipRoot, fKnee, (isFrontView ? 10.6 : 11.6) * sF, (isFrontView ? 7.1 : 7.4) * sF, sF);

  const armRootR = (isFrontView ? 7.0 : 7.4) * sF;
  const backArm = buildAnatomicalLimb(bSh, bEl, bWr, {
    limbKind: 'arm',
    rRoot: armRootR,
    rUpperStartA: (isFrontView ? 8.3 : 8.5) * sF,
    rUpperStartP: (isFrontView ? 8.2 : 8.1) * sF,
    rUpperMidA: (isFrontView ? 7.3 : 7.6) * sF,
    rUpperMidP: (isFrontView ? 6.8 : 7.0) * sF,
    rJointOuter: (isFrontView ? 5.2 : 5.5) * sF,
    rJointInner: (isFrontView ? 4.8 : 5.1) * sF,
    rLowerBellyA: (isFrontView ? 6.2 : 6.4) * sF,
    rLowerBellyP: (isFrontView ? 5.6 : 5.8) * sF,
    rLowerTaperA: 4.1 * sF,
    rLowerTaperP: 3.9 * sF,
    rEnd: 3.3 * sF,
    anteriorHintX: chestFwd2D.x,
    anteriorHintY: chestFwd2D.y,
  });

  const frontArm = buildAnatomicalLimb(fSh, fEl, fWr, {
    limbKind: 'arm',
    rRoot: armRootR + 0.2 * sF,
    rUpperStartA: (isFrontView ? 8.5 : 8.7) * sF,
    rUpperStartP: (isFrontView ? 8.4 : 8.3) * sF,
    rUpperMidA: (isFrontView ? 7.5 : 7.8) * sF,
    rUpperMidP: (isFrontView ? 7.0 : 7.2) * sF,
    rJointOuter: (isFrontView ? 5.4 : 5.7) * sF,
    rJointInner: (isFrontView ? 5.0 : 5.3) * sF,
    rLowerBellyA: (isFrontView ? 6.4 : 6.6) * sF,
    rLowerBellyP: (isFrontView ? 5.8 : 6.0) * sF,
    rLowerTaperA: 4.2 * sF,
    rLowerTaperP: 4.0 * sF,
    rEnd: 3.4 * sF,
    anteriorHintX: chestFwd2D.x,
    anteriorHintY: chestFwd2D.y,
  });

  const isDumbbell = poseState.prop === 'dumbbells';
  const fWrWorldY = leftArmFront ? poseState.wristL.y : poseState.wristR.y;
  const bWrWorldY = leftArmFront ? poseState.wristR.y : poseState.wristL.y;
  const backHandPath = buildSculptedHandPath(bEl, bWr, sF, facingSign, { isFloor, wristWorldY: bWrWorldY, isDumbbell });
  const frontHandPath = buildSculptedHandPath(fEl, fWr, sF, facingSign, { isFloor, wristWorldY: fWrWorldY, isDumbbell });

  const bFootTipProj = projectPoint(bAnkleWorld.clone().add(bFootDir), mode, scale, groundY, originX);
  const backShoes = buildAthleticShoePaths(bAnkle, bFootTipProj.x - bAnkle.x, bFootTipProj.y - bAnkle.y, sF, {
    groundY,
    isFloor,
    mode,
    facingSign,
    worldAnkleY: bAnkleWorldY,
    isLeft: !leftLegFront,
  });

  const fFootTipProj = projectPoint(fAnkleWorld.clone().add(fFootDir), mode, scale, groundY, originX);
  const frontShoes = buildAthleticShoePaths(fAnkle, fFootTipProj.x - fAnkle.x, fFootTipProj.y - fAnkle.y, sF, {
    groundY,
    isFloor,
    mode,
    facingSign,
    worldAnkleY: fAnkleWorldY,
    isLeft: leftLegFront,
  });

  const torso = buildUnifiedTorsoPaths(pelvis, lumbarMid, chest, neck, chestFwd2D, hL, hR, sL, sR, mode, sF);

  // Pescoço atlético largo e definido ligando trapézio/clavícula até a base do crânio
  const nx = head.x - neck.x;
  const ny = head.y - neck.y;
  const nLen = Math.hypot(nx, ny) || 1;
  const nux = nx / nLen;
  const nuy = ny / nLen;
  const pnx = -nuy;
  const pny = nux;
  const neckBaseR = 5.6 * sF;
  const neckTopR = 4.6 * sF;
  const neckPath =
    `M ${f(neck.x - nux * 5.0 * sF + pnx * neckBaseR)} ${f(neck.y - nuy * 5.0 * sF + pny * neckBaseR)} ` +
    `Q ${f(neck.x + nx * 0.45 + pnx * (neckTopR * 0.96))} ${f(neck.y + ny * 0.45 + pny * (neckTopR * 0.96))} ${f(head.x + nux * 3.8 * sF + pnx * neckTopR)} ${f(head.y + nuy * 3.8 * sF + pny * neckTopR)} ` +
    `L ${f(head.x + nux * 3.8 * sF - pnx * neckTopR)} ${f(head.y + nuy * 3.8 * sF - pny * neckTopR)} ` +
    `Q ${f(neck.x + nx * 0.45 - pnx * (neckTopR * 0.96))} ${f(neck.y + ny * 0.45 - pny * (neckTopR * 0.96))} ${f(neck.x - nux * 5.0 * sF - pnx * neckBaseR)} ${f(neck.y - nuy * 5.0 * sF - pny * neckBaseR)} Z`;

  const w = 0.5 - 0.5 * Math.cos(cycle * Math.PI * 2);
  const s = Math.sin(cycle * Math.PI * 2);
  const arrow = getMotionArrow(spec.archetype, w, s, {
    head,
    chest,
    pelvis,
    fKnee,
    fAnkle,
    fSh,
    fWr,
  });

  const kneeRingCx = (kL.x + kR.x) * 0.5;
  const kneeRingCy = (kL.y + kR.y) * 0.5 + 3 * sF;
  const showKneeRing = spec.archetype === 'knee_circles';

  // Matriz ORTONORMAL garantida para a cabeça (zero cisalhamento em qualquer ângulo 3D)
  const headUpProj = projectPoint(poseState.head.clone().add(poseState.headUp), mode, scale, groundY, originX);
  const headFwdProj = projectPoint(poseState.head.clone().add(poseState.headForward), mode, scale, groundY, originX);
  let huX = headUpProj.x - head.x;
  let huY = headUpProj.y - head.y;
  let huLen = Math.hypot(huX, huY);
  if (huLen < 0.5) {
    huX = nux;
    huY = nuy;
    huLen = 1;
  }
  const uHeadX = huX / huLen;
  const uHeadY = huY / huLen;
  const dHeadX = -uHeadX;
  const dHeadY = -uHeadY;

  const hfX = headFwdProj.x - head.x;
  const hfY = headFwdProj.y - head.y;
  const hfDepth = headFwdProj.depth - head.depth;

  // Vetor perpendicular a headUp no sentido horário -> eixo "para frente" na tela (+X local)
  let rHeadX = -uHeadY;
  let rHeadY = uHeadX;
  const fwdRefX = Math.hypot(hfX, hfY) > 0.2 ? hfX : chestFwd2D.x;
  const fwdRefY = Math.hypot(hfX, hfY) > 0.2 ? hfY : chestFwd2D.y;
  if (rHeadX * fwdRefX + rHeadY * fwdRefY < 0) {
    rHeadX = -rHeadX;
    rHeadY = -rHeadY;
  }

  const useFrontHead = mode === 'front' || (Math.abs(hfDepth) > Math.hypot(hfX, hfY) * 1.45 && spec.archetype === 'russian_twist');

  const rawHeadAngle = (Math.atan2(uHeadX, -uHeadY) * 180) / Math.PI;
  const headTiltDeg =
    useFrontHead && Math.abs(rawHeadAngle) < 28
      ? clamp((nx / Math.max(8, nLen)) * 16, -14, 14)
      : rawHeadAngle;

  // Eleva levemente o centro visual da cabeça ao longo de headUp para encaixe limpo na mandíbula
  const headCx = head.x + uHeadX * 1.2 * sF;
  const headCy = head.y + uHeadY * 1.2 * sF;

  const headTransform = useFrontHead
    ? `translate(${f(headCx)}, ${f(headCy)}) rotate(${f(headTiltDeg)}) scale(${sF.toFixed(3)}, ${sF.toFixed(3)})`
    : `matrix(${(rHeadX * sF).toFixed(3)} ${(rHeadY * sF).toFixed(3)} ${(dHeadX * sF).toFixed(3)} ${(dHeadY * sF).toFixed(3)} ${f(headCx)} ${f(headCy)})`;

  const anchors: ProjectedAnchors = {
    chest,
    neck,
    pelvis,
    lumbarMid,
    sL,
    sR,
    eL,
    eR,
    wL,
    wR,
    hL,
    hR,
    kL,
    kR,
    aL,
    aR,
    facingSign,
    mode,
  };
  const muscleSpots = computeMuscleSpots(spec.target_zones || [], anchors, scale);
  const effort = 0.35 + 0.65 * Math.sin(Math.PI * cycle);
  const muscleOpacity = 0.25 + 0.6 * effort;

  const strokeWidth = clamp(1.38 * sF, 1.12, 1.65);
  const strokeWidthFine = clamp(0.98 * sF, 0.78, 1.22);

  const backArmInFront =
    (mode === 'front' &&
      (bWr.depth > pelvis.depth + 0.08 ||
        (bSh.depth >= pelvis.depth - 0.06 && bEl.depth >= pelvis.depth - 0.06 && bWr.depth >= pelvis.depth - 0.06))) ||
    (mode !== 'front' && bWr.depth > chest.depth + 0.14 && bEl.depth > chest.depth + 0.02);

  // Em vista frontal simétrica, mantém os dois lados com iluminação igual para parecer natural
  const frontSameSideLighting = mode === 'front' && Math.abs(hL.depth - hR.depth) < 0.10;

  return {
    mode,
    isFloor,
    scale,
    groundY,
    sF,
    shiftX,
    strokeWidth,
    strokeWidthFine,
    anchors,
    muscleSpots,
    muscleOpacity,
    pelvis,
    head,
    neck,
    aL,
    aR,
    fSh,
    bSh,
    bEl,
    bWr,
    fEl,
    fWr,
    facingSign,
    headTiltDeg,
    useFrontHead,
    headTransform,
    backLegPath: backLeg.path,
    backLegCrease: backLeg.creasePath,
    backLegDetail: backLeg.detailPath,
    frontLegPath: frontLeg.path,
    frontLegCrease: frontLeg.creasePath,
    frontLegDetail: frontLeg.detailPath,
    backShortsPath: backShorts.path,
    backShortsHem: backShorts.hemLine,
    frontShortsPath: frontShorts.path,
    frontShortsHem: frontShorts.hemLine,
    backArmPath: backArm.path,
    backArmCrease: backArm.creasePath,
    backArmDetail: backArm.detailPath,
    frontArmPath: frontArm.path,
    frontArmCrease: frontArm.creasePath,
    frontArmDetail: frontArm.detailPath,
    backHandPath,
    frontHandPath,
    backShoes,
    frontShoes,
    torso,
    neckPath,
    arrow,
    showKneeRing,
    kneeRingCx,
    kneeRingCy,
    backArmInFront,
    frontSameSideLighting,
  };
}

export function VectorExerciseDemo({
  exerciseName,
  muscleGroup,
  spec,
  correctPosition,
  playing: externalPlaying,
  onTogglePlaying,
  onSwitchTo3D,
  onOpenSettings,
  showControls = true,
  minimalStage = false,
  frameless = false,
  countdownOverlay = null,
  topLeftSlot,
  bottomRightSlot,
  heightClass = 'h-72 sm:h-80',
  stepCounterLabel,
  onCycleComplete,
  resetSignal,
}: VectorExerciseDemoProps) {
  const [internalPlaying, setInternalPlaying] = useState(true);
  const playing = externalPlaying !== undefined ? externalPlaying : internalPlaying;

  const [speed, setSpeed] = useState<0.5 | 1>(1);
  const [voiceActive, setVoiceActive] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState<0 | 1 | 2>(0);
  const [repCount, setRepCount] = useState(1);

  const specRef = useRef(spec);
  specRef.current = spec;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const onCycleCompleteRef = useRef(onCycleComplete);
  onCycleCompleteRef.current = onCycleComplete;
  const resetCycleRef = useRef(false);

  // Refs SVG diretas para 60fps fluido sem re-render
  const matGroupRef = useRef<SVGGElement | null>(null);
  const benchGroupRef = useRef<SVGGElement | null>(null);
  const floorStripRef = useRef<SVGRectElement | null>(null);
  const floorLineRef = useRef<SVGLineElement | null>(null);
  const spotlightRef = useRef<SVGEllipseElement | null>(null);
  const shadowRef = useRef<SVGEllipseElement | null>(null);
  const kneeRingGroupRef = useRef<SVGGElement | null>(null);
  const athleteRootRef = useRef<SVGGElement | null>(null);
  const muscleGroupRef = useRef<SVGGElement | null>(null);
  const muscleSpotRefs = useRef<Array<SVGEllipseElement | null>>([]);
  const phaseProgressRef = useRef<HTMLDivElement | null>(null);

  const backArmPathRef = useRef<SVGPathElement | null>(null);
  const backArmCreaseRef = useRef<SVGPathElement | null>(null);
  const backArmDetailRef = useRef<SVGPathElement | null>(null);
  const backHandPathRef = useRef<SVGPathElement | null>(null);
  const backDumbbellRef = useRef<SVGGElement | null>(null);

  const backLegPathRef = useRef<SVGPathElement | null>(null);
  const backLegCreaseRef = useRef<SVGPathElement | null>(null);
  const backLegDetailRef = useRef<SVGPathElement | null>(null);
  const backShortsPathRef = useRef<SVGPathElement | null>(null);
  const backShortsHemRef = useRef<SVGPathElement | null>(null);
  const backShoeUpperRef = useRef<SVGPathElement | null>(null);
  const backShoeSoleRef = useRef<SVGPathElement | null>(null);
  const backShoeDetailRef = useRef<SVGPathElement | null>(null);

  const torsoSkinRef = useRef<SVGPathElement | null>(null);
  const torsoBottomsRef = useRef<SVGPathElement | null>(null);
  const torsoWaistbandRef = useRef<SVGPathElement | null>(null);
  const torsoTopRef = useRef<SVGPathElement | null>(null);
  const torsoTopAccentRef = useRef<SVGPathElement | null>(null);
  const torsoCollarTrimRef = useRef<SVGPathElement | null>(null);
  const torsoDetailRef = useRef<SVGPathElement | null>(null);

  const frontLegPathRef = useRef<SVGPathElement | null>(null);
  const frontLegCreaseRef = useRef<SVGPathElement | null>(null);
  const frontLegDetailRef = useRef<SVGPathElement | null>(null);
  const frontShortsPathRef = useRef<SVGPathElement | null>(null);
  const frontShortsHemRef = useRef<SVGPathElement | null>(null);
  const frontShoeUpperRef = useRef<SVGPathElement | null>(null);
  const frontShoeSoleRef = useRef<SVGPathElement | null>(null);
  const frontShoeDetailRef = useRef<SVGPathElement | null>(null);

  const neckPathRef = useRef<SVGPathElement | null>(null);
  const headGroupRef = useRef<SVGGElement | null>(null);
  const headProfileRef = useRef<SVGGElement | null>(null);
  const headFrontRef = useRef<SVGGElement | null>(null);

  const frontArmPathRef = useRef<SVGPathElement | null>(null);
  const frontArmCreaseRef = useRef<SVGPathElement | null>(null);
  const frontArmDetailRef = useRef<SVGPathElement | null>(null);
  const frontHandPathRef = useRef<SVGPathElement | null>(null);
  const backArmAheadPathRef = useRef<SVGPathElement | null>(null);
  const backArmAheadCreaseRef = useRef<SVGPathElement | null>(null);
  const backArmAheadDetailRef = useRef<SVGPathElement | null>(null);
  const backHandAheadPathRef = useRef<SVGPathElement | null>(null);
  const frontDumbbellRef = useRef<SVGGElement | null>(null);
  const clipBackArmRef = useRef<SVGPathElement | null>(null);
  const clipBackLegRef = useRef<SVGPathElement | null>(null);
  const clipTorsoRef = useRef<SVGPathElement | null>(null);
  const clipFrontLegRef = useRef<SVGPathElement | null>(null);
  const clipFrontArmRef = useRef<SVGPathElement | null>(null);

  const arrowPathRef = useRef<SVGPathElement | null>(null);
  const arrowTipRef = useRef<SVGPolygonElement | null>(null);

  useEffect(() => {
    resetCycleRef.current = true;
    setRepCount(1);
    setPhaseIdx(0);
  }, [exerciseName, spec.archetype, resetSignal]);

  useEffect(() => {
    if (!voiceActive || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    window.speechSynthesis.cancel();
    const script = `${exerciseName}. ${correctPosition || spec.preparation}. ${spec.steps[0] || ''}.`;
    const utterance = new SpeechSynthesisUtterance(script);
    utterance.lang = 'pt-BR';
    utterance.rate = speed === 0.5 ? 0.92 : 1.04;
    utterance.onend = () => setVoiceActive(false);
    utterance.onerror = () => setVoiceActive(false);
    window.speechSynthesis.speak(utterance);

    return () => {
      window.speechSynthesis.cancel();
    };
  }, [voiceActive, exerciseName, spec, correctPosition, speed]);

  useEffect(() => {
    const poseState: Pose3DState = createEmptyPose3DState();
    let rafId = 0;
    let lastTime = performance.now();
    let cycle = 0;
    let reps = 1;
    let completedReps = 0;
    let lastShownPhase: 0 | 1 | 2 = 0;
    let disposed = false;

    const setPathAndStroke = (el: SVGPathElement | null, d: string, sw: number) => {
      if (!el) return;
      el.setAttribute('d', d);
      el.setAttribute('stroke-width', sw.toFixed(2));
    };

    const setOptionalPath = (el: SVGPathElement | null, d: string, sw: number) => {
      if (!el) return;
      if (!d) {
        el.setAttribute('visibility', 'hidden');
      } else {
        el.setAttribute('visibility', 'visible');
        el.setAttribute('d', d);
        el.setAttribute('stroke-width', sw.toFixed(2));
      }
    };

    const tick = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.08, (now - lastTime) / 1000);
      lastTime = now;

      if (resetCycleRef.current) {
        cycle = 0;
        reps = 1;
        completedReps = 0;
        resetCycleRef.current = false;
      }

      const curSpec = specRef.current;
      if (playingRef.current) {
        const deltaCycle = (dt * speedRef.current) / Math.max(1.2, curSpec.tempo_seconds);
        const next = cycle + deltaCycle;
        if (next >= 1) {
          const finishedNow = Math.floor(next);
          reps += finishedNow;
          completedReps += finishedNow;
          setRepCount(reps);
          onCycleCompleteRef.current?.(completedReps);
        }
        cycle = next % 1;
      }

      const frame = computeVectorFramePaths(curSpec, cycle, poseState);
      if (poseState.phaseIndex !== lastShownPhase) {
        lastShownPhase = poseState.phaseIndex;
        setPhaseIdx(poseState.phaseIndex);
      }

      if (athleteRootRef.current) {
        athleteRootRef.current.setAttribute('transform', `translate(${f(frame.shiftX)}, 0)`);
      }

      if (phaseProgressRef.current) {
        phaseProgressRef.current.style.width = `${(cycle * 100).toFixed(1)}%`;
      }

      const floorTopY = frame.isFloor ? frame.groundY - 12 : frame.groundY;
      if (floorStripRef.current) {
        floorStripRef.current.setAttribute('y', f(floorTopY));
        floorStripRef.current.setAttribute('height', f(286 - floorTopY));
      }
      if (floorLineRef.current) {
        floorLineRef.current.setAttribute('y1', f(floorTopY));
        floorLineRef.current.setAttribute('y2', f(floorTopY));
      }
      if (spotlightRef.current) {
        spotlightRef.current.setAttribute('cx', f(frame.pelvis.x + frame.shiftX));
        spotlightRef.current.setAttribute('cy', f(frame.isFloor ? frame.groundY - 56 : frame.groundY - 102));
      }

      const showMat = poseState.prop === 'mat' || curSpec.archetype === 'renegade_row';
      if (matGroupRef.current) {
        if (showMat) {
          matGroupRef.current.setAttribute('visibility', 'visible');
          matGroupRef.current.setAttribute('transform', `translate(0, ${f(frame.groundY)})`);
        } else {
          matGroupRef.current.setAttribute('visibility', 'hidden');
        }
      }

      if (benchGroupRef.current) {
        if (poseState.prop === 'bench' || poseState.prop === 'chair_back') {
          const benchPt = projectPoint(poseState.propPosition, frame.mode, frame.scale, frame.groundY, 210);
          const bx = benchPt.x + frame.shiftX;
          const byTop = frame.groundY - 0.48 * frame.scale;
          benchGroupRef.current.setAttribute('visibility', 'visible');
          benchGroupRef.current.setAttribute(
            'transform',
            `translate(${f(bx)}, ${f(byTop)}) scale(${frame.sF.toFixed(3)})`
          );
        } else {
          benchGroupRef.current.setAttribute('visibility', 'hidden');
        }
      }

      if (shadowRef.current) {
        if (showMat) {
          shadowRef.current.setAttribute('visibility', 'hidden');
        } else {
          const spanFeet = Math.abs(frame.aL.x - frame.aR.x);
          shadowRef.current.setAttribute('visibility', 'visible');
          shadowRef.current.setAttribute('cx', f(frame.pelvis.x + frame.shiftX));
          shadowRef.current.setAttribute('cy', String(frame.groundY + 7));
          shadowRef.current.setAttribute('rx', f(Math.max(44, spanFeet * 0.55 + 24)));
        }
      }

      if (muscleGroupRef.current) {
        muscleGroupRef.current.setAttribute('opacity', frame.muscleOpacity.toFixed(3));
        for (let i = 0; i < 10; i++) {
          const el = muscleSpotRefs.current[i];
          if (!el) continue;
          const spot = frame.muscleSpots[i];
          if (!spot) {
            el.setAttribute('visibility', 'hidden');
          } else {
            el.setAttribute('visibility', 'visible');
            el.setAttribute('cx', f(spot.x));
            el.setAttribute('cy', f(spot.y));
            el.setAttribute('rx', f(spot.rx));
            el.setAttribute('ry', f(spot.ry));
            el.setAttribute('transform', `rotate(${f(spot.rot)} ${f(spot.x)} ${f(spot.y)})`);
          }
        }
      }

      const sw = frame.strokeWidth;
      const swFine = frame.strokeWidthFine;

      // Membros & Roupas
      if (backArmPathRef.current && backHandPathRef.current && backArmAheadPathRef.current && backHandAheadPathRef.current) {
        if (frame.backArmInFront) {
          backArmPathRef.current.setAttribute('visibility', 'hidden');
          backArmCreaseRef.current?.setAttribute('visibility', 'hidden');
          backArmDetailRef.current?.setAttribute('visibility', 'hidden');
          backHandPathRef.current.setAttribute('visibility', 'hidden');
          backArmAheadPathRef.current.setAttribute('visibility', 'visible');
          backHandAheadPathRef.current.setAttribute('visibility', 'visible');
          setPathAndStroke(backArmAheadPathRef.current, frame.backArmPath, sw);
          setOptionalPath(backArmAheadCreaseRef.current, frame.backArmCrease, swFine);
          setOptionalPath(backArmAheadDetailRef.current, frame.backArmDetail, swFine * 0.88);
          setPathAndStroke(backHandAheadPathRef.current, frame.backHandPath, swFine);
        } else {
          backArmAheadPathRef.current.setAttribute('visibility', 'hidden');
          backArmAheadCreaseRef.current?.setAttribute('visibility', 'hidden');
          backArmAheadDetailRef.current?.setAttribute('visibility', 'hidden');
          backHandAheadPathRef.current.setAttribute('visibility', 'hidden');
          backArmPathRef.current.setAttribute('visibility', 'visible');
          backHandPathRef.current.setAttribute('visibility', 'visible');
          setPathAndStroke(backArmPathRef.current, frame.backArmPath, sw);
          setOptionalPath(backArmCreaseRef.current, frame.backArmCrease, swFine);
          setOptionalPath(backArmDetailRef.current, frame.backArmDetail, swFine * 0.88);
          setPathAndStroke(backHandPathRef.current, frame.backHandPath, swFine);
        }
      }

      setPathAndStroke(backLegPathRef.current, frame.backLegPath, sw);
      backLegPathRef.current?.setAttribute('fill', frame.frontSameSideLighting ? '#EEBE9A' : '#DFAC87');
      setOptionalPath(backLegCreaseRef.current, frame.backLegCrease, swFine);
      setOptionalPath(backLegDetailRef.current, frame.backLegDetail, swFine * 0.88);
      setPathAndStroke(backShortsPathRef.current, frame.backShortsPath, sw);
      backShortsPathRef.current?.setAttribute('fill', frame.frontSameSideLighting ? '#1D232E' : '#141922');
      setOptionalPath(backShortsHemRef.current, frame.backShortsHem, swFine);
      setPathAndStroke(backShoeSoleRef.current, frame.backShoes.solePath, swFine);
      setPathAndStroke(backShoeUpperRef.current, frame.backShoes.upperPath, sw);
      backShoeUpperRef.current?.setAttribute('fill', frame.frontSameSideLighting ? '#2C3542' : '#252D38');
      setOptionalPath(backShoeDetailRef.current, frame.backShoes.detailPath, swFine);

      setPathAndStroke(torsoSkinRef.current, frame.torso.skinBody, sw);
      setPathAndStroke(torsoBottomsRef.current, frame.torso.bottomsGarment, sw);
      torsoWaistbandRef.current?.setAttribute('d', frame.torso.waistbandPath);
      setPathAndStroke(torsoTopRef.current, frame.torso.topGarment, sw);
      setOptionalPath(torsoCollarTrimRef.current, frame.torso.topCollarTrim, swFine);
      setOptionalPath(torsoDetailRef.current, frame.torso.topDetailPath, swFine * 0.9);
      if (torsoTopAccentRef.current) {
        if (frame.torso.topStrapAccent) {
          torsoTopAccentRef.current.setAttribute('visibility', 'visible');
          torsoTopAccentRef.current.setAttribute('d', frame.torso.topStrapAccent);
        } else {
          torsoTopAccentRef.current.setAttribute('visibility', 'hidden');
        }
      }

      setPathAndStroke(frontLegPathRef.current, frame.frontLegPath, sw);
      setOptionalPath(frontLegCreaseRef.current, frame.frontLegCrease, swFine);
      setOptionalPath(frontLegDetailRef.current, frame.frontLegDetail, swFine * 0.88);
      setPathAndStroke(frontShortsPathRef.current, frame.frontShortsPath, sw);
      setOptionalPath(frontShortsHemRef.current, frame.frontShortsHem, swFine);
      setPathAndStroke(frontShoeSoleRef.current, frame.frontShoes.solePath, swFine);
      setPathAndStroke(frontShoeUpperRef.current, frame.frontShoes.upperPath, sw);
      setOptionalPath(frontShoeDetailRef.current, frame.frontShoes.detailPath, swFine);

      setPathAndStroke(frontArmPathRef.current, frame.frontArmPath, sw);
      setOptionalPath(frontArmCreaseRef.current, frame.frontArmCrease, swFine);
      setOptionalPath(frontArmDetailRef.current, frame.frontArmDetail, swFine * 0.88);
      setPathAndStroke(frontHandPathRef.current, frame.frontHandPath, swFine);

      clipBackArmRef.current?.setAttribute('d', frame.backArmPath);
      clipBackLegRef.current?.setAttribute('d', frame.backLegPath);
      clipTorsoRef.current?.setAttribute('d', frame.torso.skinBody);
      clipFrontLegRef.current?.setAttribute('d', frame.frontLegPath);
      clipFrontArmRef.current?.setAttribute('d', frame.frontArmPath);

      if (kneeRingGroupRef.current) {
        if (frame.showKneeRing) {
          kneeRingGroupRef.current.setAttribute('visibility', 'visible');
          kneeRingGroupRef.current.setAttribute(
            'transform',
            `translate(${f(frame.kneeRingCx)}, ${f(frame.kneeRingCy)}) scale(${frame.sF.toFixed(3)})`
          );
        } else {
          kneeRingGroupRef.current.setAttribute('visibility', 'hidden');
        }
      }

      // Halteres
      const showDb = poseState.prop === 'dumbbells';
      [
        { ref: backDumbbellRef.current, wr: frame.bWr, el: frame.bEl },
        { ref: frontDumbbellRef.current, wr: frame.fWr, el: frame.fEl },
      ].forEach(({ ref, wr, el }) => {
        if (!ref) return;
        if (!showDb) {
          ref.setAttribute('visibility', 'hidden');
          return;
        }
        const ang = (Math.atan2(wr.y - el.y, wr.x - el.x) * 180) / Math.PI;
        ref.setAttribute('visibility', 'visible');
        ref.setAttribute('transform', `translate(${f(wr.x)}, ${f(wr.y)}) rotate(${f(ang + 90)})`);
      });

      // Pescoço & Cabeça humana 2D limpa
      setPathAndStroke(neckPathRef.current, frame.neckPath, sw);
      if (headGroupRef.current) {
        headGroupRef.current.setAttribute('transform', frame.headTransform);
        headProfileRef.current?.setAttribute('visibility', frame.useFrontHead ? 'hidden' : 'visible');
        headFrontRef.current?.setAttribute('visibility', frame.useFrontHead ? 'visible' : 'hidden');
      }

      // Seta guia suave
      if (arrowPathRef.current && arrowTipRef.current) {
        if (frame.arrow && !minimalStage) {
          arrowPathRef.current.setAttribute('visibility', 'visible');
          arrowTipRef.current.setAttribute('visibility', 'visible');
          arrowPathRef.current.setAttribute('d', frame.arrow.path);
          arrowTipRef.current.setAttribute(
            'transform',
            `translate(${f(frame.arrow.tipX)}, ${f(frame.arrow.tipY)}) rotate(${f(frame.arrow.tipAngle)})`
          );
        } else {
          arrowPathRef.current.setAttribute('visibility', 'hidden');
          arrowTipRef.current.setAttribute('visibility', 'hidden');
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
    };
  }, [minimalStage]);

  const handleTogglePlay = () => {
    if (onTogglePlaying) {
      onTogglePlaying();
    } else {
      setInternalPlaying((p) => !p);
    }
  };

  const coachTip = useMemo(() => {
    return correctPosition || spec.preparation || spec.steps[0] || 'Mantenha a postura firme e a respiração controlada.';
  }, [correctPosition, spec.preparation, spec.steps]);

  const translatedZones = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of spec.target_zones || []) {
      const key = normalizeMuscleZone(raw);
      const label = MUSCLE_ZONE_LABELS[key];
      if (label && !seen.has(label)) {
        seen.add(label);
        out.push(label);
        if (out.length >= 2) break;
      }
    }
    return out;
  }, [spec.target_zones]);

  const isFullHeight = frameless || heightClass === 'h-full';

  return (
    <div
      className={
        isFullHeight
          ? 'flex h-full min-h-0 flex-col overflow-hidden bg-[#FBFDFC]'
          : 'overflow-hidden rounded-2xl border border-[#DCECE6] bg-white shadow-sm'
      }
    >
      {/* Palco claro estilo estúdio */}
      <div className={`relative flex min-h-0 w-full flex-col bg-[#FBFDFC] ${heightClass}`}>
        {topLeftSlot && (
          <div className="absolute left-3.5 top-3 z-20">{topLeftSlot}</div>
        )}
        {bottomRightSlot && (
          <div className="absolute bottom-3 right-3.5 z-20">{bottomRightSlot}</div>
        )}

        {!minimalStage && !topLeftSlot && (
          <div className="pointer-events-none absolute left-3.5 top-2.5 z-10 flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold leading-tight text-[#18242E] tabular-nums">
              <span>{stepCounterLabel || `Rep ${repCount}`}</span>
              <span aria-hidden="true" className="text-[#8B95A1]">
                ·
              </span>
              <span className="text-[#008F84]">{spec.phase_labels[phaseIdx] || spec.phase_labels[0]}</span>
            </div>
            <span className="text-[11px] font-medium leading-tight text-[#5A6572]">{muscleGroup}</span>
            {translatedZones.length > 0 && (
              <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
                {translatedZones.map((label) => (
                  <span key={label} className="inline-flex items-center gap-1 text-[10px] font-medium leading-none text-[#45534D]">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#FF4D2E]" />
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Botões circulares top-right limpos (3D / Áudio / Opções) */}
        <div className="absolute right-3.5 top-3 z-20 flex items-center gap-2">
          {onSwitchTo3D && (
            <button
              type="button"
              onClick={onSwitchTo3D}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E6E9EE]/90 text-[#4F5864] transition-colors hover:bg-[#DCE0E7]"
              title="Ver modelo 3D interativo"
              aria-label="Ver modelo 3D interativo"
            >
              <Camera className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setVoiceActive((v) => !v)}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
              voiceActive
                ? 'bg-[#00A89B] text-white shadow-sm'
                : 'bg-[#E6E9EE]/90 text-[#4F5864] hover:bg-[#DCE0E7]'
            }`}
            title={voiceActive ? 'Silenciar instrução por voz' : 'Ouvir instrução por voz'}
            aria-label={voiceActive ? 'Silenciar instrução por voz' : 'Ouvir instrução por voz'}
          >
            {voiceActive ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E6E9EE]/90 text-[#4F5864] transition-colors hover:bg-[#DCE0E7]"
              title="Opções e guia do exercício"
              aria-label="Opções e guia do exercício"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Contagem regressiva 3-2-1 centralizada sobre o palco */}
        {countdownOverlay !== null && countdownOverlay !== undefined && countdownOverlay > 0 && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span
              key={countdownOverlay}
              className="select-none font-mono text-7xl font-extrabold text-[#009E92]/80 drop-shadow-[0_4px_18px_rgba(247,248,250,0.95)] tabular-nums sm:text-8xl"
            >
              {countdownOverlay}
            </span>
          </div>
        )}

        <svg
          viewBox="0 0 420 285"
          className="min-h-0 w-full flex-1 select-none"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Demonstração animada de ${exerciseName}`}
        >
          <defs>
            <linearGradient id="studioWallGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FBFDFC" />
              <stop offset="56%" stopColor="#F1F7F3" />
              <stop offset="100%" stopColor="#E3EEE7" />
            </linearGradient>

            <linearGradient id="studioFloorGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#DCE8E1" />
              <stop offset="100%" stopColor="#C8DBD0" />
            </linearGradient>

            <radialGradient id="studioSpotlightGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.96" />
              <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.52" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </radialGradient>

            <radialGradient id="muscleHotspotGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FF4D2E" stopOpacity="0.78" />
              <stop offset="55%" stopColor="#FF5F2E" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#FF4D2E" stopOpacity="0" />
            </radialGradient>

            <filter id="groundShadowBlur" x="-30%" y="-80%" width="160%" height="260%">
              <feGaussianBlur stdDeviation="3.5" />
            </filter>

            <clipPath id="athleteBodyClip">
              <path ref={clipBackArmRef} />
              <path ref={clipBackLegRef} />
              <path ref={clipTorsoRef} />
              <path ref={clipFrontLegRef} />
              <path ref={clipFrontArmRef} />
            </clipPath>
          </defs>

          <rect width="420" height="285" fill="url(#studioWallGrad)" />

          {/* Spotlight branco atrás do atleta */}
          <ellipse ref={spotlightRef} cx="210" cy="146" rx="164" ry="118" fill="url(#studioSpotlightGrad)" />

          {/* Faixa de piso em degradê abaixo da linha do chão */}
          <rect ref={floorStripRef} x="0" y="254" width="420" height="31" fill="url(#studioFloorGrad)" />
          <line ref={floorLineRef} x1="0" x2="420" y1="254" y2="254" stroke="#CBDAD1" strokeWidth="1" />

          {/* Sombra suave de contato no piso com blur gaussiano */}
          <ellipse
            ref={shadowRef}
            cx="210"
            cy="261"
            rx="52"
            ry="6.5"
            fill="#98B0A3"
            opacity="0.48"
            filter="url(#groundShadowBlur)"
          />

          {/* Colchonete em perspectiva suave para exercícios no chão */}
          <g ref={matGroupRef} visibility="hidden" transform="translate(0, 236)">
            <polygon points="48,-22 346,-22 374,24 76,24" fill="#CBEFF5" stroke="#9CD4DF" strokeWidth="1" strokeLinejoin="round" />
            <polygon points="76,24 374,24 374,28 76,28" fill="#A8DCE7" />
          </g>

          {/* Banco / Apoio */}
          <g ref={benchGroupRef} visibility="hidden">
            <rect x="-34" y="0" width="68" height="9" rx="4" fill="#1E2530" />
            <rect x="-26" y="9" width="6.5" height="54" rx="2" fill="#6B7480" />
            <rect x="19.5" y="9" width="6.5" height="54" rx="2" fill="#6B7480" />
          </g>

          {/* Atleta humano 2D em ilustração vetorial estúdio com cinemática 3D */}
          <g ref={athleteRootRef} strokeLinejoin="round" strokeLinecap="round">
            {/* 1. Braço de trás */}
            <path ref={backArmPathRef} fill="#DFAC87" stroke="#1D242E" />
            <path ref={backArmCreaseRef} fill="none" stroke="#B77E5B" visibility="hidden" />
            <path ref={backArmDetailRef} fill="none" stroke="#A67050" visibility="hidden" />
            <path ref={backHandPathRef} fill="#DFAC87" stroke="#1D242E" />
            <g ref={backDumbbellRef} visibility="hidden">
              <rect x="-2.5" y="-12" width="5" height="24" rx="2" fill="#525A65" stroke="#1D242E" strokeWidth="0.9" />
              <rect x="-7.5" y="-15" width="15" height="6.5" rx="2" fill="#2A313C" stroke="#181D24" strokeWidth="0.9" />
              <rect x="-7.5" y="8.5" width="15" height="6.5" rx="2" fill="#2A313C" stroke="#181D24" strokeWidth="0.9" />
            </g>

            {/* 2. Perna de trás + Shorts traseiro + Tênis traseiro */}
            <path ref={backLegPathRef} fill="#DFAC87" stroke="#1D242E" />
            <path ref={backLegCreaseRef} fill="none" stroke="#B77E5B" visibility="hidden" />
            <path ref={backLegDetailRef} fill="none" stroke="#A67050" visibility="hidden" />
            <path ref={backShortsPathRef} fill="#141922" stroke="#1D242E" />
            <path ref={backShortsHemRef} fill="none" stroke="#2E3747" visibility="hidden" />
            <path ref={backShoeSoleRef} fill="#E4E9EF" stroke="#1D242E" />
            <path ref={backShoeUpperRef} fill="#252D38" stroke="#171C23" />
            <path ref={backShoeDetailRef} fill="none" stroke="#5E6B7D" visibility="hidden" />

            {/* 3. Tronco + Perna da frente + Shorts + Regata azul */}
            <path ref={torsoSkinRef} fill="#EEBE9A" stroke="#1D242E" />
            <path ref={frontLegPathRef} fill="#EEBE9A" stroke="#1D242E" />
            <path ref={frontLegCreaseRef} fill="none" stroke="#C58E6B" visibility="hidden" />
            <path ref={frontLegDetailRef} fill="none" stroke="#AC7555" visibility="hidden" />
            <path ref={torsoBottomsRef} fill="#1D232E" stroke="#12161D" />
            <path ref={frontShortsPathRef} fill="#1D232E" stroke="#12161D" />
            <path ref={frontShortsHemRef} fill="none" stroke="#313A4A" visibility="hidden" />
            <path ref={torsoWaistbandRef} fill="#2B3342" />
            <path ref={torsoTopRef} fill="#2B7AD9" stroke="#163F7A" />
            <path ref={torsoTopAccentRef} fill="#1E62B8" />
            <path ref={torsoDetailRef} fill="none" stroke="#164688" strokeOpacity="0.62" visibility="hidden" />
            <path ref={torsoCollarTrimRef} fill="none" stroke="#163F7A" visibility="hidden" />

            {/* 4. Tênis da frente */}
            <path ref={frontShoeSoleRef} fill="#F4F7FA" stroke="#1D242E" />
            <path ref={frontShoeUpperRef} fill="#2C3542" stroke="#171C23" />
            <path ref={frontShoeDetailRef} fill="none" stroke="#6E7D91" visibility="hidden" />

            {/* 5. Pescoço + Cabeça humana atlética 2D */}
            <path ref={neckPathRef} fill="#E3B18C" stroke="#1D242E" />
            <g ref={headGroupRef}>
              {/* Cabeça perfil / 3/4 voltada para +X */}
              <g ref={headProfileRef}>
                <path
                  d="M -4.2 -1.6 C -5.8 -1.8, -6.2 1.8, -4.4 2.4 C -3.6 2.6, -3.0 1.4, -3.2 0.2 Z"
                  fill="#DDA580"
                  stroke="#1D242E"
                  strokeWidth="0.95"
                />
                <path
                  d="M -6.4 7.8 C -8.6 4.6, -9.6 0.2, -9.0 -4.8 C -8.2 -11.4, -2.0 -14.6, 4.4 -13.4 C 7.6 -12.8, 9.2 -9.4, 9.5 -5.8 C 9.7 -4.2, 10.6 -2.5, 11.4 -0.9 C 11.8 -0.2, 11.4 0.7, 10.4 1.1 C 9.9 1.3, 9.8 1.9, 10.0 2.7 C 10.2 3.5, 9.8 4.1, 9.5 4.7 C 9.6 5.6, 9.4 6.6, 8.9 7.8 C 8.2 9.4, 6.2 10.4, 3.2 10.3 C 0.2 10.2, -3.4 9.6, -6.4 7.8 Z"
                  fill="#EEBE9A"
                  stroke="#1D242E"
                  strokeWidth="1.1"
                />
                <path d="M -4.2 7.0 Q 1.6 8.6 6.8 8.2" fill="none" stroke="#CFA07E" strokeWidth="0.9" />
                <path d="M 5.2 -5.4 Q 7.4 -6.0 9.1 -5.2" fill="none" stroke="#2D2522" strokeWidth="1.15" />
                <ellipse cx="7.4" cy="-3.5" rx="1.05" ry="0.78" fill="#1D242E" />
                <path d="M 7.8 4.5 L 9.5 4.6" fill="none" stroke="#9C6649" strokeWidth="0.95" />
                <path
                  d="M -9.2 -0.6 C -10.5 -8.8, -5.6 -15.6, 4.0 -15.0 C 7.8 -14.6, 10.2 -12.0, 9.7 -9.2 C 7.6 -10.8, 3.6 -10.5, 0.2 -8.6 C -2.8 -7.0, -3.6 -3.8, -3.8 -1.4 C -4.6 -1.8, -5.8 -0.6, -5.4 1.6 C -6.8 2.4, -8.4 1.4, -9.2 -0.6 Z"
                  fill="#2D2522"
                  stroke="#1B1614"
                  strokeWidth="1.0"
                />
                <path d="M -4.6 -10.8 Q 1.2 -13.4 6.6 -11.6" fill="none" stroke="#4D403A" strokeWidth="0.95" />
                <path
                  d="M -3.5 -1.4 C -4.8 -1.4, -4.8 2.2, -3.2 2.4 C -2.2 2.4, -1.8 1.2, -2.0 0.0"
                  fill="#EEBE9A"
                  stroke="#1D242E"
                  strokeWidth="0.9"
                />
              </g>

              {/* Cabeça frontal atlética (estilo estúdio limpo) */}
              <g ref={headFrontRef} visibility="hidden">
                <ellipse cx="-8.8" cy="-0.4" rx="1.7" ry="2.8" fill="#DDA580" stroke="#1D242E" strokeWidth="0.95" />
                <ellipse cx="8.8" cy="-0.4" rx="1.7" ry="2.8" fill="#DDA580" stroke="#1D242E" strokeWidth="0.95" />
                <path
                  d="M -8.6 -3.6 C -8.8 -12.4, 8.8 -12.4, 8.6 -3.6 C 8.5 2.4, 6.8 6.8, 3.8 9.2 C 1.8 10.8, -1.8 10.8, -3.8 9.2 C -6.8 6.8, -8.5 2.4, -8.6 -3.6 Z"
                  fill="#EEBE9A"
                  stroke="#1D242E"
                  strokeWidth="1.1"
                />
                <path d="M -5.8 -4.4 Q -3.6 -5.3 -1.6 -4.3" fill="none" stroke="#2D2522" strokeWidth="1.15" />
                <path d="M 1.6 -4.3 Q 3.6 -5.3 5.8 -4.4" fill="none" stroke="#2D2522" strokeWidth="1.15" />
                <ellipse cx="-3.6" cy="-2.2" rx="1.0" ry="0.82" fill="#1D242E" />
                <ellipse cx="3.6" cy="-2.2" rx="1.0" ry="0.82" fill="#1D242E" />
                <path d="M -0.8 -1.0 L -0.9 1.3 Q 0 2.1 0.9 1.3" fill="none" stroke="#B78161" strokeWidth="0.9" />
                <path d="M -2.2 4.7 Q 0 5.4 2.2 4.7" fill="none" stroke="#9C6649" strokeWidth="0.95" />
                <path d="M -1.5 6.8 Q 0 7.4 1.5 6.8" fill="none" stroke="#CFA07E" strokeWidth="0.85" />
                <path
                  d="M -9.1 -2.4 C -9.8 -11.6, -5.0 -15.8, 0.2 -15.6 C 5.2 -15.8, 9.8 -11.6, 9.1 -2.4 C 7.8 -6.4, 4.6 -9.0, 0 -9.0 C -4.6 -9.0, -7.8 -6.4, -9.1 -2.4 Z"
                  fill="#2D2522"
                  stroke="#1B1614"
                  strokeWidth="1.0"
                />
                <path d="M -4.2 -11.8 Q 0 -13.6 4.4 -11.8" fill="none" stroke="#4D403A" strokeWidth="0.95" />
              </g>
            </g>

            {/* 6. Braço(s) à frente */}
            <path ref={backArmAheadPathRef} fill="#EEBE9A" stroke="#1D242E" visibility="hidden" />
            <path ref={backArmAheadCreaseRef} fill="none" stroke="#C58E6B" visibility="hidden" />
            <path ref={backArmAheadDetailRef} fill="none" stroke="#AC7555" visibility="hidden" />
            <path ref={backHandAheadPathRef} fill="#EEBE9A" stroke="#1D242E" visibility="hidden" />
            <path ref={frontArmPathRef} fill="#EEBE9A" stroke="#1D242E" />
            <path ref={frontArmCreaseRef} fill="none" stroke="#C58E6B" visibility="hidden" />
            <path ref={frontArmDetailRef} fill="none" stroke="#AC7555" visibility="hidden" />
            <path ref={frontHandPathRef} fill="#EEBE9A" stroke="#1D242E" />

            {/* 6b. Destaques musculares (sem mix-blend-mode, recortados dentro da silhueta, pulsação contínua por ciclo) */}
            <g ref={muscleGroupRef} clipPath="url(#athleteBodyClip)" opacity="0.5" pointerEvents="none">
              {Array.from({ length: 10 }, (_, idx) => (
                <ellipse
                  key={idx}
                  ref={(el) => {
                    muscleSpotRefs.current[idx] = el;
                  }}
                  fill="url(#muscleHotspotGrad)"
                  visibility="hidden"
                />
              ))}
            </g>

            <g ref={frontDumbbellRef} visibility="hidden">
              <rect x="-2.5" y="-13" width="5" height="26" rx="2" fill="#5D6672" stroke="#242C36" strokeWidth="0.9" />
              <rect x="-8" y="-16" width="16" height="6.5" rx="2" fill="#2A313C" stroke="#181D24" strokeWidth="0.9" />
              <rect x="-8" y="9.5" width="16" height="6.5" rx="2" fill="#2A313C" stroke="#181D24" strokeWidth="0.9" />
            </g>

            {/* 7. Anel guia horizontal para Círculo com os Joelhos */}
            <g ref={kneeRingGroupRef} visibility="hidden">
              <path
                d="M -46 -3 A 46 12 0 1 1 34 8"
                fill="none"
                stroke="#8AE2EC"
                strokeWidth="5.2"
                strokeLinecap="round"
                opacity="0.85"
              />
              <polygon points="29,14 42,6 34,2" fill="#8AE2EC" opacity="0.9" />
              <path
                d="M 46 3 A 46 12 0 0 1 -34 -8"
                fill="none"
                stroke="#8AE2EC"
                strokeWidth="5.2"
                strokeLinecap="round"
                opacity="0.65"
              />
              <polygon points="-29,-14 -42,-6 -34,-2" fill="#8AE2EC" opacity="0.8" />
            </g>

            {/* 8. Seta guia suave (fora do player minimalista) */}
            <path
              ref={arrowPathRef}
              fill="none"
              stroke="#00A89B"
              strokeWidth="3.2"
              strokeLinecap="round"
              opacity="0.78"
              visibility="hidden"
            />
            <polygon
              ref={arrowTipRef}
              points="-5,-5.5 7,0 -5,5.5"
              fill="#00A89B"
              opacity="0.84"
              visibility="hidden"
            />
          </g>
        </svg>

        {/* Trilho de fases na base do palco */}
        {!minimalStage && (
          <div className="shrink-0 border-t border-[#C4D6CC]/80 bg-[#DDE9E2]/90 px-3 pt-1.5 pb-1.5">
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {[0, 1, 2].map((idx) => {
                const isActive = phaseIdx === idx;
                return (
                  <span
                    key={idx}
                    className={`truncate text-[10.5px] leading-tight transition-colors ${
                      isActive ? 'font-bold text-[#008F84]' : 'font-medium text-[#5A6B64]'
                    }`}
                  >
                    {spec.phase_labels[idx] || `Fase ${idx + 1}`}
                  </span>
                );
              })}
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[#C3D5CB]">
              <div
                ref={phaseProgressRef}
                className="h-full rounded-full bg-[#00A89B]"
                style={{ width: '0%' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Caixa de orientação postural (fora do player minimalista) */}
      {!minimalStage && (
        <div className="flex items-center gap-3 border-t border-[#E1EEE9] bg-[#F4FAF7] px-4 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E3F7F2] text-[#0C947E]">
            <UserRound className="h-4 w-4" />
          </span>
          <p className="flex-1 text-xs font-medium leading-snug text-[#2E4A48]">
            {coachTip}
          </p>
        </div>
      )}

      {/* Dock de controle */}
      {showControls && !minimalStage && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E1EEE9] bg-white px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleTogglePlay}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#12BFA3] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0EA88F]"
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing ? 'Pausar' : 'Reproduzir'}
            </button>

            <button
              type="button"
              onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-1.5 font-mono text-xs font-medium text-[#2E4A48] hover:bg-[#E7F4EF]"
            >
              <Gauge className="h-3.5 w-3.5 text-[#0C947E]" />
              {speed === 0.5 ? '0.5x' : '1.0x'}
            </button>
          </div>

          {onSwitchTo3D && (
            <button
              type="button"
              onClick={onSwitchTo3D}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3 py-1.5 text-xs font-medium text-[#2E4A48] hover:bg-[#E7F4EF]"
            >
              <Box className="h-3.5 w-3.5 text-[#0C947E]" />
              Ver em 3D
            </button>
          )}
        </div>
      )}
    </div>
  );
}
