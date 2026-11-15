import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Box, Camera, Gauge, Pause, Play, UserRound, Volume2, VolumeX } from 'lucide-react';
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
  showControls?: boolean;
  heightClass?: string;
  stepCounterLabel?: string;
}

export type ProjectionMode = 'front' | 'profile_z' | 'profile_x' | 'diag_x';

export interface Pt2 {
  x: number;
  y: number;
  depth: number;
}

export function getProjectionMode(archetype: TutorialArchetype): ProjectionMode {
  switch (archetype) {
    case 'jumping_jack':
    case 'sumo_squat':
    case 'lateral_raise':
    case 'shoulder_press':
    case 'torso_twist':
    case 'side_plank':
      return 'front';

    case 'plank':
    case 'pushup':
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
    case 'superman':
    case 'cat_camel':
    case 'child_pose':
    case 'cobra_stretch':
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
      x: originX + (v.x + v.z * 0.1) * scale,
      y: groundY - v.y * scale,
      depth: v.z,
    };
  }
  if (mode === 'profile_x') {
    return {
      x: originX + (v.x + v.z * 0.16) * scale,
      y: groundY - (v.y - v.z * 0.025) * scale,
      depth: v.z,
    };
  }
  if (mode === 'diag_x') {
    return {
      x: originX + (v.x * 0.8 + v.z * 0.52) * scale,
      y: groundY - (v.y - v.z * 0.04) * scale,
      depth: v.z * 0.78 - v.x * 0.58,
    };
  }
  // profile_z: atleta voltado para a direita (+Z mundo -> +X tela)
  return {
    x: originX + (v.z * 0.96 + v.x * 0.22) * scale,
    y: groundY - (v.y + v.x * 0.02) * scale,
    depth: -v.x,
  };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function f(n: number): string {
  return n.toFixed(1);
}

/**
 * Traça uma spline quadrática C1-contínua através de uma lista de pontos de controle,
 * garantindo curvatura orgânica contínua sem quinas ou beliscões em joelhos e cotovelos.
 */
function buildSmoothSplineSegment(pts: Array<[number, number]>): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `L ${f(pts[0][0])} ${f(pts[0][1])}`;
  if (pts.length === 2) return `L ${f(pts[1][0])} ${f(pts[1][1])}`;

  const parts: string[] = [];
  const firstMidX = (pts[0][0] + pts[1][0]) * 0.5;
  const firstMidY = (pts[0][1] + pts[1][1]) * 0.5;
  parts.push(`L ${f(firstMidX)} ${f(firstMidY)}`);

  for (let i = 1; i < pts.length - 1; i++) {
    const nextMidX = (pts[i][0] + pts[i + 1][0]) * 0.5;
    const nextMidY = (pts[i][1] + pts[i + 1][1]) * 0.5;
    parts.push(`Q ${f(pts[i][0])} ${f(pts[i][1])} ${f(nextMidX)} ${f(nextMidY)}`);
  }

  const last = pts[pts.length - 1];
  parts.push(`L ${f(last[0])} ${f(last[1])}`);
  return parts.join(' ');
}

/**
 * Constrói um membro contínuo (2 segmentos: P0 -> P1 -> P2) em uma única curva fechada
 * com spline C1 contínua (sem bolhas sobrepostas ou quinas nas articulações).
 */
