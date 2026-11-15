import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Camera, Download, Gauge, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import type { ExerciseTutorialSpec, PoseJoint2D, SkeletonPose2D } from '../types';
import { getPoseForSpec } from '../utils/exerciseTutorials';

type CameraViewPreset = 'studio' | 'side' | 'front';

interface ThreeExerciseDemoProps {
  exerciseName: string;
  muscleGroup: string;
  spec: ExerciseTutorialSpec;
  playing?: boolean;
  onTogglePlaying?: () => void;
  showControls?: boolean;
  heightClass?: string;
}

function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    let isSoft = false;
    if (ext) {
      const renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
      isSoft = /SwiftShader|llvmpipe|Software|Mesa/i.test(renderer);
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return isSoft;
  } catch {
    return true;
  }
}

// Pré-alocados no módulo para zero alocação dentro do loop RAF
const _upVec = new THREE.Vector3(0, 1, 0);
const _dirVec = new THREE.Vector3();
const _midVec = new THREE.Vector3();
const _camTargetPos = new THREE.Vector3();
const _vHead = new THREE.Vector3();
const _vNeck = new THREE.Vector3();
const _vHip = new THREE.Vector3();
const _vShoulderL = new THREE.Vector3();
const _vShoulderR = new THREE.Vector3();
const _vElbowL = new THREE.Vector3();
const _vElbowR = new THREE.Vector3();
const _vWristL = new THREE.Vector3();
const _vWristR = new THREE.Vector3();
const _vHipL = new THREE.Vector3();
const _vHipR = new THREE.Vector3();
const _vKneeL = new THREE.Vector3();
const _vKneeR = new THREE.Vector3();
const _vAnkleL = new THREE.Vector3();
const _vAnkleR = new THREE.Vector3();
const _vPelvisMid = new THREE.Vector3();

function mapJointTo3D(joint: PoseJoint2D, zOffset: number, out: THREE.Vector3): THREE.Vector3 {
  const scale = 2.55;
  const x = (joint.x - 0.5) * scale;
  const y = Math.max(0.05, (0.85 - joint.y) * scale + 0.03);
  out.set(x, y, zOffset);
  return out;
}

function orientLimbMesh(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, baseHeight: number) {
  _dirVec.subVectors(b, a);
  const len = Math.max(0.03, _dirVec.length());
  _midVec.addVectors(a, b).multiplyScalar(0.5);
  mesh.position.copy(_midVec);
  _dirVec.normalize();
  mesh.quaternion.setFromUnitVectors(_upVec, _dirVec);
  mesh.scale.set(1, len / baseHeight, 1);
}

