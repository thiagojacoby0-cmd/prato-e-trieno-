import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Camera, Download, Gauge, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import type { ExerciseTutorialSpec } from '../types';
import { createEmptyPose3DState, evaluateExercisePose3D } from '../utils/exercise3DRig';

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
      isSoft = /SwiftShader|llvmpipe|softpipe|Software|Basic Render|Mesa/i.test(renderer);
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return isSoft;
  } catch {
    return true;
  }
}

/**
 * Cria geometria muscular esculpida via LatheGeometry de y=-0.5 até y=+0.5 (altura unitária 1.0).
 */
function createMuscleLimbGeometry(rBottom: number, rBelly: number, rTop: number, bellyT = 0.62): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 (bottom) -> 1 (top)
    const y = t - 0.5;
    let r: number;
    if (t <= bellyT) {
      const local = t / bellyT;
      const ease = Math.sin((local * Math.PI) / 2);
      r = THREE.MathUtils.lerp(rBottom, rBelly, ease);
    } else {
      const local = (t - bellyT) / (1 - bellyT);
      const ease = 0.5 - 0.5 * Math.cos(local * Math.PI);
      r = THREE.MathUtils.lerp(rBelly, rTop, ease);
    }
    pts.push(new THREE.Vector2(Math.max(0.004, r), y));
  }
  const geo = new THREE.LatheGeometry(pts, 18);
  geo.computeVertexNormals();
  return geo;
}

// Pré-alocados no módulo (Zero GC no loop de renderização)
const _upVec = new THREE.Vector3(0, 1, 0);
const _dirVec = new THREE.Vector3();
const _midVec = new THREE.Vector3();
const _orthoVec = new THREE.Vector3();
const _basisMat = new THREE.Matrix4();
const _camTargetPos = new THREE.Vector3();
const _footRight = new THREE.Vector3();
const _footUp = new THREE.Vector3();
const _footFwd = new THREE.Vector3();
const _pelvisLeft = new THREE.Vector3();
const _pelvisFwd = new THREE.Vector3();
const _gripAxis = new THREE.Vector3();
const _gripY = new THREE.Vector3();
const _gripZ = new THREE.Vector3();

function orientLimbSegment(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, fallbackAxis: THREE.Vector3) {
  _dirVec.subVectors(b, a);
  const len = Math.max(0.03, _dirVec.length());
  _midVec.addVectors(a, b).multiplyScalar(0.5);
  mesh.position.copy(_midVec);
  _dirVec.divideScalar(len);

  const dot = _upVec.dot(_dirVec);
  if (dot > 0.9999) {
    mesh.quaternion.identity();
  } else if (dot < -0.9999) {
    _orthoVec.copy(fallbackAxis);
    if (Math.abs(_orthoVec.y) > 0.9) _orthoVec.set(1, 0, 0);
    _orthoVec.normalize();
    mesh.quaternion.setFromAxisAngle(_orthoVec, Math.PI);
  } else {
    mesh.quaternion.setFromUnitVectors(_upVec, _dirVec);
  }
  mesh.scale.set(1, len, 1);
}