function buildContinuousLimbPath(
  p0: Pt2,
  p1: Pt2,
  p2: Pt2,
  opts: {
    rRoot: number;
    rUpperFront: number;
    rUpperBack: number;
    rMid: number;
    rLowerFront: number;
    rLowerBack: number;
    rEnd: number;
    anteriorHintX: number;
    anteriorHintY: number;
    roundRoot?: boolean;
    roundEnd?: boolean;
  }
): string {
  const dx1 = p1.x - p0.x;
  const dy1 = p1.y - p0.y;
  const l1 = Math.hypot(dx1, dy1);
  const dx2 = p2.x - p1.x;
  const dy2 = p2.y - p1.y;
  const l2 = Math.hypot(dx2, dy2);

  // Fallback suave caso um osso aponte diretamente para a câmera (ex.: prancha lateral)
  if (l1 < 2 || l2 < 2) {
    const start = l1 < 2 ? p1 : p0;
    const end = l2 < 2 ? p1 : p2;
    const ddx = end.x - start.x;
    const ddy = end.y - start.y;
    const dlen = Math.hypot(ddx, ddy);
    if (dlen < 1.5) {
      return `M ${f(p1.x - opts.rMid)} ${f(p1.y)} A ${f(opts.rMid)} ${f(opts.rMid)} 0 1 0 ${f(p1.x + opts.rMid)} ${f(p1.y)} A ${f(opts.rMid)} ${f(opts.rMid)} 0 1 0 ${f(p1.x - opts.rMid)} ${f(p1.y)} Z`;
    }
    const ux = ddx / dlen;
    const uy = ddy / dlen;
    const nx = -uy;
    const ny = ux;
    const r0 = l1 < 2 ? opts.rMid : opts.rRoot;
    const r1 = l2 < 2 ? opts.rMid : opts.rEnd;
    return (
      `M ${f(start.x + nx * r0)} ${f(start.y + ny * r0)} ` +
      `L ${f(end.x + nx * r1)} ${f(end.y + ny * r1)} ` +
      `A ${f(r1)} ${f(r1)} 0 0 0 ${f(end.x - nx * r1)} ${f(end.y - ny * r1)} ` +
      `L ${f(start.x - nx * r0)} ${f(start.y - ny * r0)} ` +
      `A ${f(r0)} ${f(r0)} 0 0 0 ${f(start.x + nx * r0)} ${f(start.y + ny * r0)} Z`
    );
  }

  const u1x = dx1 / l1;
  const u1y = dy1 / l1;
  const u2x = dx2 / l2;
  const u2y = dy2 / l2;

  // Normal à esquerda — mesma orientação nos 2 segmentos impede torção (bowtie)
  const b1x = -u1y;
  const b1y = u1x;
  const b2x = -u2y;
  const b2y = u2x;

  const sumDot = (b1x + b2x) * opts.anteriorHintX + (b1y + b2y) * opts.anteriorHintY;
  const d1 = b1x * opts.anteriorHintX + b1y * opts.anteriorHintY;
  const d2 = b2x * opts.anteriorHintX + b2y * opts.anteriorHintY;
  const sideSign = (Math.abs(sumDot) > 0.05 ? sumDot : Math.abs(d1) >= Math.abs(d2) ? d1 : d2) >= 0 ? 1 : -1;

  const n1x = b1x * sideSign;
  const n1y = b1y * sideSign;
  const n2x = b2x * sideSign;
  const n2y = b2y * sideSign;

  let mx = n1x + n2x;
  let my = n1y + n2y;
  let mLen = Math.hypot(mx, my);
  if (mLen < 0.25) {
    mx = n1x;
    my = n1y;
    mLen = 1;
  }
  const nmx = mx / mLen;
  const nmy = my / mLen;
  const cosHalf = clamp(n1x * nmx + n1y * nmy, 0.5, 1);
  const miterScale = clamp(1 / cosHalf, 1, 1.28);

  const chordMidX = (p0.x + p2.x) * 0.5 - p1.x;
  const chordMidY = (p0.y + p2.y) * 0.5 - p1.y;
  const aIsInner = nmx * chordMidX + nmy * chordMidY > 0;
  const bendMag = clamp(1 - (u1x * u2x + u1y * u2y), 0, 1.8);

  const rMidA = opts.rMid * (aIsInner ? miterScale : 1 + bendMag * 0.08);
  const rMidB = opts.rMid * (!aIsInner ? miterScale : 1 + bendMag * 0.08);

  // Estações orgânicas ao longo da borda A (evita pontos internos próximos da dobra durante flexão acentuada)
  const aRoot: [number, number] = [p0.x + n1x * opts.rRoot, p0.y + n1y * opts.rRoot];
  const aUp1: [number, number] = [p0.x + dx1 * 0.36 + n1x * opts.rUpperFront, p0.y + dy1 * 0.36 + n1y * opts.rUpperFront];
  const aUp2: [number, number] = [p0.x + dx1 * 0.68 + n1x * ((opts.rUpperFront + rMidA) * 0.5), p0.y + dy1 * 0.68 + n1y * ((opts.rUpperFront + rMidA) * 0.5)];
  const aMid: [number, number] = [p1.x + nmx * rMidA, p1.y + nmy * rMidA];
  const aLow1: [number, number] = [p1.x + dx2 * 0.4 + n2x * opts.rLowerFront, p1.y + dy2 * 0.4 + n2y * opts.rLowerFront];
  const aLow2: [number, number] = [p1.x + dx2 * 0.74 + n2x * ((opts.rLowerFront + opts.rEnd) * 0.48), p1.y + dy2 * 0.74 + n2y * ((opts.rLowerFront + opts.rEnd) * 0.48)];
  const aEnd: [number, number] = [p2.x + n2x * opts.rEnd, p2.y + n2y * opts.rEnd];

  const aPts: Array<[number, number]> = !aIsInner && bendMag > 0.2
    ? [
        aRoot,
        aUp1,
        [p1.x - u1x * Math.min(9, l1 * 0.2) + n1x * rMidA * 0.96, p1.y - u1y * Math.min(9, l1 * 0.2) + n1y * rMidA * 0.96],
        [p1.x + nmx * (rMidA * 1.1), p1.y + nmy * (rMidA * 1.1)],
        [p1.x + u2x * Math.min(9, l2 * 0.2) + n2x * rMidA * 0.96, p1.y + u2y * Math.min(9, l2 * 0.2) + n2y * rMidA * 0.96],
        aLow1,
        aLow2,
        aEnd,
      ]
    : aIsInner && bendMag > 0.35
      ? [aRoot, aUp1, aMid, aLow2, aEnd]
      : [aRoot, aUp1, aUp2, aMid, aLow1, aLow2, aEnd];

  // Estações orgânicas ao longo da borda B
  const bEnd: [number, number] = [p2.x - n2x * opts.rEnd, p2.y - n2y * opts.rEnd];
  const bLow2: [number, number] = [p1.x + dx2 * 0.72 - n2x * ((opts.rLowerBack + opts.rEnd) * 0.46), p1.y + dy2 * 0.72 - n2y * ((opts.rLowerBack + opts.rEnd) * 0.46)];
  const bLow1: [number, number] = [p1.x + dx2 * 0.38 - n2x * opts.rLowerBack, p1.y + dy2 * 0.38 - n2y * opts.rLowerBack];
  const bMid: [number, number] = [p1.x - nmx * rMidB, p1.y - nmy * rMidB];
  const bUp2: [number, number] = [p0.x + dx1 * 0.68 - n1x * ((opts.rUpperBack + rMidB) * 0.5), p0.y + dy1 * 0.68 - n1y * ((opts.rUpperBack + rMidB) * 0.5)];
  const bUp1: [number, number] = [p0.x + dx1 * 0.34 - n1x * opts.rUpperBack, p0.y + dy1 * 0.34 - n1y * opts.rUpperBack];
  const bRoot: [number, number] = [p0.x - n1x * opts.rRoot, p0.y - n1y * opts.rRoot];

  const bPts: Array<[number, number]> = aIsInner && bendMag > 0.2
    ? [
        bEnd,
        bLow2,
        bLow1,
        [p1.x + u2x * Math.min(8, l2 * 0.18) - n2x * rMidB * 0.96, p1.y + u2y * Math.min(8, l2 * 0.18) - n2y * rMidB * 0.96],
        [p1.x - nmx * (rMidB * 1.1), p1.y - nmy * (rMidB * 1.1)],
        [p1.x - u1x * Math.min(8, l1 * 0.18) - n1x * rMidB * 0.96, p1.y - u1y * Math.min(8, l1 * 0.18) - n1y * rMidB * 0.96],
        bUp1,
        bRoot,
      ]
    : !aIsInner && bendMag > 0.35
      ? [bEnd, bLow2, bMid, bUp1, bRoot]
      : [bEnd, bLow2, bLow1, bMid, bUp2, bUp1, bRoot];

  const cross1 = u1x * n1y - u1y * n1x;
  const cross2 = u2x * n2y - u2y * n2x;
  const rootSweep = cross1 < 0 ? 1 : 0;
  const endSweep = cross2 < 0 ? 1 : 0;

  const endCap = opts.roundEnd
    ? `A ${f(opts.rEnd)} ${f(opts.rEnd)} 0 0 ${endSweep} ${f(bEnd[0])} ${f(bEnd[1])}`
    : `L ${f(bEnd[0])} ${f(bEnd[1])}`;

  const rootCap =
    opts.roundRoot !== false
      ? `A ${f(opts.rRoot)} ${f(opts.rRoot)} 0 0 ${rootSweep} ${f(aRoot[0])} ${f(aRoot[1])}`
      : `L ${f(aRoot[0])} ${f(aRoot[1])}`;

  return (
    `M ${f(aRoot[0])} ${f(aRoot[1])} ` +
    `${buildSmoothSplineSegment(aPts)} ` +
    `${endCap} ` +
    `${buildSmoothSplineSegment(bPts)} ` +
    `${rootCap} Z`
  );
}

/**
 * Desenha o tronco humano como UM ÚNICO contorno contínuo do pescoço até os quadris/glúteos,
 * e fatia perfeitamente leggings/cintura/top esportivo pelas mesmas coordenadas (sem sobreposição de cápsulas!).
 */