export function ThreeExerciseDemo({
  exerciseName,
  muscleGroup,
  spec,
  playing: externalPlaying,
  onTogglePlaying,
  showControls = true,
  heightClass = 'h-72 sm:h-80',
}: ThreeExerciseDemoProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [internalPlaying, setInternalPlaying] = useState(true);
  const playing = externalPlaying !== undefined ? externalPlaying : internalPlaying;

  const [speed, setSpeed] = useState<0.5 | 1>(1);
  const [cameraPreset, setCameraPreset] = useState<CameraViewPreset>('studio');
  const [voiceActive, setVoiceActive] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [phaseIdx, setPhaseIdx] = useState<0 | 1 | 2>(0);
  const [repCount, setRepCount] = useState(1);
  const [webglFallback, setWebglFallback] = useState(false);

  const specRef = useRef(spec);
  specRef.current = spec;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const cameraPresetRef = useRef(cameraPreset);
  const presetTransitionRef = useRef(0);
  const resetCycleRef = useRef(false);
  useEffect(() => {
    cameraPresetRef.current = cameraPreset;
    presetTransitionRef.current = 30;
  }, [cameraPreset]);

  const activeZoneSet = useMemo(
    () => new Set(spec.target_zones.map((z) => z.toLowerCase())),
    [spec.target_zones]
  );

  // Reiniciar ciclo e preset suave quando muda o exercício
  useEffect(() => {
    setCameraPreset('studio');
    presetTransitionRef.current = 30;
    resetCycleRef.current = true;
    setRepCount(1);
  }, [exerciseName, spec.archetype]);

  // Narração rápida do exercício no visualizador 3D
  useEffect(() => {
    if (!voiceActive || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    window.speechSynthesis.cancel();
    const script = `${exerciseName}. ${spec.preparation}. Passo 1: ${spec.steps[0] || ''}. ${spec.breathing}. Atenção: ${spec.common_mistake}`;
    const utterance = new SpeechSynthesisUtterance(script);
    utterance.lang = 'pt-BR';
    utterance.rate = speed === 0.5 ? 0.92 : 1.05;
    utterance.onend = () => setVoiceActive(false);
    utterance.onerror = () => setVoiceActive(false);
    window.speechSynthesis.speak(utterance);

    return () => {
      window.speechSynthesis.cancel();
    };
  }, [voiceActive, exerciseName, spec, speed]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftGl,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true, // garante captura WebM nítida
      });
    } catch {
      setWebglFallback(true);
      return;
    }

    rendererCanvasRef.current = renderer.domElement;
    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 260);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoftGl ? 1 : 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090E0B');
    scene.fog = new THREE.FogExp2('#090E0B', 0.085);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    const envTarget = pmrem.fromScene(envScene, 0.04);
    scene.environment = envTarget.texture;
    envScene.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 40);
    camera.position.set(1.65, 1.45, 2.55);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 1.6;
    controls.maxDistance = 5.0;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(0, 0.85, 0);

    // Iluminação 3-point Studio Atlética
    const hemiLight = new THREE.HemisphereLight('#E6F4EC', '#121B15', 0.9);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#FFF5E8', 2.4);
    keyLight.position.set(2.5, 4.2, 2.8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(isSoftGl ? 512 : 1024, isSoftGl ? 512 : 1024);
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 12;
    keyLight.shadow.camera.left = -2.5;
    keyLight.shadow.camera.right = 2.5;
    keyLight.shadow.camera.top = 2.5;
    keyLight.shadow.camera.bottom = -2.5;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#22C55E', 1.45);
    rimLight.position.set(-2.6, 2.2, -2.4);
    scene.add(rimLight);

    // Piso do Estúdio + Plataforma Circular
    const floorGeo = new THREE.CircleGeometry(6, 48);
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#0E1511',
      roughness: 0.78,
      metalness: 0.08,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const ringGeo = new THREE.RingGeometry(1.15, 1.19, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#22C55E',
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.004;
    scene.add(ringMesh);

    const outerRingGeo = new THREE.RingGeometry(1.78, 1.8, 64);
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: '#FFFFFF',
      transparent: true,
      opacity: 0.07,
      side: THREE.DoubleSide,
    });
    const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.003;
    scene.add(outerRing);

    // Sombra de contato dinâmica
    const shadowGeo = new THREE.CircleGeometry(0.55, 24);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0.38,
    });
    const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.005;
    scene.add(contactShadow);

    // Equipamentos de Estúdio (Mat, Banco, Halteres)
    const matGeo = new THREE.BoxGeometry(2.1, 0.024, 0.85);
    const matMat = new THREE.MeshStandardMaterial({
      color: '#16281E',
      roughness: 0.85,
      metalness: 0.05,
    });
    const yogaMat = new THREE.Mesh(matGeo, matMat);
    yogaMat.position.set(0, 0.012, 0);
    yogaMat.receiveShadow = true;
    yogaMat.visible = false;
    scene.add(yogaMat);

    const benchGroup = new THREE.Group();
    const benchTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.07, 0.48),
      new THREE.MeshStandardMaterial({ color: '#1F2B24', roughness: 0.6, metalness: 0.2 })
    );
    benchTop.position.set(-0.62, 0.45, 0);
    benchTop.castShadow = true;
    benchTop.receiveShadow = true;
    benchGroup.add(benchTop);
    const benchLegMat = new THREE.MeshStandardMaterial({ color: '#607067', roughness: 0.35, metalness: 0.7 });
    [
      [-0.86, 0.22, -0.18],
      [-0.86, 0.22, 0.18],
      [-0.38, 0.22, -0.18],
      [-0.38, 0.22, 0.18],
    ].forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.44, 10), benchLegMat);
      leg.position.set(lx, ly, lz);
      leg.castShadow = true;
      benchGroup.add(leg);
    });
    benchGroup.visible = false;
    scene.add(benchGroup);

    function createDumbbellMesh(): THREE.Group {
      const g = new THREE.Group();
      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.016, 0.22, 10),
        new THREE.MeshStandardMaterial({ color: '#C2CCC6', metalness: 0.85, roughness: 0.22 })
      );
      bar.rotation.x = Math.PI / 2;
      g.add(bar);
      const plateMat = new THREE.MeshStandardMaterial({ color: '#19221C', roughness: 0.45, metalness: 0.3 });
      const accentPlateMat = new THREE.MeshStandardMaterial({
        color: '#22C55E',
        emissive: '#166534',
        emissiveIntensity: 0.25,
        roughness: 0.4,
      });
      [-0.085, 0.085].forEach((zOff) => {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.032, 6), plateMat);
        plate.rotation.x = Math.PI / 2;
        plate.position.z = zOff;
        plate.castShadow = true;
        g.add(plate);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.036, 6), accentPlateMat);
        cap.rotation.x = Math.PI / 2;
        cap.position.z = zOff;
        g.add(cap);
      });
      g.visible = false;
      return g;
    }

    const dumbbellL = createDumbbellMesh();
    const dumbbellR = createDumbbellMesh();
    scene.add(dumbbellL);
    scene.add(dumbbellR);

    // Materiais Anatômicos Esculpidos (Corpo Atlética Dark Slate + Músculo Ativado Esmeralda)
    const skinMat = new THREE.MeshStandardMaterial({
      color: '#D4DED8',
      roughness: 0.45,
      metalness: 0.08,
    });
    const suitBaseMat = new THREE.MeshStandardMaterial({
      color: '#222D27',
      roughness: 0.55,
      metalness: 0.14,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: '#22C55E',
      emissive: '#16A34A',
      emissiveIntensity: 0.28,
      roughness: 0.35,
      metalness: 0.25,
    });
    const shoeMat = new THREE.MeshStandardMaterial({
      color: '#111613',
      roughness: 0.55,
      metalness: 0.15,
    });

    // Materiais por Grupo Muscular (permitem destaque individualizado!)
    const makeZoneMaterial = () =>
      new THREE.MeshStandardMaterial({
        color: '#2E3B34',
        emissive: '#000000',
        emissiveIntensity: 0,
        roughness: 0.48,
        metalness: 0.15,
      });

    const torsoMat = makeZoneMaterial(); // core / abs / back / chest
    const chestMat = makeZoneMaterial();
    const armsMat = makeZoneMaterial();
    const legsMat = makeZoneMaterial();
    const gluteMat = makeZoneMaterial();

    const athlete = new THREE.Group();
    scene.add(athlete);

    // Cabeça esculpida + Visor esportivo
    const headGroup = new THREE.Group();
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.115, 22, 18), skinMat);
    headMesh.scale.set(0.92, 1.08, 0.98);
    headMesh.castShadow = true;
    headGroup.add(headMesh);
    const headband = new THREE.Mesh(new THREE.TorusGeometry(0.106, 0.012, 8, 24), trimMat);
    headband.rotation.x = Math.PI / 2;
    headband.position.y = 0.032;
    headGroup.add(headband);
    athlete.add(headGroup);

    // Pescoço
    const neckGeo = new THREE.CylinderGeometry(0.044, 0.05, 1, 14);
    const neckMesh = new THREE.Mesh(neckGeo, skinMat);
    neckMesh.castShadow = true;
    athlete.add(neckMesh);

    // Tronco Superior Muscular (Tórax + Peitoral + Dorsais)
    const upperTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.115, 1, 18), chestMat);
    upperTorso.scale.set(1.0, 1, 0.68);
    upperTorso.castShadow = true;
    athlete.add(upperTorso);

    // Core / Abdômen Esculpido
    const lowerTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.114, 0.125, 1, 16), torsoMat);
    lowerTorso.scale.set(0.96, 1, 0.68);
    lowerTorso.castShadow = true;
    athlete.add(lowerTorso);

    // Pelve / Glúteos Esculpidos
    const pelvisMesh = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 14), gluteMat);
    pelvisMesh.scale.set(1.05, 0.78, 0.76);
    pelvisMesh.castShadow = true;
    athlete.add(pelvisMesh);

    // Ombros (Deltoides), Cotovelos, Joelhos
    const jointSphereGeo = new THREE.SphereGeometry(0.062, 16, 12);
    const shoulderCapL = new THREE.Mesh(jointSphereGeo, armsMat);
    const shoulderCapR = new THREE.Mesh(jointSphereGeo, armsMat);
    const elbowCapL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), suitBaseMat);
    const elbowCapR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), suitBaseMat);
    const kneeCapL = new THREE.Mesh(new THREE.SphereGeometry(0.058, 14, 12), legsMat);
    const kneeCapR = new THREE.Mesh(new THREE.SphereGeometry(0.058, 14, 12), legsMat);
    [shoulderCapL, shoulderCapR, elbowCapL, elbowCapR, kneeCapL, kneeCapR].forEach((m) => {
      m.castShadow = true;
      athlete.add(m);
    });

    // Membros Musculares Afunilados (Bíceps/Tríceps, Antebraços, Coxas, Panturrilhas)
    const upperArmGeo = new THREE.CylinderGeometry(0.054, 0.043, 1, 14);
    const forearmGeo = new THREE.CylinderGeometry(0.042, 0.032, 1, 12);
    const thighGeo = new THREE.CylinderGeometry(0.086, 0.058, 1, 16);
    const calfGeo = new THREE.CylinderGeometry(0.056, 0.038, 1, 14);

    const upperArmL = new THREE.Mesh(upperArmGeo, armsMat);
    const upperArmR = new THREE.Mesh(upperArmGeo, armsMat);
    const forearmL = new THREE.Mesh(forearmGeo, skinMat);
    const forearmR = new THREE.Mesh(forearmGeo, skinMat);
    const thighL = new THREE.Mesh(thighGeo, legsMat);
    const thighR = new THREE.Mesh(thighGeo, legsMat);
    const calfL = new THREE.Mesh(calfGeo, legsMat);
    const calfR = new THREE.Mesh(calfGeo, legsMat);

    [upperArmL, upperArmR, forearmL, forearmR, thighL, thighR, calfL, calfR].forEach((m) => {
      m.castShadow = true;
      athlete.add(m);
    });

    // Mãos e Tênis Esportivos
    const handGeo = new THREE.SphereGeometry(0.038, 12, 10);
    const handL = new THREE.Mesh(handGeo, skinMat);
    const handR = new THREE.Mesh(handGeo, skinMat);

    function createShoeMesh(): THREE.Group {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.058, 0.085), shoeMat);
      body.position.set(0.025, 0.029, 0);
      body.castShadow = true;
      g.add(body);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.116, 0.016, 0.09), trimMat);
      sole.position.set(0.025, 0.008, 0);
      g.add(sole);
      return g;
    }

    const footL = createShoeMesh();
    const footR = createShoeMesh();
    athlete.add(handL, handR, footL, footR);

    let rafId = 0;
    let lastTime = performance.now();
    let cycle = 0;
    let reps = 1;
    let lastShownPhase: 0 | 1 | 2 = 0;
    let disposed = false;

    const applyHighlightZones = (zones: Set<string>, pulseTime: number) => {
      const pulse = 0.38 + 0.22 * Math.sin(pulseTime * 3.5);
      const setHighlight = (mat: THREE.MeshStandardMaterial, active: boolean) => {
        if (active) {
          mat.color.set('#3A5A46');
          mat.emissive.set('#22C55E');
          mat.emissiveIntensity = pulse;
        } else {
          mat.color.set('#27322C');
          mat.emissive.set('#000000');
          mat.emissiveIntensity = 0;
        }
      };
      setHighlight(chestMat, zones.has('chest') || zones.has('shoulders'));
      setHighlight(torsoMat, zones.has('core') || zones.has('abs') || zones.has('back'));
      setHighlight(gluteMat, zones.has('glutes'));
      setHighlight(legsMat, zones.has('quadriceps') || zones.has('legs') || zones.has('calves'));
      setHighlight(armsMat, zones.has('arms') || zones.has('shoulders'));
    };

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

      const { pose, phaseIndex, viewType, prop } = getPoseForSpec(curSpec, cycle);
      if (phaseIndex !== lastShownPhase) {
        lastShownPhase = phaseIndex;
        setPhaseIdx(phaseIndex);
      }

      // Atualizar iluminação dos grupos musculares
      const curZones = new Set(curSpec.target_zones.map((z) => z.toLowerCase()));
      applyHighlightZones(curZones, now / 1000);

      // Props visíveis de acordo com o exercício
      yogaMat.visible = prop === 'mat';
      benchGroup.visible = prop === 'chair_back' || prop === 'bench';
      dumbbellL.visible = prop === 'dumbbells';
      dumbbellR.visible = prop === 'dumbbells';

      // Espaçamento bilateral 3D realista no eixo Z (se visão lateral) ou X (se frontal)
      const isSide = viewType === 'side';
      const zShoulder = isSide ? 0.16 : 0;
      const zArm = isSide ? 0.19 : 0.02;
      const zLeg = isSide ? 0.11 : 0.02;

      mapJointTo3D(pose.head, 0, _vHead);
      mapJointTo3D(pose.neck, 0, _vNeck);
      mapJointTo3D(pose.hip, 0, _vHip);

      mapJointTo3D(pose.shoulderL, -zShoulder, _vShoulderL);
      mapJointTo3D(pose.shoulderR, zShoulder, _vShoulderR);
      mapJointTo3D(pose.elbowL, -zArm, _vElbowL);
      mapJointTo3D(pose.elbowR, zArm, _vElbowR);
      mapJointTo3D(pose.wristL, -zArm, _vWristL);
      mapJointTo3D(pose.wristR, zArm, _vWristR);

      _vHipL.copy(_vHip).add(new THREE.Vector3(isSide ? 0 : -0.09, -0.02, -zLeg));
      _vHipR.copy(_vHip).add(new THREE.Vector3(isSide ? 0 : 0.09, -0.02, zLeg));
      mapJointTo3D(pose.kneeL, -zLeg, _vKneeL);
      mapJointTo3D(pose.kneeR, zLeg, _vKneeR);
      mapJointTo3D(pose.ankleL, -zLeg, _vAnkleL);
      mapJointTo3D(pose.ankleR, zLeg, _vAnkleR);

      // Ponto médio do tronco
      _vPelvisMid.lerpVectors(_vHip, _vNeck, 0.45);

      headGroup.position.copy(_vHead);
      // Inclinação leve da cabeça acompanhando o pescoço
      _dirVec.subVectors(_vHead, _vNeck).normalize();
      headGroup.quaternion.setFromUnitVectors(_upVec, _dirVec);

      orientLimbMesh(neckMesh, _vNeck, _vHead, 1);
      orientLimbMesh(upperTorso, _vPelvisMid, _vNeck, 1);
      orientLimbMesh(lowerTorso, _vHip, _vPelvisMid, 1);
      pelvisMesh.position.copy(_vHip);

      // Se vista frontal, alarga levemente o tronco no X; se lateral, profundidade no Z
      if (isSide) {
        upperTorso.scale.x = 0.72;
        upperTorso.scale.z = 1.15;
        lowerTorso.scale.x = 0.72;
        lowerTorso.scale.z = 1.05;
        pelvisMesh.scale.set(0.82, 0.78, 1.15);
      } else {
        upperTorso.scale.x = 1.15;
        upperTorso.scale.z = 0.72;
        lowerTorso.scale.x = 1.05;
        lowerTorso.scale.z = 0.72;
        pelvisMesh.scale.set(1.15, 0.78, 0.82);
      }

      shoulderCapL.position.copy(_vShoulderL);
      shoulderCapR.position.copy(_vShoulderR);
      elbowCapL.position.copy(_vElbowL);
      elbowCapR.position.copy(_vElbowR);
      kneeCapL.position.copy(_vKneeL);
      kneeCapR.position.copy(_vKneeR);

      orientLimbMesh(upperArmL, _vShoulderL, _vElbowL, 1);
      orientLimbMesh(upperArmR, _vShoulderR, _vElbowR, 1);
      orientLimbMesh(forearmL, _vElbowL, _vWristL, 1);
      orientLimbMesh(forearmR, _vElbowR, _vWristR, 1);

      orientLimbMesh(thighL, _vHipL, _vKneeL, 1);
      orientLimbMesh(thighR, _vHipR, _vKneeR, 1);
      orientLimbMesh(calfL, _vKneeL, _vAnkleL, 1);
      orientLimbMesh(calfR, _vKneeR, _vAnkleR, 1);

      handL.position.copy(_vWristL);
      handR.position.copy(_vWristR);

      footL.position.set(_vAnkleL.x, Math.max(0.01, _vAnkleL.y - 0.045), _vAnkleL.z);
      footR.position.set(_vAnkleR.x, Math.max(0.01, _vAnkleR.y - 0.045), _vAnkleR.z);

      if (prop === 'dumbbells') {
        dumbbellL.position.copy(_vWristL);
        dumbbellR.position.copy(_vWristR);
      }

      // Sombra de contato segue o quadril
      contactShadow.position.x = _vHip.x;
      const spread = Math.max(0.75, Math.abs(_vAnkleL.x - _vAnkleR.x) * 1.1 + 0.65);
      contactShadow.scale.set(spread, 1, 0.85);

      // Suavização de câmera apenas durante transição de preset (depois libera OrbitControls)
      if (presetTransitionRef.current > 0) {
        const preset = cameraPresetRef.current;
        if (preset === 'side') {
          if (isSide) {
            _camTargetPos.set(0.15, 1.05, 3.05);
          } else {
            _camTargetPos.set(3.0, 1.1, 0.25);
          }
        } else if (preset === 'front') {
          if (isSide) {
            _camTargetPos.set(2.9, 1.15, 0.35);
          } else {
            _camTargetPos.set(0, 1.12, 2.95);
          }
        } else {
          _camTargetPos.set(1.55, 1.4, 2.55);
        }
        camera.position.lerp(_camTargetPos, 0.14);
        presetTransitionRef.current -= 1;
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftGl) {
        setTimeout(() => {
          if (!disposed) rafId = requestAnimationFrame(tick);
        }, 32);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);

    const handleResize = () => {
      if (!container || disposed) return;
      const w = Math.max(container.clientWidth, 320);
      const h = Math.max(container.clientHeight, 260);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      controls.dispose();
      pmrem.dispose();
      envTarget.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
      renderer.dispose();
      rendererCanvasRef.current = null;
    };
  }, []);

  // Aplicar preset de câmera quando o usuário clica no botão de ângulo
  useEffect(() => {
    // Re-trigger é feito no ref + animação leve quando o usuário altera preset;
    // Reset simples usando ResizeObserver/OrbitControls não reinicia o modelo!
  }, [cameraPreset]);

  const handleTogglePlay = () => {
    if (onTogglePlaying) {
      onTogglePlaying();
    } else {
      setInternalPlaying((p) => !p);
    }
  };

  const handleCycleCamera = () => {
    setCameraPreset((prev) => (prev === 'studio' ? 'side' : prev === 'side' ? 'front' : 'studio'));
  };

  const handleDownloadVideo = async () => {
    const canvas = rendererCanvasRef.current;
    if (!canvas) return;
    if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
      setExportNote('Seu navegador atual não suporta gravação direta em WebM.');
      return;
    }

    setExporting(true);
    setExportNote(null);

    try {
      const stream = canvas.captureStream(30);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      const durationMs = Math.min(7000, Math.max(4000, Math.round(spec.tempo_seconds * 2 * 1000)));
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safeName = exerciseName
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-');
        a.href = url;
        a.download = `treino-3d-${safeName}.webm`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        setExporting(false);
        setExportNote('Demonstração 3D (.webm) exportada com sucesso.');
      };

      recorder.start(200);
      setTimeout(() => {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      }, durationMs);
    } catch {
      setExporting(false);
      setExportNote('Não foi possível gravar o vídeo neste navegador.');
    }
  };

  if (webglFallback) {
    return (
      <div className={`flex ${heightClass} flex-col items-center justify-center rounded-xl border border-white/10 bg-[#0A0F0C] p-6 text-center`}>
        <p className="text-sm font-semibold text-[#F4F7F5]">{exerciseName}</p>
        <p className="mt-2 max-w-md text-xs text-[#9AA8A0]">{spec.preparation}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#090E0B]">
        {/* Top Overlay HUD (sem backdrop-blur sobre WebGL!) */}
        <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex items-center justify-between gap-2">
          <div className="rounded-lg bg-[#090E0B]/85 px-3 py-1.5">
            <p className="text-[10px] font-semibold tracking-wider text-[#22C55E] uppercase">
              Modelo 3D · {muscleGroup}
            </p>
            <p className="text-xs font-semibold text-[#F4F7F5]">{exerciseName}</p>
          </div>
          <div className="rounded-lg bg-[#090E0B]/85 px-2.5 py-1 text-right font-mono text-[11px] text-[#C2CCC6] tabular-nums">
            <div>REP #{repCount}</div>
            <div className="text-[10px] text-[#22C55E]">FASE {phaseIdx + 1}/3</div>
          </div>
        </div>

        {/* Viewport Three.js WebGL isolado */}
        <div ref={mountRef} className={`w-full cursor-grab active:cursor-grabbing ${heightClass}`} />

        {/* Legenda biomecânica ativa no rodapé do vídeo */}
        <div className="pointer-events-none absolute bottom-12 left-3 right-3 z-10 flex items-center justify-between gap-2">
          <div className="rounded-lg bg-[#090E0B]/88 px-3 py-1 text-xs text-[#F4F7F5]">
            <span className="mr-2 font-mono text-[11px] font-semibold text-[#22C55E]">
              {spec.phase_labels[phaseIdx] || spec.phase_labels[0]}
            </span>
          </div>
          {activeZoneSet.size > 0 && (
            <div className="hidden rounded-lg bg-[#090E0B]/85 px-2.5 py-1 text-[10px] text-[#9AA8A0] sm:block">
              Músculos ativos destacados em verde
            </div>
          )}
        </div>

        {/* Dock de controles consolidado abaixo do viewport */}
        {showControls && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 bg-[#0E1410] px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleTogglePlay}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#22C55E] px-2.5 py-1.5 text-xs font-semibold text-[#06120A] transition-colors hover:bg-[#16A34A]"
              >
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {playing ? 'Pausar' : 'Reproduzir'}
              </button>

              <button
                type="button"
                onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 font-mono text-xs text-[#C2CCC6] hover:bg-white/5"
              >
                <Gauge className="h-3.5 w-3.5 text-[#22C55E]" />
                {speed === 0.5 ? '0.5x' : '1.0x'}
              </button>

              <button
                type="button"
                onClick={handleCycleCamera}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-[#C2CCC6] hover:bg-white/5"
                title="Arraste no 3D para girar livremente"
              >
                <Camera className="h-3.5 w-3.5 text-[#22C55E]" />
                {cameraPreset === 'studio' ? '3/4' : cameraPreset === 'side' ? 'Lateral' : 'Frontal'}
              </button>

              <button
                type="button"
                onClick={() => setVoiceActive((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs ${
                  voiceActive
                    ? 'border-[#22C55E]/50 bg-[#22C55E]/15 text-[#22C55E]'
                    : 'border-white/10 text-[#C2CCC6] hover:bg-white/5'
                }`}
              >
                {voiceActive ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                Áudio
              </button>
            </div>

            <button
              type="button"
              onClick={handleDownloadVideo}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-[#C2CCC6] hover:bg-white/5 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5 text-[#22C55E]" />
              {exporting ? 'Gravando...' : 'Baixar vídeo'}
            </button>
          </div>
        )}
      </div>

      {exportNote && (
        <p className="rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/10 px-3 py-1.5 text-xs text-[#22C55E]">
          {exportNote}
        </p>
      )}
    </div>
  );
}