function orientByBasis(obj: THREE.Object3D, xAxis: THREE.Vector3, yAxis: THREE.Vector3, zAxis: THREE.Vector3) {
  _basisMat.makeBasis(xAxis, yAxis, zAxis);
  obj.quaternion.setFromRotationMatrix(_basisMat);
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
  const presetTransitionRef = useRef(false);
  const resetCycleRef = useRef(false);

  useEffect(() => {
    cameraPresetRef.current = cameraPreset;
    presetTransitionRef.current = true;
  }, [cameraPreset]);

  const activeZoneSet = useMemo(
    () => new Set(spec.target_zones.map((z) => z.toLowerCase())),
    [spec.target_zones]
  );

  useEffect(() => {
    setCameraPreset('studio');
    presetTransitionRef.current = true;
    resetCycleRef.current = true;
    setRepCount(1);
  }, [exerciseName, spec.archetype]);

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
        preserveDrawingBuffer: true,
      });
    } catch {
      setWebglFallback(true);
      return;
    }

    rendererCanvasRef.current = renderer.domElement;
    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 260);
    renderer.setPixelRatio(isSoftGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !isSoftGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#EFF7F3');
    scene.fog = new THREE.FogExp2('#EFF7F3', 0.06);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    const envTarget = pmrem.fromScene(envScene, 0.04);
    scene.environment = envTarget.texture;
    envScene.dispose();

    const camera = new THREE.PerspectiveCamera(39, width / height, 0.1, 40);
    camera.position.set(1.55, 1.32, 2.35);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftGl;
    controls.dampingFactor = 0.075;
    controls.enablePan = false;
    controls.minDistance = 1.45;
    controls.maxDistance = 4.6;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(0, 0.85, 0);

    const cancelPresetOnUserDrag = () => {
      presetTransitionRef.current = false;
    };
    controls.addEventListener('start', cancelPresetOnUserDrag);

    // Rig de Iluminação 3-Point Studio Atlética
    const hemiLight = new THREE.HemisphereLight('#E6FFFC', '#081719', 0.95);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#FFF6EA', 2.45);
    keyLight.position.set(2.4, 4.2, 2.8);
    keyLight.castShadow = !isSoftGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 12;
    keyLight.shadow.camera.left = -2.4;
    keyLight.shadow.camera.right = 2.4;
    keyLight.shadow.camera.top = 2.4;
    keyLight.shadow.camera.bottom = -2.4;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#00D4C4', 1.55);
    rimLight.position.set(-2.6, 2.2, -2.2);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight('#8CECE3', 0.65);
    fillLight.position.set(-1.5, 1.4, 2.4);
    scene.add(fillLight);

    // Piso Estúdio & Anéis
    const floorMesh = new THREE.Mesh(
      new THREE.CircleGeometry(6, 48),
      new THREE.MeshStandardMaterial({ color: '#E2EFE9', roughness: 0.85, metalness: 0.04 })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(1.12, 1.16, 64),
      new THREE.MeshBasicMaterial({
        color: '#12BFA3',
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      })
    );
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.004;
    scene.add(ringMesh);

    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(1.75, 1.77, 64),
      new THREE.MeshBasicMaterial({
        color: '#0F2A2A',
        transparent: true,
        opacity: 0.09,
        side: THREE.DoubleSide,
      })
    );
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.003;
    scene.add(outerRing);

    const contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 28),
      new THREE.MeshBasicMaterial({
        color: '#000000',
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.006;
    scene.add(contactShadow);

    // Colchonete de Estúdio
    const matGroup = new THREE.Group();
    const matBody = new THREE.Mesh(
      new THREE.BoxGeometry(2.15, 0.024, 0.86),
      new THREE.MeshStandardMaterial({ color: '#0D2629', roughness: 0.86, metalness: 0.05 })
    );
    matBody.position.y = 0.012;
    matBody.receiveShadow = true;
    matGroup.add(matBody);
    const matStripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.004, 0.04),
      new THREE.MeshStandardMaterial({ color: '#00D4C4', emissive: '#008F84', emissiveIntensity: 0.25, roughness: 0.5 })
    );
    matStripe.position.set(0, 0.025, 0.38);
    matGroup.add(matStripe);
    matGroup.visible = false;
    scene.add(matGroup);

    // Banco / Apoio Estúdio (posicionado dinamicamente onde mãos/pés apoiam!)
    const benchGroup = new THREE.Group();
    const benchPad = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.07, 0.56),
      new THREE.MeshStandardMaterial({ color: '#142C2F', roughness: 0.58, metalness: 0.18 })
    );
    benchPad.position.set(0, 0.455, 0);
    benchPad.castShadow = true;
    benchPad.receiveShadow = true;
    benchGroup.add(benchPad);
    const benchTrim = new THREE.Mesh(
      new THREE.BoxGeometry(0.53, 0.014, 0.57),
      new THREE.MeshStandardMaterial({ color: '#00D4C4', roughness: 0.45, metalness: 0.2 })
    );
    benchTrim.position.set(0, 0.425, 0);
    benchGroup.add(benchTrim);
    const benchLegMat = new THREE.MeshStandardMaterial({ color: '#6E8584', roughness: 0.32, metalness: 0.72 });
    [
      [-0.21, 0.215, -0.22],
      [-0.21, 0.215, 0.22],
      [0.21, 0.215, -0.22],
      [0.21, 0.215, 0.22],
    ].forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.43, 10), benchLegMat);
      leg.position.set(lx, ly, lz);
      leg.castShadow = true;
      benchGroup.add(leg);
    });
    benchGroup.visible = false;
    scene.add(benchGroup);

    function createDumbbellMesh(): THREE.Group {
      const g = new THREE.Group();
      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.24, 12),
        new THREE.MeshStandardMaterial({ color: '#C8D8D6', metalness: 0.85, roughness: 0.22 })
      );
      bar.rotation.z = Math.PI / 2;
      g.add(bar);
      const plateMat = new THREE.MeshStandardMaterial({ color: '#122426', roughness: 0.45, metalness: 0.35 });
      const accentMat = new THREE.MeshStandardMaterial({
        color: '#FDA63F',
        emissive: '#B86910',
        emissiveIntensity: 0.32,
        roughness: 0.38,
      });
      [-0.095, 0.095].forEach((xOff) => {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.034, 6), plateMat);
        plate.rotation.z = Math.PI / 2;
        plate.position.x = xOff;
        plate.castShadow = true;
        g.add(plate);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.038, 6), accentMat);
        cap.rotation.z = Math.PI / 2;
        cap.position.x = xOff;
        g.add(cap);
      });
      g.visible = false;
      return g;
    }

    const dumbbellL = createDumbbellMesh();
    const dumbbellR = createDumbbellMesh();
    scene.add(dumbbellL, dumbbellR);

    // --- MATERIAIS HUMANOS NATURAIS + ROUPA ESPORTIVA DE TREINO ---
    const skinBaseColor = new THREE.Color('#DDA885');
    const skinActiveColor = new THREE.Color('#9FE3DE');
    const fabricActiveColor = new THREE.Color('#166661');
    const shirtRestColor = new THREE.Color('#12282B');
    const shortsRestColor = new THREE.Color('#0B1B1D');

    const skinMat = new THREE.MeshPhysicalMaterial({
      color: '#DDA885',
      roughness: 0.56,
      metalness: 0.0,
      sheen: 0.25,
      sheenColor: new THREE.Color('#FFE2CE'),
      sheenRoughness: 0.72,
    });
    const hairMat = new THREE.MeshStandardMaterial({ color: '#1B1614', roughness: 0.84, metalness: 0.04 });
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: '#F4F4F2', roughness: 0.22, metalness: 0.0 });
    const irisMat = new THREE.MeshStandardMaterial({ color: '#261912', roughness: 0.14, metalness: 0.08 });
    const lipMat = new THREE.MeshStandardMaterial({ color: '#BE7E6B', roughness: 0.54, metalness: 0.0 });

    const shirtBaseMat = new THREE.MeshPhysicalMaterial({
      color: '#12282B',
      roughness: 0.78,
      metalness: 0.02,
      sheen: 0.45,
      sheenColor: new THREE.Color('#2B585E'),
      sheenRoughness: 0.68,
    });
    const shortsBaseMat = new THREE.MeshPhysicalMaterial({
      color: '#0B1B1D',
      roughness: 0.82,
      metalness: 0.02,
      sheen: 0.35,
      sheenColor: new THREE.Color('#1D3D41'),
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: '#00D4C4',
      emissive: '#00B5A6',
      emissiveIntensity: 0.28,
      roughness: 0.42,
      metalness: 0.15,
    });
    const sockMat = new THREE.MeshStandardMaterial({ color: '#E8F2F1', roughness: 0.86, metalness: 0.0 });
    const shoeUpperMat = new THREE.MeshStandardMaterial({ color: '#102224', roughness: 0.62, metalness: 0.08 });
    const shoeMidsoleMat = new THREE.MeshStandardMaterial({ color: '#E4F0EF', roughness: 0.48, metalness: 0.04 });

    const makeSkinZoneMaterial = () =>
      new THREE.MeshPhysicalMaterial({
        color: '#DDA885',
        emissive: '#000000',
        emissiveIntensity: 0,
        roughness: 0.56,
        metalness: 0.0,
        sheen: 0.22,
        sheenColor: new THREE.Color('#FFE2CE'),
      });

    const makeFabricZoneMaterial = (baseHex: string) =>
      new THREE.MeshPhysicalMaterial({
        color: baseHex,
        emissive: '#000000',
        emissiveIntensity: 0,
        roughness: 0.78,
        metalness: 0.02,
        sheen: 0.4,
        sheenColor: new THREE.Color('#285257'),
      });

    const chestMat = makeFabricZoneMaterial('#12282B');
    const backMat = makeFabricZoneMaterial('#12282B');
    const absMat = makeFabricZoneMaterial('#12282B');
    const shouldersMat = makeFabricZoneMaterial('#12282B');
    const gluteMat = makeFabricZoneMaterial('#0B1B1D');
    const legsMat = makeSkinZoneMaterial();
    const calvesMat = makeSkinZoneMaterial();
    const armsMat = makeSkinZoneMaterial();

    // Helpers de geometria orgânica humana (sem cantos retos nem aparência mecânica)
    const createLimbSliceGeometry = (
      rBottom: number,
      rBelly: number,
      rTop: number,
      yMin: number,
      yMax: number,
      bellyT = 0.58
    ): THREE.LatheGeometry => {
      const pts: THREE.Vector2[] = [new THREE.Vector2(0.002, yMin)];
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const y = THREE.MathUtils.lerp(yMin, yMax, t);
        let r: number;
        if (t <= bellyT) {
          const local = t / bellyT;
          r = THREE.MathUtils.lerp(rBottom, rBelly, Math.sin((local * Math.PI) / 2));
        } else {
          const local = (t - bellyT) / (1 - bellyT);
          r = THREE.MathUtils.lerp(rBelly, rTop, 0.5 - 0.5 * Math.cos(local * Math.PI));
        }
        pts.push(new THREE.Vector2(Math.max(0.004, r), y));
      }
      pts.push(new THREE.Vector2(0.002, yMax));
      const geo = new THREE.LatheGeometry(pts, 20);
      geo.computeVertexNormals();
      return geo;
    };

    const createSculptedTorsoGeometry = (): THREE.BufferGeometry => {
      // Malha anatômica em V suave para caixa torácica, peitoral e trapézio (camiseta justa)
      const geo = new THREE.CylinderGeometry(1, 1, 0.29, 28, 14, false);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const t = THREE.MathUtils.clamp((y + 0.145) / 0.29, 0, 1); // 0=cintura alta -> 1=ombros
        const angle = Math.atan2(z, x);
        const rNorm = Math.hypot(x, z);
        if (rNorm < 0.001) continue;

        // Largura e profundidade anatômica da caixa torácica
        let rx = THREE.MathUtils.lerp(0.118, 0.172, Math.sin(t * Math.PI * 0.62));
        let rz = THREE.MathUtils.lerp(0.088, 0.112, Math.sin(t * Math.PI * 0.65));
        if (t > 0.78) {
          // Afunila suavemente para o trapézio/gola no topo
          const topT = (t - 0.78) / 0.22;
          rx = THREE.MathUtils.lerp(rx, 0.075, topT * topT);
          rz = THREE.MathUtils.lerp(rz, 0.068, topT * topT);
        }

        // Contorno natural do peitoral (+Z) e escápulas (-Z)
        const frontFactor = Math.max(0, Math.sin(angle));
        const backFactor = Math.max(0, -Math.sin(angle));
        const chestBand = Math.exp(-Math.pow((t - 0.58) / 0.24, 2));
        rz += frontFactor * chestBand * 0.014 + backFactor * chestBand * 0.009;

        pos.setXYZ(i, (x / rNorm) * rx * rNorm, y, (z / rNorm) * rz * rNorm);
      }
      geo.computeVertexNormals();
      return geo;
    };

    const createSculptedHeadGeometry = (): THREE.BufferGeometry => {
      // Crânio + maçãs do rosto + queixo suave humano (sem caixas)
      const geo = new THREE.SphereGeometry(0.105, 28, 22);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i);
        let y = pos.getY(i);
        let z = pos.getZ(i);
        // Proporções cranianas reais (altura maior que largura)
        x *= 0.83;
        y *= 1.1;
        z *= 0.94;
        if (y < 0) {
          // Afinamento suave do maxilar até o queixo
          const jawT = Math.min(1, -y / 0.115);
          x *= THREE.MathUtils.lerp(1.0, 0.62, jawT * 0.85);
          z *= THREE.MathUtils.lerp(1.0, 0.78, jawT * 0.7);
          if (z > 0) z += jawT * 0.016; // leve projeção natural do queixo
        }
        pos.setXYZ(i, x, y, z);
      }
      geo.computeVertexNormals();
      return geo;
    };

    const athlete = new THREE.Group();
    scene.add(athlete);

    // 1. Cabeça Humana Esculpida (cabelo, olhos, sobrancelhas, nariz, orelhas e boca)
    const headGroup = new THREE.Group();
    const cranium = new THREE.Mesh(createSculptedHeadGeometry(), skinMat);
    cranium.castShadow = true;
    headGroup.add(cranium);

    // Cabelo curto atlético modelado (coroa, nuca e franja orgânica)
    const hairCrown = new THREE.Mesh(
      new THREE.SphereGeometry(0.107, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairMat
    );
    hairCrown.scale.set(0.85, 1.06, 0.97);
    hairCrown.position.set(0, 0.015, -0.008);
    hairCrown.rotation.x = -0.22;
    hairCrown.castShadow = true;
    headGroup.add(hairCrown);

    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.088, 16, 12), hairMat);
    hairBack.scale.set(0.84, 0.95, 0.66);
    hairBack.position.set(0, 0.005, -0.044);
    headGroup.add(hairBack);

    const hairTopWave = new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 10), hairMat);
    hairTopWave.scale.set(1.02, 0.45, 0.85);
    hairTopWave.position.set(0, 0.102, 0.016);
    headGroup.add(hairTopWave);

    // Orelhas
    const earGeo = new THREE.SphereGeometry(0.02, 10, 10);
    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(earGeo, skinMat);
      ear.scale.set(0.45, 1.15, 0.72);
      ear.position.set(side * 0.085, -0.004, -0.006);
      ear.rotation.z = side * -0.15;
      headGroup.add(ear);
    });

    // Olhos, íris e sobrancelhas
    const eyeScleraGeo = new THREE.SphereGeometry(0.014, 10, 10);
    const irisGeo = new THREE.SphereGeometry(0.0085, 10, 10);
    const browGeo = new THREE.CapsuleGeometry(0.0045, 0.02, 4, 6);
    [-1, 1].forEach((side) => {
      const sclera = new THREE.Mesh(eyeScleraGeo, eyeWhiteMat);
      sclera.scale.set(1.1, 0.72, 0.55);
      sclera.position.set(side * 0.031, 0.012, 0.082);
      headGroup.add(sclera);

      const iris = new THREE.Mesh(irisGeo, irisMat);
      iris.scale.set(0.95, 0.95, 0.55);
      iris.position.set(side * 0.031, 0.012, 0.088);
      headGroup.add(iris);

      const brow = new THREE.Mesh(browGeo, hairMat);
      brow.rotation.z = Math.PI / 2 + side * -0.08;
      brow.position.set(side * 0.031, 0.03, 0.085);
      headGroup.add(brow);
    });

    // Nariz natural e boca serena
    const nose = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.022, 6, 8), skinMat);
    nose.position.set(0, -0.01, 0.095);
    nose.rotation.x = -0.34;
    headGroup.add(nose);

    const mouth = new THREE.Mesh(new THREE.CapsuleGeometry(0.0042, 0.022, 4, 8), lipMat);
    mouth.rotation.z = Math.PI / 2;
    mouth.position.set(0, -0.048, 0.083);
    headGroup.add(mouth);
    athlete.add(headGroup);

    // Pescoço anatômico (pele natural)
    const neckMesh = new THREE.Mesh(createMuscleLimbGeometry(0.056, 0.045, 0.044, 0.35), skinMat);
    neckMesh.castShadow = true;
    athlete.add(neckMesh);

    // 2. Caixa Torácica & Camiseta Esportiva Orgânica (sem placas ou caixas)
    const chestGroup = new THREE.Group();
    const ribcage = new THREE.Mesh(createSculptedTorsoGeometry(), shirtBaseMat);
    ribcage.castShadow = true;
    chestGroup.add(ribcage);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.011, 10, 24), trimMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.132, 0.004);
    chestGroup.add(collar);

    // Zonas musculares esculpidas integradas na camiseta (peitoral e dorsais)
    const pecGeo = new THREE.SphereGeometry(0.08, 18, 14);
    const pecL = new THREE.Mesh(pecGeo, chestMat);
    pecL.position.set(0.06, 0.028, 0.058);
    pecL.scale.set(1.04, 0.84, 0.45);
    const pecR = new THREE.Mesh(pecGeo, chestMat);
    pecR.position.set(-0.06, 0.028, 0.058);
    pecR.scale.set(1.04, 0.84, 0.45);
    chestGroup.add(pecL, pecR);

    const latGeo = new THREE.SphereGeometry(0.086, 16, 12);
    const latL = new THREE.Mesh(latGeo, backMat);
    latL.position.set(0.062, 0.02, -0.052);
    latL.scale.set(1.02, 1.12, 0.46);
    const latR = new THREE.Mesh(latGeo, backMat);
    latR.position.set(-0.062, 0.02, -0.052);
    latR.scale.set(1.02, 1.12, 0.46);
    chestGroup.add(latL, latR);
    athlete.add(chestGroup);

    // 3. Abdômen / Cintura Contínua (sobrepõe tórax e pelve sem emenda!)
    const absGroup = new THREE.Group();
    const waistCore = new THREE.Mesh(
      createLimbSliceGeometry(0.122, 0.114, 0.12, -0.125, 0.125, 0.45),
      shirtBaseMat
    );
    waistCore.scale.set(1.04, 1, 0.74);
    waistCore.castShadow = true;
    absGroup.add(waistCore);

    const absFront = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.11, 8, 14), absMat);
    absFront.scale.set(1.22, 1, 0.42);
    absFront.position.set(0, 0.0, 0.05);
    absGroup.add(absFront);

    const beltStripe = new THREE.Mesh(new THREE.TorusGeometry(0.116, 0.011, 8, 24), trimMat);
    beltStripe.rotation.x = Math.PI / 2;
    beltStripe.position.set(0, -0.095, 0);
    beltStripe.scale.set(1.05, 0.76, 1);
    absGroup.add(beltStripe);
    athlete.add(absGroup);

    // 4. Pelve & Shorts Esportivos + Glúteos Anatômicos
    const pelvisGroup = new THREE.Group();
    const hipBase = new THREE.Mesh(new THREE.SphereGeometry(0.128, 20, 16), shortsBaseMat);
    hipBase.scale.set(1.12, 0.86, 0.8);
    hipBase.castShadow = true;
    pelvisGroup.add(hipBase);

    const gluteGeo = new THREE.SphereGeometry(0.078, 16, 12);
    const gluteL = new THREE.Mesh(gluteGeo, gluteMat);
    gluteL.position.set(0.056, -0.018, -0.064);
    gluteL.scale.set(0.95, 1.02, 0.84);
    const gluteR = new THREE.Mesh(gluteGeo, gluteMat);
    gluteR.position.set(-0.056, -0.018, -0.064);
    gluteR.scale.set(0.95, 1.02, 0.84);
    pelvisGroup.add(gluteL, gluteR);
    athlete.add(pelvisGroup);

    // 5. Articulações Suaves Coincidentes (ombro = manga camiseta; cotovelo/joelho = pele contínua)
    const shoulderCapL = new THREE.Mesh(new THREE.SphereGeometry(0.059, 18, 14), shouldersMat);
    shoulderCapL.scale.set(1.02, 1.08, 0.96);
    const shoulderCapR = new THREE.Mesh(new THREE.SphereGeometry(0.059, 18, 14), shouldersMat);
    shoulderCapR.scale.set(1.02, 1.08, 0.96);

    const elbowCapL = new THREE.Mesh(new THREE.SphereGeometry(0.039, 14, 12), skinMat);
    const elbowCapR = new THREE.Mesh(new THREE.SphereGeometry(0.039, 14, 12), skinMat);
    const kneeCapL = new THREE.Mesh(new THREE.SphereGeometry(0.053, 14, 12), legsMat);
    const kneeCapR = new THREE.Mesh(new THREE.SphereGeometry(0.053, 14, 12), legsMat);
    [shoulderCapL, shoulderCapR, elbowCapL, elbowCapR, kneeCapL, kneeCapR].forEach((m) => {
      m.castShadow = true;
      athlete.add(m);
    });

    // 6. Braços com Manga Curta + Pele Natural & Pernas com Shorts + Pele Natural
    const sleeveGeo = createLimbSliceGeometry(0.056, 0.059, 0.057, -0.02, 0.52, 0.52);
    const upperArmSkinGeo = createLimbSliceGeometry(0.039, 0.05, 0.048, -0.51, 0.03, 0.62);
    const createUpperArmGroup = () => {
      const g = new THREE.Group();
      const sleeve = new THREE.Mesh(sleeveGeo, shouldersMat);
      sleeve.castShadow = true;
      const skinPart = new THREE.Mesh(upperArmSkinGeo, armsMat);
      skinPart.castShadow = true;
      g.add(sleeve, skinPart);
      return g;
    };

    const upperArmL = createUpperArmGroup();
    const upperArmR = createUpperArmGroup();

    const forearmGeo = createMuscleLimbGeometry(0.028, 0.041, 0.039, 0.68);
    const forearmL = new THREE.Mesh(forearmGeo, skinMat);
    const forearmR = new THREE.Mesh(forearmGeo, skinMat);
    forearmL.castShadow = true;
    forearmR.castShadow = true;

    const shortsLegGeo = createLimbSliceGeometry(0.072, 0.09, 0.094, -0.03, 0.53, 0.65);
    const lowerThighSkinGeo = createLimbSliceGeometry(0.053, 0.068, 0.069, -0.51, 0.02, 0.58);
    const createThighGroup = () => {
      const g = new THREE.Group();
      const shortsLeg = new THREE.Mesh(shortsLegGeo, shortsBaseMat);
      shortsLeg.castShadow = true;
      const skinThigh = new THREE.Mesh(lowerThighSkinGeo, legsMat);
      skinThigh.castShadow = true;
      g.add(shortsLeg, skinThigh);
      return g;
    };

    const thighL = createThighGroup();
    const thighR = createThighGroup();

    const calfSkinGeo = createLimbSliceGeometry(0.035, 0.056, 0.053, -0.34, 0.51, 0.65);
    const sockSliceGeo = createLimbSliceGeometry(0.032, 0.036, 0.037, -0.5, -0.31, 0.5);
    const createCalfGroup = () => {
      const g = new THREE.Group();
      const calfSkin = new THREE.Mesh(calfSkinGeo, calvesMat);
      calfSkin.castShadow = true;
      const sock = new THREE.Mesh(sockSliceGeo, sockMat);
      sock.castShadow = true;
      g.add(calfSkin, sock);
      return g;
    };

    const calfL = createCalfGroup();
    const calfR = createCalfGroup();

    athlete.add(upperArmL, upperArmR, forearmL, forearmR, thighL, thighR, calfL, calfR);

    // 7. Mãos Humanas Articuladas (palma, polegares e dedos levemente curvados)
    function createHumanHand(isLeft: boolean): THREE.Group {
      const g = new THREE.Group();
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.034, 14, 12), skinMat);
      palm.scale.set(0.92, 1.25, 0.54);
      palm.position.set(0, 0.032, 0);
      palm.castShadow = true;
      g.add(palm);

      const fingerGeo = new THREE.CapsuleGeometry(0.0068, 0.034, 4, 6);
      [-0.018, -0.006, 0.006, 0.018].forEach((fx, idx) => {
        const finger = new THREE.Mesh(fingerGeo, skinMat);
        const lenScale = idx === 1 || idx === 2 ? 1.08 : idx === 0 ? 0.94 : 0.82;
        finger.scale.set(1, lenScale, 1);
        finger.position.set(fx, 0.082, -0.005);
        finger.rotation.x = -0.24; // curvatura natural humana dos dedos
        g.add(finger);
      });

      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0075, 0.025, 4, 6), skinMat);
      const side = isLeft ? -1 : 1;
      thumb.position.set(side * 0.029, 0.04, -0.009);
      thumb.rotation.z = side * -0.52;
      thumb.rotation.x = -0.2;
      g.add(thumb);
      return g;
    }

    const handL = createHumanHand(true);
    const handR = createHumanHand(false);

    // Tênis Esportivos Ergonômicos (sem caixas retangulares)
    function createAthleticShoe(): THREE.Group {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.115, 8, 14), shoeUpperMat);
      body.rotation.x = Math.PI / 2;
      body.scale.set(1.08, 1.0, 0.78);
      body.position.set(0, -0.018, 0.044);
      body.castShadow = true;
      g.add(body);

      const toeCap = new THREE.Mesh(new THREE.SphereGeometry(0.039, 14, 10), shoeUpperMat);
      toeCap.scale.set(1.06, 0.62, 1.25);
      toeCap.position.set(0, -0.024, 0.11);
      g.add(toeCap);

      const collarShoe = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 8, 16), shoeUpperMat);
      collarShoe.rotation.x = Math.PI / 2;
      collarShoe.position.set(0, 0.004, 0.0);
      g.add(collarShoe);

      const midsole = new THREE.Mesh(new THREE.CapsuleGeometry(0.041, 0.125, 6, 14), shoeMidsoleMat);
      midsole.rotation.x = Math.PI / 2;
      midsole.scale.set(1.1, 1.02, 0.42);
      midsole.position.set(0, -0.042, 0.046);
      g.add(midsole);

      const soleTrim = new THREE.Mesh(new THREE.CapsuleGeometry(0.041, 0.12, 4, 12), trimMat);
      soleTrim.rotation.x = Math.PI / 2;
      soleTrim.scale.set(1.08, 1.0, 0.16);
      soleTrim.position.set(0, -0.055, 0.046);
      g.add(soleTrim);
      return g;
    }

    const footL = createAthleticShoe();
    const footR = createAthleticShoe();
    athlete.add(handL, handR, footL, footR);

    const poseState = createEmptyPose3DState();
    let rafId = 0;
    let timeoutId = 0;
    let lastTime = performance.now();
    let cycle = 0;
    let reps = 1;
    let lastShownPhase: 0 | 1 | 2 = 0;
    let disposed = false;

    const applyHighlightZones = (zones: Set<string>, pulseTime: number) => {
      const pulse = 0.28 + 0.16 * Math.sin(pulseTime * 3.4);
      const setFabricHighlight = (mat: THREE.MeshPhysicalMaterial, restColor: THREE.Color, active: boolean) => {
        if (active) {
          mat.color.copy(fabricActiveColor);
          mat.emissive.set('#00D4C4');
          mat.emissiveIntensity = pulse + 0.08;
        } else {
          mat.color.copy(restColor);
          mat.emissive.set('#000000');
          mat.emissiveIntensity = 0;
        }
      };
      const setSkinHighlight = (mat: THREE.MeshPhysicalMaterial, active: boolean) => {
        if (active) {
          mat.color.copy(skinActiveColor);
          mat.emissive.set('#00B5A6');
          mat.emissiveIntensity = pulse;
        } else {
          mat.color.copy(skinBaseColor);
          mat.emissive.set('#000000');
          mat.emissiveIntensity = 0;
        }
      };
      setFabricHighlight(chestMat, shirtRestColor, zones.has('chest'));
      setFabricHighlight(backMat, shirtRestColor, zones.has('back'));
      setFabricHighlight(absMat, shirtRestColor, zones.has('core') || zones.has('abs'));
      setFabricHighlight(shouldersMat, shirtRestColor, zones.has('shoulders') || zones.has('arms'));
      setFabricHighlight(gluteMat, shortsRestColor, zones.has('glutes'));
      setSkinHighlight(legsMat, zones.has('quadriceps') || zones.has('legs'));
      setSkinHighlight(calvesMat, zones.has('calves') || zones.has('legs'));
      setSkinHighlight(armsMat, zones.has('arms'));
    };

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (status === gl.UNSIGNALED) {
            timeoutId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            timeoutId = window.setTimeout(cb, 80);
          }
        };
        timeoutId = window.setTimeout(poll, 5);
      } else {
        timeoutId = window.setTimeout(cb, 80);
      }
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

      evaluateExercisePose3D(curSpec, cycle, poseState);
      if (poseState.phaseIndex !== lastShownPhase) {
        lastShownPhase = poseState.phaseIndex;
        setPhaseIdx(poseState.phaseIndex);
      }

      const curZones = new Set(curSpec.target_zones.map((z) => z.toLowerCase()));
      applyHighlightZones(curZones, now / 1000);

      // Visibilidade e posição exata dos equipamentos de cena
      matGroup.visible = poseState.prop === 'mat';
      benchGroup.visible = poseState.prop === 'bench' || poseState.prop === 'chair_back';
      if (benchGroup.visible) {
        benchGroup.position.copy(poseState.propPosition);
        benchGroup.rotation.y = poseState.facingAxis === 'z' ? Math.PI / 2 : 0;
      }
      dumbbellL.visible = poseState.prop === 'dumbbells';
      dumbbellR.visible = poseState.prop === 'dumbbells';

      // Cabeça e tronco orientados por Basis ortonormal (zero flip!)
      headGroup.position.copy(poseState.head);
      orientByBasis(headGroup, poseState.torsoLeft, poseState.headUp, poseState.headForward);

      neckMesh.scale.set(1, 1, 1);
      orientLimbSegment(neckMesh, poseState.neck, poseState.head, poseState.torsoLeft);

      chestGroup.position.copy(poseState.chestCenter);
      orientByBasis(chestGroup, poseState.torsoLeft, poseState.torsoUp, poseState.torsoForward);

      absGroup.position.copy(poseState.lumbarMid);
      orientByBasis(absGroup, poseState.torsoLeft, poseState.torsoUp, poseState.torsoForward);

      // Pelve acompanha a linha real dos quadris sem torção exagerada
      pelvisGroup.position.copy(poseState.pelvis);
      _pelvisLeft.subVectors(poseState.hipL, poseState.hipR);
      if (_pelvisLeft.lengthSq() > 1e-6) {
        _pelvisLeft.normalize();
        _pelvisFwd.crossVectors(_pelvisLeft, poseState.torsoUp);
        if (_pelvisFwd.lengthSq() > 1e-6) {
          _pelvisFwd.normalize();
          _orthoVec.crossVectors(_pelvisFwd, _pelvisLeft).normalize();
          orientByBasis(pelvisGroup, _pelvisLeft, _orthoVec, _pelvisFwd);
        }
      }

      // Articulações
      shoulderCapL.position.copy(poseState.shoulderL);
      shoulderCapR.position.copy(poseState.shoulderR);
      elbowCapL.position.copy(poseState.elbowL);
      elbowCapR.position.copy(poseState.elbowR);
      kneeCapL.position.copy(poseState.kneeL);
      kneeCapR.position.copy(poseState.kneeR);

      // Segmentos musculares com comprimentos rigorosamente constantes
      orientLimbSegment(upperArmL, poseState.shoulderL, poseState.elbowL, poseState.torsoLeft);
      orientLimbSegment(upperArmR, poseState.shoulderR, poseState.elbowR, poseState.torsoLeft);
      orientLimbSegment(forearmL, poseState.elbowL, poseState.wristL, poseState.torsoLeft);
      orientLimbSegment(forearmR, poseState.elbowR, poseState.wristR, poseState.torsoLeft);

      orientLimbSegment(thighL, poseState.hipL, poseState.kneeL, poseState.torsoLeft);
      orientLimbSegment(thighR, poseState.hipR, poseState.kneeR, poseState.torsoLeft);
      orientLimbSegment(calfL, poseState.kneeL, poseState.ankleL, poseState.torsoLeft);
      orientLimbSegment(calfR, poseState.kneeR, poseState.ankleR, poseState.torsoLeft);

      // Mãos humanas e halteres orientados continuamente no punho
      handL.position.copy(poseState.wristL);
      _gripY.subVectors(poseState.wristL, poseState.elbowL);
      if (_gripY.lengthSq() < 1e-6) _gripY.set(0, -1, 0);
      else _gripY.normalize();
      _gripAxis.copy(poseState.torsoLeft);
      if (Math.abs(_gripAxis.dot(_gripY)) > 0.92) _gripAxis.copy(poseState.torsoForward);
      _gripZ.crossVectors(_gripAxis, _gripY).normalize();
      _gripAxis.crossVectors(_gripY, _gripZ).normalize();
      orientByBasis(handL, _gripAxis, _gripY, _gripZ);
      if (poseState.prop === 'dumbbells') {
        dumbbellL.position.copy(poseState.wristL);
        orientByBasis(dumbbellL, _gripAxis, _gripY, _gripZ);
      }

      handR.position.copy(poseState.wristR);
      _gripY.subVectors(poseState.wristR, poseState.elbowR);
      if (_gripY.lengthSq() < 1e-6) _gripY.set(0, -1, 0);
      else _gripY.normalize();
      _gripAxis.copy(poseState.torsoLeft);
      if (Math.abs(_gripAxis.dot(_gripY)) > 0.92) _gripAxis.copy(poseState.torsoForward);
      _gripZ.crossVectors(_gripAxis, _gripY).normalize();
      _gripAxis.crossVectors(_gripY, _gripZ).normalize();
      orientByBasis(handR, _gripAxis, _gripY, _gripZ);
      if (poseState.prop === 'dumbbells') {
        dumbbellR.position.copy(poseState.wristR);
        orientByBasis(dumbbellR, _gripAxis, _gripY, _gripZ);
      }

      // Tênis direcionais no plano do pé
      footL.position.copy(poseState.ankleL);
      _footFwd.copy(poseState.footDirL).normalize();
      _footRight.crossVectors(_upVec, _footFwd);
      if (_footRight.lengthSq() < 1e-6) _footRight.set(0, 0, 1);
      else _footRight.normalize();
      _footUp.crossVectors(_footFwd, _footRight).normalize();
      orientByBasis(footL, _footRight, _footUp, _footFwd);

      footR.position.copy(poseState.ankleR);
      _footFwd.copy(poseState.footDirR).normalize();
      _footRight.crossVectors(_upVec, _footFwd);
      if (_footRight.lengthSq() < 1e-6) _footRight.set(0, 0, 1);
      else _footRight.normalize();
      _footUp.crossVectors(_footFwd, _footRight).normalize();
      orientByBasis(footR, _footRight, _footUp, _footFwd);

      // Sombra de contato acompanha centro de massa no solo
      contactShadow.position.x = poseState.pelvis.x;
      contactShadow.position.z = poseState.pelvis.z;
      const spread = Math.max(0.75, Math.abs(poseState.ankleL.x - poseState.ankleR.x) * 0.9 + 0.62);
      contactShadow.scale.set(spread, 1, poseState.facingAxis === 'x' ? 1.35 : 0.85);

      // Enquadramento dinâmico suave (centraliza automaticamente exercícios em pé e de solo!)
      const dampLambda = isSoftGl ? 18 : 6.5;
      controls.target.x = THREE.MathUtils.damp(controls.target.x, poseState.centerOfMass.x, dampLambda, dt || 0.016);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, poseState.centerOfMass.y, dampLambda, dt || 0.016);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, poseState.centerOfMass.z, dampLambda, dt || 0.016);

      if (presetTransitionRef.current) {
        const preset = cameraPresetRef.current;
        const cy = poseState.centerOfMass.y;
        const cx = poseState.centerOfMass.x;
        const isX = poseState.facingAxis === 'x';

        if (preset === 'side') {
          if (isX) {
            _camTargetPos.set(cx, cy + 0.35, 2.55);
          } else {
            _camTargetPos.set(2.65, cy + 0.25, 0.12);
          }
        } else if (preset === 'front') {
          if (isX) {
            _camTargetPos.set(cx + 2.35, cy + 0.52, 0.35);
          } else {
            _camTargetPos.set(0, cy + 0.22, 2.65);
          }
        } else {
          if (isX) {
            _camTargetPos.set(cx + 0.95, cy + 0.78, 2.25);
          } else {
            _camTargetPos.set(1.45, cy + 0.42, 2.25);
          }
        }

        camera.position.x = THREE.MathUtils.damp(camera.position.x, _camTargetPos.x, dampLambda, dt || 0.016);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _camTargetPos.y, dampLambda, dt || 0.016);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _camTargetPos.z, dampLambda, dt || 0.016);

        if (camera.position.distanceToSquared(_camTargetPos) < 0.0015) {
          presetTransitionRef.current = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftGl) {
        afterDraw(() => {
          if (!disposed) rafId = requestAnimationFrame(tick);
        });
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    if (!isSoftGl) {
      renderer.compile(scene, camera);
    }

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
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', cancelPresetOnUserDrag);
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
      <div className={`flex ${heightClass} flex-col items-center justify-center rounded-2xl border border-[#DCECE6] bg-[#EFF7F3] p-6 text-center`}>
        <p className="text-sm font-bold text-[#0F2A2A]">{exerciseName}</p>
        <p className="mt-2 max-w-md text-xs text-[#4B6B68]">{spec.preparation}</p>
      </div>
    );
  }

  const isFullHeight = heightClass === 'h-full';

  return (
    <div className={isFullHeight ? 'flex h-full min-h-0 flex-col' : 'space-y-2'}>
      <div
        className={
          isFullHeight
            ? 'relative flex h-full min-h-0 flex-col overflow-hidden bg-[#EFF7F3]'
            : 'relative overflow-hidden rounded-2xl border border-[#DCECE6] bg-[#EFF7F3] shadow-sm'
        }
      >
        {/* Top HUD (sem backdrop-blur sobre WebGL) */}
        <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex items-center justify-between gap-2">
          <div className="rounded-xl border border-[#DCECE6] bg-white/92 px-3 py-1.5 shadow-sm">
            <p className="text-[10px] font-semibold tracking-wider text-[#0C947E] uppercase">
              Modelo 3D Anatômico · {muscleGroup}
            </p>
            <p className="text-xs font-bold text-[#0F2A2A]">{exerciseName}</p>
          </div>
          <div className="rounded-xl border border-[#DCECE6] bg-white/92 px-2.5 py-1 text-right font-mono text-[11px] font-semibold text-[#2E4A48] shadow-sm tabular-nums">
            <div>REP #{repCount}</div>
            <div className="text-[10px] text-[#0C947E]">FASE {phaseIdx + 1}/3</div>
          </div>
        </div>

        {/* Viewport WebGL isolado */}
        <div ref={mountRef} className={`w-full cursor-grab active:cursor-grabbing ${isFullHeight ? 'min-h-0 flex-1' : heightClass}`} />

        {/* Legenda biomecânica ativa */}
        <div className="pointer-events-none absolute bottom-12 left-3 right-3 z-10 flex items-center justify-between gap-2">
          <div className="rounded-xl border border-[#DCECE6] bg-white/92 px-3 py-1 text-xs text-[#0F2A2A] shadow-sm">
            <span className="font-mono text-[11px] font-semibold text-[#0C947E]">
              {spec.phase_labels[phaseIdx] || spec.phase_labels[0]}
            </span>
          </div>
          {activeZoneSet.size > 0 && (
            <div className="hidden rounded-xl border border-[#DCECE6] bg-white/92 px-2.5 py-1 text-[10px] font-medium text-[#4B6B68] shadow-sm sm:block">
              Músculos ativos em turquesa
            </div>
          )}
        </div>

        {/* Dock de controles consolidado abaixo do viewport */}
        {showControls && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E1EEE9] bg-white px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleTogglePlay}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#12BFA3] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0EA88F]"
              >
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {playing ? 'Pausar' : 'Reproduzir'}
              </button>

              <button
                type="button"
                onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))}
                className="inline-flex items-center gap-1 rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-1.5 font-mono text-xs font-medium text-[#2E4A48] hover:bg-[#E7F4EF]"
              >
                <Gauge className="h-3.5 w-3.5 text-[#0C947E]" />
                {speed === 0.5 ? '0.5x' : '1.0x'}
              </button>

              <button
                type="button"
                onClick={handleCycleCamera}
                className="inline-flex items-center gap-1 rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-1.5 text-xs font-medium text-[#2E4A48] hover:bg-[#E7F4EF]"
                title="Arraste no 3D para girar livremente"
              >
                <Camera className="h-3.5 w-3.5 text-[#0C947E]" />
                {cameraPreset === 'studio' ? '3/4' : cameraPreset === 'side' ? 'Lateral' : 'Frontal'}
              </button>

              <button
                type="button"
                onClick={() => setVoiceActive((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-medium ${
                  voiceActive
                    ? 'border-[#12BFA3] bg-[#E3F7F2] text-[#0C947E]'
                    : 'border-[#D3E5DF] bg-[#F4FAF7] text-[#2E4A48] hover:bg-[#E7F4EF]'
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
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-1.5 text-xs font-medium text-[#2E4A48] hover:bg-[#E7F4EF] disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5 text-[#0C947E]" />
              {exporting ? 'Gravando...' : 'Baixar vídeo'}
            </button>
          </div>
        )}
      </div>

      {exportNote && (
        <p className="rounded-xl border border-[#BCE6DC] bg-[#E3F7F2] px-3 py-1.5 text-xs font-medium text-[#0B7C6A]">
          {exportNote}
        </p>
      )}
    </div>
  );
}