function buildUnifiedTorsoPaths(
  pelvis: Pt2,
  neck: Pt2,
  chestFwd2D: Pt2,
  hipL: Pt2,
  hipR: Pt2,
  shL: Pt2,
  shR: Pt2,
  mode: ProjectionMode,
  sF: number
): { skinBody: string; topGarment: string; topStrapAccent: string; bottomsGarment: string } {
  const sx = neck.x - pelvis.x;
  const sy = neck.y - pelvis.y;
  const sLen = Math.hypot(sx, sy) || 1;
  const ux = sx / sLen;
  const uy = sy / sLen;

  if (mode === 'front') {
    // Modo frontal simétrico usando distância real entre ombros e quadris
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

    const shSpread = clamp(Math.hypot(shL.x - shR.x, shL.y - shR.y) * 0.5 + 3.5 * sF, 14 * sF, 26 * sF);
    const hipSpread = clamp(Math.hypot(hipL.x - hipR.x, hipL.y - hipR.y) * 0.5 + 9 * sF, 13 * sF, 21 * sF);
    const waistSpread = hipSpread * 0.72;
    const chestSpread = shSpread * 0.76;
    const neckHalf = 5.4 * sF;

    const lNeck = pt(1.01, neckHalf);
    const rNeck = pt(1.01, -neckHalf);
    const lSh = pt(0.91, shSpread);
    const rSh = pt(0.91, -shSpread);
    const lChest = pt(0.7, chestSpread);
    const rChest = pt(0.7, -chestSpread);
    const lHem = pt(0.51, waistSpread * 1.07);
    const rHem = pt(0.51, -waistSpread * 1.07);
    const lWaist = pt(0.35, waistSpread);
    const rWaist = pt(0.35, -waistSpread);
    const lBand = pt(0.18, hipSpread * 0.9);
    const rBand = pt(0.18, -hipSpread * 0.9);
    const lHip = pt(0.0, hipSpread);
    const rHip = pt(0.0, -hipSpread);
    const crotch = pt(-0.1, 0);

    const skinBody =
      `M ${f(lNeck.x)} ${f(lNeck.y)} ` +
      `Q ${f(lSh.x)} ${f(lSh.y - 2 * sF)} ${f(lSh.x)} ${f(lSh.y)} ` +
      `Q ${f(lChest.x)} ${f(lChest.y)} ${f(lWaist.x)} ${f(lWaist.y)} ` +
      `Q ${f(lBand.x)} ${f(lBand.y)} ${f(lHip.x)} ${f(lHip.y)} ` +
      `Q ${f(crotch.x)} ${f(crotch.y)} ${f(rHip.x)} ${f(rHip.y)} ` +
      `Q ${f(rBand.x)} ${f(rBand.y)} ${f(rWaist.x)} ${f(rWaist.y)} ` +
      `Q ${f(rChest.x)} ${f(rChest.y)} ${f(rSh.x)} ${f(rSh.y)} ` +
      `Q ${f(rSh.x)} ${f(rSh.y - 2 * sF)} ${f(rNeck.x)} ${f(rNeck.y)} Z`;

    const neckDip = pt(0.84, 0);
    const topGarment =
      `M ${f(pt(0.96, neckHalf * 1.35).x)} ${f(pt(0.96, neckHalf * 1.35).y)} ` +
      `Q ${f(neckDip.x)} ${f(neckDip.y)} ${f(pt(0.96, -neckHalf * 1.35).x)} ${f(pt(0.96, -neckHalf * 1.35).y)} ` +
      `L ${f(pt(0.93, -shSpread * 0.85).x)} ${f(pt(0.93, -shSpread * 0.85).y)} ` +
      `Q ${f(pt(0.75, -chestSpread * 0.92).x)} ${f(pt(0.75, -chestSpread * 0.92).y)} ${f(rChest.x)} ${f(rChest.y)} ` +
      `L ${f(rHem.x)} ${f(rHem.y)} ` +
      `Q ${f(pt(0.49, 0).x)} ${f(pt(0.49, 0).y)} ${f(lHem.x)} ${f(lHem.y)} ` +
      `L ${f(lChest.x)} ${f(lChest.y)} ` +
      `Q ${f(pt(0.75, chestSpread * 0.92).x)} ${f(pt(0.75, chestSpread * 0.92).y)} ${f(pt(0.93, shSpread * 0.85).x)} ${f(pt(0.93, shSpread * 0.85).y)} Z`;

    const bandCenter = pt(0.16, 0);
    const bottomsGarment =
      `M ${f(lBand.x)} ${f(lBand.y)} ` +
      `Q ${f(bandCenter.x)} ${f(bandCenter.y)} ${f(rBand.x)} ${f(rBand.y)} ` +
      `L ${f(rHip.x)} ${f(rHip.y)} ` +
      `Q ${f(crotch.x)} ${f(crotch.y)} ${f(lHip.x)} ${f(lHip.y)} Z`;

    return { skinBody, topGarment, topStrapAccent: '', bottomsGarment };
  }

  // Perfil ou diagonal: perpendicular apontando para o peito (fwdPerp)
  let fx = -uy;
  let fy = ux;
  if (fx * chestFwd2D.x + fy * chestFwd2D.y < 0) {
    fx = -fx;
    fy = -fy;
  }

  const p = (t: number, offset: number): Pt2 => ({
    x: pelvis.x + sx * t + fx * offset * sF,
    y: pelvis.y + sy * t + fy * offset * sF,
    depth: 0,
  });

  // Curva anatômica refinada: pescoço esguio -> clavícula -> busto natural -> cintura esbelta -> pelve/glúteo firme
  const fNeck = p(1.02, 4.4);
  const fCollar = p(0.93, 9.0);
  const fBust = p(0.73, 14.8);
  const fHem = p(0.52, 11.4);
  const fWaist = p(0.35, 9.6);
  const fBand = p(0.20, 11.2);
  const fHip = p(0.0, 12.2);
  const botMid = p(-0.08, -0.5);
  const bHip = p(0.0, -13.6);
  const bGlute = p(0.09, -14.8);
  const bBand = p(0.21, -11.6);
  const bLumbar = p(0.37, -8.8);
  const bHem = p(0.54, -11.2);
  const bScapula = p(0.77, -12.4);
  const bTrap = p(0.93, -8.8);
  const bNeck = p(1.02, -4.8);

  const skinBody =
    `M ${f(fNeck.x)} ${f(fNeck.y)} ` +
    `L ${f(fCollar.x)} ${f(fCollar.y)} ` +
    `Q ${f(p(0.81, 14.5).x)} ${f(p(0.81, 14.5).y)} ${f(fBust.x)} ${f(fBust.y)} ` +
    `Q ${f(p(0.62, 13.0).x)} ${f(p(0.62, 13.0).y)} ${f(fHem.x)} ${f(fHem.y)} ` +
    `Q ${f(fWaist.x)} ${f(fWaist.y)} ${f(fBand.x)} ${f(fBand.y)} ` +
    `L ${f(fHip.x)} ${f(fHip.y)} ` +
    `Q ${f(botMid.x)} ${f(botMid.y)} ${f(bHip.x)} ${f(bHip.y)} ` +
    `Q ${f(bGlute.x)} ${f(bGlute.y)} ${f(bBand.x)} ${f(bBand.y)} ` +
    `Q ${f(bLumbar.x)} ${f(bLumbar.y)} ${f(bHem.x)} ${f(bHem.y)} ` +
    `Q ${f(bScapula.x)} ${f(bScapula.y)} ${f(bTrap.x)} ${f(bTrap.y)} ` +
    `L ${f(bNeck.x)} ${f(bNeck.y)} Z`;

  // Top esportivo cobre bem ombro/clavícula e contorna o peitoral sem degraus
  const fTopNeck = p(0.88, 10.6);
  const strapTopFront = p(0.95, 5.4);
  const strapTopBack = p(0.94, -4.2);
  const bTopArmhole = p(0.75, -12.3);
  const hemCenter = p(0.525, 0.4);

  const topGarment =
    `M ${f(strapTopFront.x)} ${f(strapTopFront.y)} ` +
    `Q ${f(fTopNeck.x)} ${f(fTopNeck.y)} ${f(p(0.82, 14.5).x)} ${f(p(0.82, 14.5).y)} ` +
    `Q ${f(p(0.74, 15.6).x)} ${f(p(0.74, 15.6).y)} ${f(fBust.x)} ${f(fBust.y)} ` +
    `Q ${f(p(0.62, 13.2).x)} ${f(p(0.62, 13.2).y)} ${f(fHem.x)} ${f(fHem.y)} ` +
    `Q ${f(hemCenter.x)} ${f(hemCenter.y)} ${f(bHem.x)} ${f(bHem.y)} ` +
    `Q ${f(bTopArmhole.x)} ${f(bTopArmhole.y)} ${f(p(0.87, -10.8).x)} ${f(p(0.87, -10.8).y)} ` +
    `L ${f(strapTopBack.x)} ${f(strapTopBack.y)} Z`;

  const topStrapAccent =
    `M ${f(p(0.59, 12.6).x)} ${f(p(0.59, 12.6).y)} ` +
    `Q ${f(p(0.575, 1.0).x)} ${f(p(0.575, 1.0).y)} ${f(p(0.59, -11.7).x)} ${f(p(0.59, -11.7).y)} ` +
    `L ${f(bHem.x)} ${f(bHem.y)} ` +
    `Q ${f(hemCenter.x)} ${f(hemCenter.y)} ${f(fHem.x)} ${f(fHem.y)} Z`;

  // Legging / bermuda cintura alta envolve pelve e se funde suavemente com a perna da frente
  const waistCenter = p(0.19, -0.4);
  const bottomsGarment =
    `M ${f(fBand.x)} ${f(fBand.y)} ` +
    `Q ${f(waistCenter.x)} ${f(waistCenter.y)} ${f(bBand.x)} ${f(bBand.y)} ` +
    `Q ${f(bGlute.x)} ${f(bGlute.y)} ${f(bHip.x)} ${f(bHip.y)} ` +
    `Q ${f(botMid.x)} ${f(botMid.y)} ${f(fHip.x)} ${f(fHip.y)} Z`;

  return { skinBody, topGarment, topStrapAccent, bottomsGarment };
}

/**
 * Constrói mão humana elegante e arredondada (sem garras/pontas ou bolinhas simples).
 */
function buildSculptedHandPath(elbow: Pt2, wrist: Pt2, sF: number, facingSign: number): string {
  const dx = wrist.x - elbow.x;
  const dy = wrist.y - elbow.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy * facingSign;
  const ny = ux * facingSign;

  const wristHalf = 3.0 * sF;
  const palmLen = 4.8 * sF;
  const fingerLen = 10.6 * sF;
  const palmHalf = 3.7 * sF;

  const w1x = wrist.x + nx * wristHalf;
  const w1y = wrist.y + ny * wristHalf;
  const w2x = wrist.x - nx * wristHalf;
  const w2y = wrist.y - ny * wristHalf;

  const palm1X = wrist.x + ux * (palmLen * 0.85) + nx * (palmHalf * 1.15);
  const palm1Y = wrist.y + uy * (palmLen * 0.85) + ny * (palmHalf * 1.15);
  const tipX = wrist.x + ux * fingerLen;
  const tipY = wrist.y + uy * fingerLen;
  const palm2X = wrist.x + ux * (palmLen * 0.95) - nx * palmHalf;
  const palm2Y = wrist.y + uy * (palmLen * 0.95) - ny * palmHalf;

  return (
    `M ${f(w1x)} ${f(w1y)} ` +
    `C ${f(palm1X)} ${f(palm1Y)} ${f(tipX + nx * 2.5 * sF)} ${f(tipY + ny * 2.5 * sF)} ${f(tipX)} ${f(tipY)} ` +
    `C ${f(tipX - nx * 2.5 * sF)} ${f(tipY - ny * 2.5 * sF)} ${f(palm2X)} ${f(palm2Y)} ${f(w2x)} ${f(w2y)} Z`
  );
}

/**
 * Desenha tênis esportivo realista com apoio automático no solo/colchonete.
 */
function buildAthleticShoePaths(
  ankle: Pt2,
  footVecX: number,
  footVecY: number,
  sF: number,
  opts: { groundY: number; isFloor: boolean; mode: ProjectionMode; facingSign: number; worldAnkleY: number }
): { upperPath: string; solePath: string; accentPath: string } {
  let fx = footVecX;
  let fy = footVecY;
  let fLen = Math.hypot(fx, fy);

  // Corrige direção no solo ou vista frontal
  if (opts.mode === 'front') {
    const side = fx >= 0 ? 1 : -1;
    fx = side * 0.75;
    fy = 0.25;
    fLen = Math.hypot(fx, fy);
  } else if (fLen < 0.05) {
    fx = opts.facingSign;
    fy = 0;
    fLen = 1;
  }

  let ux = fx / fLen;
  let uy = fy / fLen;

  // Normal "para cima" da sola em relação ao dorso do pé
  let upX = uy;
  let upY = -ux;
  // Para exercícios no chão ou em pé, garante que a sola aponte para o chão (+Y tela)
  if (!opts.isFloor) {
    if (upY > 0.25) {
      upX = -upX;
      upY = -upY;
    }
  } else {
    // No solo, a sola fica no lado de fora/chão se possível
    if (upY > 0.35 && Math.abs(ux) > 0.4) {
      upX = -upX;
      upY = -upY;
    }
  }

  const shoeLen = opts.mode === 'front' ? 14 * sF : 22 * sF;
  const heelBack = opts.mode === 'front' ? 4.5 * sF : 6.5 * sF;
  const ankleDrop = 6.5 * sF;

  let heelX = ankle.x - ux * heelBack - upX * ankleDrop;
  let heelY = ankle.y - uy * heelBack - upY * ankleDrop;
  let toeX = ankle.x + ux * shoeLen - upX * ankleDrop;
  let toeY = ankle.y + uy * shoeLen - upY * ankleDrop;

  // No solo (prancha, flexão, alpinista), apoia a ponta dos dedos no colchonete sem afundar no chão
  if (opts.isFloor && opts.worldAnkleY < 0.14 && uy > 0.35) {
    const matSurfaceY = opts.groundY - 2;
    const rawMaxY = Math.max(heelY, toeY);
    if (rawMaxY > matSurfaceY) {
      const targetToeY = matSurfaceY;
      const distAlongToe = (targetToeY - ankle.y) / Math.max(0.35, uy);
      const clampedSpan = clamp(distAlongToe, 6 * sF, 16 * sF);
      toeX = ankle.x + ux * clampedSpan;
      toeY = Math.min(matSurfaceY, ankle.y + uy * clampedSpan);
      heelX = ankle.x - ux * (shoeLen - clampedSpan);
      heelY = ankle.y - uy * (shoeLen - clampedSpan);
    }
  } else if (!opts.isFloor && opts.worldAnkleY < 0.14) {
    const maxSoleY = Math.max(heelY, toeY);
    if (maxSoleY > opts.groundY - 2) {
      const lift = maxSoleY - (opts.groundY - 2);
      heelY -= lift * 0.65;
      toeY -= lift;
    } else if (opts.worldAnkleY < 0.08 && Math.abs(uy) < 0.25) {
      // Pé plano em apoio: nivela a sola exatamente na linha do chão
      const targetSoleY = opts.groundY - 2.5;
      heelY = targetSoleY;
      toeY = targetSoleY;
    } else if (opts.worldAnkleY <= 0.13 && uy > 0.2) {
      // Pé de trás da estocada / elevação de panturrilha apoiado na ponta dos dedos
      toeY = Math.min(toeY, opts.groundY - 2.5);
    }
  }

  // Garante que a biqueira/sola nunca ultrapasse a espessura do solo
  const soleThick = 3.0 * sF;
  const maxAllowedBottom = opts.groundY + 1;
  const currentMaxY = Math.max(heelY, toeY) + soleThick;
  if (opts.worldAnkleY < 0.16 && currentMaxY > maxAllowedBottom) {
    const corr = currentMaxY - maxAllowedBottom;
    heelY -= corr;
    toeY -= corr;
  }

  const collarH = 10.5 * sF;
  const vampH = 6.2 * sF;

  const heelTopX = heelX + upX * (collarH * 0.85) + ux * (2 * sF);
  const heelTopY = heelY + upY * (collarH * 0.85) + uy * (2 * sF);
  const tongueX = ankle.x + ux * (5.5 * sF) + upX * 4.5 * sF;
  const tongueY = ankle.y + uy * (5.5 * sF) + upY * 4.5 * sF;
  const toeTopX = toeX + upX * (vampH * 0.55) - ux * (2 * sF);
  const toeTopY = toeY + upY * (vampH * 0.55) - uy * (2 * sF);

  const upperPath =
    `M ${f(heelX)} ${f(heelY)} ` +
    `L ${f(heelTopX)} ${f(heelTopY)} ` +
    `L ${f(tongueX)} ${f(tongueY)} ` +
    `Q ${f(ankle.x + ux * (shoeLen * 0.65) + upX * vampH)} ${f(ankle.y + uy * (shoeLen * 0.65) + upY * vampH)} ${f(toeTopX)} ${f(toeTopY)} ` +
    `Q ${f(toeX + ux * 2.5 * sF + upX * 1.5 * sF)} ${f(toeY + uy * 2.5 * sF + upY * 1.5 * sF)} ${f(toeX)} ${f(toeY)} Z`;

  const solePath =
    `M ${f(heelX)} ${f(heelY)} ` +
    `L ${f(toeX)} ${f(toeY)} ` +
    `L ${f(toeX - upX * soleThick)} ${f(toeY - upY * soleThick)} ` +
    `Q ${f((heelX + toeX) * 0.5 - upX * (soleThick * 1.1))} ${f((heelY + toeY) * 0.5 - upY * (soleThick * 1.1))} ${f(heelX - upX * soleThick)} ${f(heelY - upY * soleThick)} Z`;

  const accentPath =
    `M ${f(heelX + ux * 3 * sF + upX * 2.5 * sF)} ${f(heelY + uy * 3 * sF + upY * 2.5 * sF)} ` +
    `Q ${f((heelX + toeX) * 0.52 + upX * 3.5 * sF)} ${f((heelY + toeY) * 0.52 + upY * 3.5 * sF)} ${f(toeX - ux * 5 * sF + upX * 1.6 * sF)} ${f(toeY - uy * 5 * sF + upY * 1.6 * sF)}`;

  return { upperPath, solePath, accentPath };
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

/**
 * Gera todos os caminhos SVG de um frame de pose para permitir atualização a 60fps e testes unitários.
 */
export function computeVectorFramePaths(spec: ExerciseTutorialSpec, cycle: number, poseState: Pose3DState) {
  evaluateExercisePose3D(spec, cycle, poseState);

  const mode = getProjectionMode(spec.archetype);
  const isFloor = isFloorProjection(mode);
  const groundY = isFloor ? 248 : 260;
  const baseScale = isFloor ? 168 : 132;
  const maxWorldY = Math.max(
    poseState.head.y + 0.16,
    poseState.wristL.y + 0.08,
    poseState.wristR.y + 0.08,
    poseState.ankleL.y + 0.06,
    poseState.ankleR.y + 0.06
  );
  const scale = maxWorldY * baseScale > groundY - 22 ? Math.max(106, (groundY - 22) / maxWorldY) : baseScale;
  const originX = 210;
  const sF = scale / 132;

  const head = projectPoint(poseState.head, mode, scale, groundY, originX);
  const neck = projectPoint(poseState.neck, mode, scale, groundY, originX);
  const chest = projectPoint(poseState.chestCenter, mode, scale, groundY, originX);
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

  // Centraliza horizontalmente o atleta mantendo margem segura
  const bodyMinX = Math.min(head.x, pelvis.x, aL.x, aR.x, wL.x, wR.x, kL.x, kR.x);
  const bodyMaxX = Math.max(head.x, pelvis.x, aL.x, aR.x, wL.x, wR.x, kL.x, kR.x);
  const shiftX = 210 - (bodyMinX + bodyMaxX) * 0.5;

  const fwdProj = projectPoint(poseState.pelvis.clone().add(poseState.torsoForward), mode, scale, groundY, originX);
  const chestFwd2D: Pt2 = { x: fwdProj.x - pelvis.x, y: fwdProj.y - pelvis.y, depth: 0 };
  const facingSign = chestFwd2D.x >= 0 ? 1 : -1;

  // Profundidade Z para ordenação correta
  const leftLegFront = kL.depth + aL.depth >= kR.depth + aR.depth;
  const leftArmFront = eL.depth + wL.depth >= eR.depth + wR.depth;

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

  // Pernas contínuas — recuando levemente a raiz dentro da pelve para fusão perfeita sem bola no quadril
  const legFwdHintX = mode === 'front' ? (bHip.x >= pelvis.x ? 1 : -1) : chestFwd2D.x;
  const legFwdHintY = mode === 'front' ? 0 : chestFwd2D.y;

  const legRootPull = mode === 'front' ? 0.25 : 0.3;
  const bHipSeated: Pt2 = {
    x: bHip.x + (pelvis.x - bHip.x) * legRootPull,
    y: bHip.y + (pelvis.y - bHip.y) * legRootPull,
    depth: bHip.depth,
  };
  const fHipSeated: Pt2 = {
    x: fHip.x + (pelvis.x - fHip.x) * legRootPull,
    y: fHip.y + (pelvis.y - fHip.y) * legRootPull,
    depth: fHip.depth,
  };

  const backLegPath = buildContinuousLimbPath(bHipSeated, bKnee, bAnkle, {
    rRoot: 11.8 * sF,
    rUpperFront: 12.2 * sF,
    rUpperBack: 10.6 * sF,
    rMid: 7.8 * sF,
    rLowerFront: 5.5 * sF,
    rLowerBack: 8.8 * sF,
    rEnd: 4.5 * sF,
    anteriorHintX: mode === 'front' ? (bHip.x - pelvis.x || -1) : legFwdHintX,
    anteriorHintY: legFwdHintY,
    roundRoot: false,
  });

  const frontLegPath = buildContinuousLimbPath(fHipSeated, fKnee, fAnkle, {
    rRoot: 12.2 * sF,
    rUpperFront: 12.6 * sF,
    rUpperBack: 11.0 * sF,
    rMid: 8.2 * sF,
    rLowerFront: 5.8 * sF,
    rLowerBack: 9.2 * sF,
    rEnd: 4.7 * sF,
    anteriorHintX: mode === 'front' ? (fHip.x - pelvis.x || 1) : legFwdHintX,
    anteriorHintY: legFwdHintY,
    roundRoot: false,
  });

  // Braços contínuos + mãos elegantes
  const backArmPath = buildContinuousLimbPath(bSh, bEl, bWr, {
    rRoot: 6.4 * sF,
    rUpperFront: 6.0 * sF,
    rUpperBack: 5.8 * sF,
    rMid: 4.8 * sF,
    rLowerFront: 4.7 * sF,
    rLowerBack: 4.5 * sF,
    rEnd: 3.1 * sF,
    anteriorHintX: chestFwd2D.x,
    anteriorHintY: chestFwd2D.y,
    roundEnd: true,
  });

  const frontArmPath = buildContinuousLimbPath(fSh, fEl, fWr, {
    rRoot: 6.8 * sF,
    rUpperFront: 6.4 * sF,
    rUpperBack: 6.2 * sF,
    rMid: 5.0 * sF,
    rLowerFront: 4.9 * sF,
    rLowerBack: 4.7 * sF,
    rEnd: 3.3 * sF,
    anteriorHintX: chestFwd2D.x,
    anteriorHintY: chestFwd2D.y,
    roundEnd: true,
  });

  const backHandPath = buildSculptedHandPath(bEl, bWr, sF, facingSign);
  const frontHandPath = buildSculptedHandPath(fEl, fWr, sF, facingSign);

  // Tênis com projeção real do pé + apoio no piso
  const bFootTipProj = projectPoint(bAnkleWorld.clone().add(bFootDir), mode, scale, groundY, originX);
  const backShoes = buildAthleticShoePaths(bAnkle, bFootTipProj.x - bAnkle.x, bFootTipProj.y - bAnkle.y, sF, {
    groundY,
    isFloor,
    mode,
    facingSign,
    worldAnkleY: bAnkleWorldY,
  });

  const fFootTipProj = projectPoint(fAnkleWorld.clone().add(fFootDir), mode, scale, groundY, originX);
  const frontShoes = buildAthleticShoePaths(fAnkle, fFootTipProj.x - fAnkle.x, fFootTipProj.y - fAnkle.y, sF, {
    groundY,
    isFloor,
    mode,
    facingSign,
    worldAnkleY: fAnkleWorldY,
  });

  // Tronco unificado (pele + top + calça alinhados na mesma malha)
  const torso = buildUnifiedTorsoPaths(pelvis, neck, chestFwd2D, hL, hR, sL, sR, mode, sF);

  // Pescoço esguio e anatômico (mais fino sob o queixo, alargando suavemente no trapézio/clavícula)
  const nx = head.x - neck.x;
  const ny = head.y - neck.y;
  const nLen = Math.hypot(nx, ny) || 1;
  const nux = nx / nLen;
  const nuy = ny / nLen;
  const pnx = -nuy;
  const pny = nux;
  const neckBaseR = 4.9 * sF;
  const neckTopR = 3.7 * sF;
  const neckMidX = (neck.x + head.x) * 0.5;
  const neckMidY = (neck.y + head.y) * 0.5;
  const neckPath =
    `M ${f(neck.x - nux * 2 * sF + pnx * neckBaseR)} ${f(neck.y - nuy * 2 * sF + pny * neckBaseR)} ` +
    `Q ${f(neckMidX + pnx * (neckTopR * 1.05))} ${f(neckMidY + pny * (neckTopR * 1.05))} ${f(head.x + nux * 3 * sF + pnx * neckTopR)} ${f(head.y + nuy * 3 * sF + pny * neckTopR)} ` +
    `L ${f(head.x + nux * 3 * sF - pnx * neckTopR)} ${f(head.y + nuy * 3 * sF - pny * neckTopR)} ` +
    `Q ${f(neckMidX - pnx * (neckTopR * 1.05))} ${f(neckMidY - pny * (neckTopR * 1.05))} ${f(neck.x - nux * 2 * sF - pnx * neckBaseR)} ${f(neck.y - nuy * 2 * sF - pny * neckBaseR)} Z`;

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

  const headTiltDeg = (Math.atan2(nx, -ny) * 180) / Math.PI;
  const hairSwingDeg = s * 4.5;

  // Matriz ortonormal 2D para cabeça no modo perfil/diagonal (impede inversão de cabeça em supinos)
  const spLen = Math.hypot(neck.x - pelvis.x, neck.y - pelvis.y) || 1;
  const spX = (neck.x - pelvis.x) / spLen;
  const spY = (neck.y - pelvis.y) / spLen;
  // Vetor perpendicular ao eixo cabeça->pescoço apontando para a frente do rosto/peito
  let fX = -nuy;
  let fY = nux;
  if (fX * chestFwd2D.x + fY * chestFwd2D.y < 0) {
    fX = -fX;
    fY = -fY;
  }
  // Eixo local +Y da cabeça (queixo->pescoço) aponta contrário ao eixo pescoço->topo (nux, nuy)
  const downX = -nux;
  const downY = -nuy;
  // Se chestFwd2D estiver quase nulo (torso perpendicular ao plano), garante frente olhando ao lado natural do tronco
  if (Math.hypot(chestFwd2D.x, chestFwd2D.y) < 0.04) {
    fX = -spY >= 0 ? -nuy : nuy;
    fY = -spY >= 0 ? nux : -nux;
  }

  const headTransform =
    mode === 'front'
      ? `translate(${f(head.x)}, ${f(head.y)}) rotate(${f(headTiltDeg)}) scale(${sF.toFixed(2)}, ${sF.toFixed(2)})`
      : `matrix(${(fX * sF).toFixed(3)} ${(fY * sF).toFixed(3)} ${(downX * sF).toFixed(3)} ${(downY * sF).toFixed(3)} ${f(head.x)} ${f(head.y)})`;

  return {
    mode,
    isFloor,
    scale,
    groundY,
    sF,
    shiftX,
    pelvis,
    head,
    neck,
    fSh,
    bSh,
    bEl,
    bWr,
    fEl,
    fWr,
    facingSign,
    headTiltDeg,
    headTransform,
    hairSwingDeg,
    backLegPath,
    frontLegPath,
    backArmPath,
    frontArmPath,
    backHandPath,
    frontHandPath,
    backShoes,
    frontShoes,
    torso,
    neckPath,
    arrow,
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
  showControls = true,
  heightClass = 'h-72 sm:h-80',
  stepCounterLabel,
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
  const resetCycleRef = useRef(false);

  // Refs diretas nos nós SVG para rodar suavemente a 60fps sem re-render
  const floorLineRef = useRef<SVGLineElement | null>(null);
  const matRef = useRef<SVGRectElement | null>(null);
  const benchGroupRef = useRef<SVGGElement | null>(null);
  const shadowRef = useRef<SVGEllipseElement | null>(null);
  const athleteRootRef = useRef<SVGGElement | null>(null);

  const backArmPathRef = useRef<SVGPathElement | null>(null);
  const backHandPathRef = useRef<SVGPathElement | null>(null);
  const backDumbbellRef = useRef<SVGGElement | null>(null);

  const backLegPathRef = useRef<SVGPathElement | null>(null);
  const backShoeUpperRef = useRef<SVGPathElement | null>(null);
  const backShoeSoleRef = useRef<SVGPathElement | null>(null);
  const backShoeAccentRef = useRef<SVGPathElement | null>(null);

  const torsoSkinRef = useRef<SVGPathElement | null>(null);
  const torsoBottomsRef = useRef<SVGPathElement | null>(null);
  const torsoTopRef = useRef<SVGPathElement | null>(null);
  const torsoTopAccentRef = useRef<SVGPathElement | null>(null);

  const frontLegPathRef = useRef<SVGPathElement | null>(null);
  const frontShoeUpperRef = useRef<SVGPathElement | null>(null);
  const frontShoeSoleRef = useRef<SVGPathElement | null>(null);
  const frontShoeAccentRef = useRef<SVGPathElement | null>(null);

  const neckPathRef = useRef<SVGPathElement | null>(null);
  const headGroupRef = useRef<SVGGElement | null>(null);
  const headProfileRef = useRef<SVGGElement | null>(null);
  const headFrontRef = useRef<SVGGElement | null>(null);
  const ponytailGroupRef = useRef<SVGGElement | null>(null);

  const frontArmPathRef = useRef<SVGPathElement | null>(null);
  const frontHandPathRef = useRef<SVGPathElement | null>(null);
  const frontDumbbellRef = useRef<SVGGElement | null>(null);

  const arrowPathRef = useRef<SVGPathElement | null>(null);
  const arrowTipRef = useRef<SVGPolygonElement | null>(null);

  useEffect(() => {
    resetCycleRef.current = true;
    setRepCount(1);
    setPhaseIdx(0);
  }, [exerciseName, spec.archetype]);

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
    let lastShownPhase: 0 | 1 | 2 = 0;
    let disposed = false;

    const tick = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.08, (now - lastTime) / 1000);
      lastTime = now;

      if (resetCycleRef.current) {
        cycle = 0;
        reps = 1;
        resetCycleRef.current = false;
      }

      const curSpec = specRef.current;
      if (playingRef.current) {
        const deltaCycle = (dt * speedRef.current) / Math.max(1.2, curSpec.tempo_seconds);
        const next = cycle + deltaCycle;
        if (next >= 1) {
          reps += Math.floor(next);
          setRepCount(reps);
        }
        cycle = next % 1;
      }

      const frame = computeVectorFramePaths(curSpec, cycle, poseState);
      if (poseState.phaseIndex !== lastShownPhase) {
        lastShownPhase = poseState.phaseIndex;
        setPhaseIdx(poseState.phaseIndex);
      }

      if (floorLineRef.current) {
        floorLineRef.current.setAttribute('y1', String(frame.groundY));
        floorLineRef.current.setAttribute('y2', String(frame.groundY));
      }

      if (athleteRootRef.current) {
        athleteRootRef.current.setAttribute('transform', `translate(${f(frame.shiftX)}, 0)`);
      }

      if (matRef.current) {
        if (poseState.prop === 'mat') {
          matRef.current.setAttribute('visibility', 'visible');
          matRef.current.setAttribute('y', String(frame.groundY - 3));
        } else {
          matRef.current.setAttribute('visibility', 'hidden');
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
        shadowRef.current.setAttribute('cx', f(frame.pelvis.x + frame.shiftX));
        shadowRef.current.setAttribute('cy', String(frame.groundY + 4));
        shadowRef.current.setAttribute('rx', frame.isFloor ? '110' : '58');
      }

      // Membros & Roupas
      backArmPathRef.current?.setAttribute('d', frame.backArmPath);
      backHandPathRef.current?.setAttribute('d', frame.backHandPath);
      backLegPathRef.current?.setAttribute('d', frame.backLegPath);
      backShoeUpperRef.current?.setAttribute('d', frame.backShoes.upperPath);
      backShoeSoleRef.current?.setAttribute('d', frame.backShoes.solePath);
      backShoeAccentRef.current?.setAttribute('d', frame.backShoes.accentPath);

      torsoSkinRef.current?.setAttribute('d', frame.torso.skinBody);
      torsoBottomsRef.current?.setAttribute('d', frame.torso.bottomsGarment);
      torsoTopRef.current?.setAttribute('d', frame.torso.topGarment);
      if (torsoTopAccentRef.current) {
        if (frame.torso.topStrapAccent) {
          torsoTopAccentRef.current.setAttribute('visibility', 'visible');
          torsoTopAccentRef.current.setAttribute('d', frame.torso.topStrapAccent);
        } else {
          torsoTopAccentRef.current.setAttribute('visibility', 'hidden');
        }
      }

      frontLegPathRef.current?.setAttribute('d', frame.frontLegPath);
      frontShoeUpperRef.current?.setAttribute('d', frame.frontShoes.upperPath);
      frontShoeSoleRef.current?.setAttribute('d', frame.frontShoes.solePath);
      frontShoeAccentRef.current?.setAttribute('d', frame.frontShoes.accentPath);

      frontArmPathRef.current?.setAttribute('d', frame.frontArmPath);
      frontHandPathRef.current?.setAttribute('d', frame.frontHandPath);

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

      // Pescoço & Cabeça humana (perfil limpo OU frente simétrica)
      neckPathRef.current?.setAttribute('d', frame.neckPath);
      if (headGroupRef.current) {
        headGroupRef.current.setAttribute('transform', frame.headTransform);
        headProfileRef.current?.setAttribute('visibility', frame.mode === 'front' ? 'hidden' : 'visible');
        headFrontRef.current?.setAttribute('visibility', frame.mode === 'front' ? 'visible' : 'hidden');
        ponytailGroupRef.current?.setAttribute('transform', `rotate(${f(frame.hairSwingDeg)}, -10, -4)`);
      }

      // Seta guia suave
      if (arrowPathRef.current && arrowTipRef.current) {
        if (frame.arrow) {
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
  }, []);

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

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#101613]">
      {/* Palco claro limpo estilo personal trainer com metadados unboxed + botões táteis >= 40px */}
      <div className={`relative w-full bg-[#F8FAF9] ${heightClass}`}>
        {/* Metadado superior esquerdo limpo sem pílulas poluídas */}
        <div className="pointer-events-none absolute left-4 top-3.5 z-10 flex flex-col gap-0.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#1E2923] tabular-nums">
            <span>{stepCounterLabel || `Rep ${repCount}`}</span>
            <span aria-hidden="true" className="text-[#94A39B]">
              ·
            </span>
            <span className="text-[#16A34A]">{spec.phase_labels[phaseIdx] || spec.phase_labels[0]}</span>
          </div>
          <span className="text-[11px] font-medium text-[#64746B]">{muscleGroup}</span>
        </div>

        {/* Botões circulares top-right >= 40px (Áudio + Alternar para 3D) */}
        <div className="absolute right-3.5 top-3 z-10 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setVoiceActive((v) => !v)}
            className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition-colors ${
              voiceActive
                ? 'border-[#16A34A] bg-[#22C55E] text-[#051209]'
                : 'border-[#DCE5DF] bg-white text-[#16A34A] hover:bg-[#ECFDF5]'
            }`}
            title={voiceActive ? 'Silenciar dica por voz' : 'Ouvir instrução por voz'}
            aria-label={voiceActive ? 'Silenciar dica por voz' : 'Ouvir instrução por voz'}
          >
            {voiceActive ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          {onSwitchTo3D && (
            <button
              type="button"
              onClick={onSwitchTo3D}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#DCE5DF] bg-white text-[#16A34A] shadow-sm transition-colors hover:bg-[#ECFDF5]"
              title="Ver no modelo 3D interativo"
              aria-label="Ver no modelo 3D interativo"
            >
              <Camera className="h-4 w-4" />
            </button>
          )}
        </div>

        <svg
          viewBox="0 0 420 285"
          className="h-full w-full select-none"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Demonstração animada de ${exerciseName}`}
        >
          {/* Linha de piso sutil estilo estúdio */}
          <line
            ref={floorLineRef}
            x1="44"
            y1="260"
            x2="376"
            y2="260"
            stroke="#BAE6FD"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Sombra suave de contato */}
          <ellipse ref={shadowRef} cx="210" cy="264" rx="58" ry="5.5" fill="#0F172A" opacity="0.08" />

          {/* Colchonete de treino (para exercícios no solo) */}
          <rect
            ref={matRef}
            x="64"
            y="245"
            width="292"
            height="7"
            rx="3.5"
            fill="#BBF7D0"
            stroke="#16A34A"
            strokeWidth="1.2"
            visibility="hidden"
          />

          {/* Banco / Apoio */}
          <g ref={benchGroupRef} visibility="hidden">
            <rect x="-34" y="0" width="68" height="9" rx="4" fill="#334139" />
            <rect x="-26" y="9" width="6.5" height="54" rx="2" fill="#64748B" />
            <rect x="19.5" y="9" width="6.5" height="54" rx="2" fill="#64748B" />
          </g>

          {/* Atleta humano vetorial com silhueta limpa */}
          <g ref={athleteRootRef}>
            {/* 1. Braço de trás */}
            <path ref={backArmPathRef} fill="#DFAA88" />
            <path ref={backHandPathRef} fill="#D59D79" />
            <g ref={backDumbbellRef} visibility="hidden">
              <rect x="-2.5" y="-12" width="5" height="24" rx="2" fill="#475569" />
              <rect x="-7.5" y="-15" width="15" height="6.5" rx="2" fill="#1E293B" />
              <rect x="-7.5" y="8.5" width="15" height="6.5" rx="2" fill="#1E293B" />
            </g>

            {/* 2. Perna de trás (tom grafite levemente sombreado para profundidade) */}
            <path ref={backLegPathRef} fill="#252C28" />
            <path ref={backShoeSoleRef} fill="#E2E8F0" />
            <path ref={backShoeUpperRef} fill="#15803D" />
            <path ref={backShoeAccentRef} fill="none" stroke="#86EFAC" strokeWidth="1.2" strokeLinecap="round" />

            {/* 3. Tronco contínuo + Perna da frente com a mesma cor da legging para fusão anatômica limpa */}
            <path ref={torsoSkinRef} fill="#EEBE9E" />
            <path ref={torsoBottomsRef} fill="#343D38" />
            <path ref={frontLegPathRef} fill="#343D38" />
            <path ref={torsoTopRef} fill="#22C55E" />
            <path ref={torsoTopAccentRef} fill="#16A34A" />

            {/* 4. Tênis da frente */}
            <path ref={frontShoeSoleRef} fill="#F1F5F9" />
            <path ref={frontShoeUpperRef} fill="#22C55E" />
            <path ref={frontShoeAccentRef} fill="none" stroke="#DCFCE7" strokeWidth="1.2" strokeLinecap="round" />

            {/* 5. Pescoço + Cabeça humana esculpida (perfil limpo ou frente simétrica) */}
            <path ref={neckPathRef} fill="#E4AE8C" />
            <g ref={headGroupRef}>
              {/* Cabeça de perfil voltada para +X */}
              <g ref={headProfileRef}>
                {/* Rabo de cavalo fluido */}
                <g ref={ponytailGroupRef}>
                  <path
                    d="M -8.5 -4.5 C -16 -9.5, -23 -3, -21 6.5 C -20 13, -23.5 17.5, -26.5 18.5 C -20 19.5, -13.5 13.5, -12.5 5 C -12.2 0.5, -9.5 -1.5, -7.5 -2 Z"
                    fill="#4A3228"
                  />
                  <rect x="-10.5" y="-6" width="2.8" height="4.8" rx="1.4" transform="rotate(-18 -9.1 -3.6)" fill="#22C55E" />
                </g>
                {/* Crânio, testa, perfil limpo de nariz e queixo (curva contínua estilo referência) */}
                <path
                  d="M -5.5 9.5 C -8.8 6, -9.8 1, -9 -5 C -8 -12.8, 0 -16.5, 6.8 -14.5 C 10.6 -13.2, 11.4 -8, 11.6 -4.5 C 12.6 -2.2, 14.0 -0.2, 13.6 0.8 C 13.3 1.7, 11.9 2.0, 11.7 3.0 C 11.8 4.4, 11.5 5.4, 11.1 6.8 C 10.7 9.4, 8.8 10.8, 5.2 11.0 C 1.2 11.2, -2.5 10.6, -5.5 9.5 Z"
                  fill="#EEBE9E"
                />
                {/* Cabelo no topo com franja lateral suave */}
                <path
                  d="M -9.8 -2.2 C -10.5 -11.8, -2.8 -17.6, 6.4 -16.2 C 10.5 -15.4, 12.0 -12.4, 10.8 -10.2 C 8.4 -12.0, 4.4 -12.0, 1.4 -8.6 C -1.2 -5.8, -2.0 -1.8, -4.2 0.2 C -6.0 1.8, -9.2 1.6, -9.8 -2.2 Z"
                  fill="#4A3228"
                />
              </g>

              {/* Cabeça frontal para exercícios de frente (Jumping Jack, Sumô) */}
              <g ref={headFrontRef} visibility="hidden">
                {/* Coque/rabo de cavalo no topo */}
                <ellipse cx="0" cy="-16.5" rx="6.2" ry="4.5" fill="#4A3228" />
                {/* Orelhas */}
                <ellipse cx="-10.2" cy="-1" rx="1.8" ry="3.2" fill="#DFAA88" />
                <ellipse cx="10.2" cy="-1" rx="1.8" ry="3.2" fill="#DFAA88" />
                {/* Rosto oval */}
                <path
                  d="M -9.5 -4 C -9.5 -13.5, 9.5 -13.5, 9.5 -4 C 9.5 4.5, 5.4 11.5, 0 12 C -5.4 11.5, -9.5 4.5, -9.5 -4 Z"
                  fill="#EEBE9E"
                />
                {/* Cabelo dividido */}
                <path
                  d="M -10.4 -2 C -11 -12.5, -5.5 -16.8, 0 -16.8 C 5.5 -16.8, 11 -12.5, 10.4 -2 C 8.5 -8.5, 4.5 -11.5, 0 -10.2 C -4.5 -11.5, -8.5 -8.5, -10.4 -2 Z"
                  fill="#4A3228"
                />
                {/* Traços faciais limpos */}
                <path d="M -5.2 -3.2 Q -3.4 -4.0 -1.8 -3.2" fill="none" stroke="#5C4033" strokeWidth="1.1" strokeLinecap="round" />
                <path d="M 1.8 -3.2 Q 3.4 -4.0 5.2 -3.2" fill="none" stroke="#5C4033" strokeWidth="1.1" strokeLinecap="round" />
              </g>
            </g>

            {/* 6. Braço da frente */}
            <path ref={frontArmPathRef} fill="#EEBE9E" />
            <path ref={frontHandPathRef} fill="#EEBE9E" />
            <g ref={frontDumbbellRef} visibility="hidden">
              <rect x="-2.5" y="-13" width="5" height="26" rx="2" fill="#64748B" />
              <rect x="-8" y="-16" width="16" height="6.5" rx="2" fill="#0F172A" />
              <rect x="-8" y="9.5" width="16" height="6.5" rx="2" fill="#0F172A" />
            </g>

            {/* 7. Seta guia de movimento suave */}
            <path
              ref={arrowPathRef}
              fill="none"
              stroke="#38BDF8"
              strokeWidth="3.6"
              strokeLinecap="round"
              opacity="0.88"
              visibility="hidden"
            />
            <polygon
              ref={arrowTipRef}
              points="-5,-5.5 7,0 -5,5.5"
              fill="#38BDF8"
              opacity="0.92"
              visibility="hidden"
            />
          </g>
        </svg>
      </div>

      {/* Caixa de orientação postural harmônica com tema PRATO & TREINO */}
      <div className="flex items-center gap-3 border-t border-white/8 bg-[#121915] px-4 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#38BDF8]/12 text-[#38BDF8]">
          <UserRound className="h-4 w-4" />
        </span>
        <p className="flex-1 text-xs font-medium leading-snug text-[#D8E2DC]">
          {coachTip}
        </p>
      </div>

      {/* Dock de controle */}
      {showControls && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 bg-[#0D1310] px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleTogglePlay}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#22C55E] px-3 py-1.5 text-xs font-semibold text-[#06120A] transition-colors hover:bg-[#16A34A]"
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing ? 'Pausar' : 'Reproduzir'}
            </button>

            <button
              type="button"
              onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 font-mono text-xs text-[#C2CCC6] hover:bg-white/5"
            >
              <Gauge className="h-3.5 w-3.5 text-[#22C55E]" />
              {speed === 0.5 ? '0.5x' : '1.0x'}
            </button>
          </div>

          {onSwitchTo3D && (
            <button
              type="button"
              onClick={onSwitchTo3D}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-[#C2CCC6] hover:bg-white/5"
            >
              <Box className="h-3.5 w-3.5 text-[#22C55E]" />
              Ver em 3D
            </button>
          )}
        </div>
      )}
    </div>
  );
}
