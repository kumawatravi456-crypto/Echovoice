import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

type ViewMode = 'convergence' | 'resonator' | 'exploded' | 'spectral';
type MaterialFinish = 'glass' | 'obsidian' | 'titanium';

interface EchoHeroCanvasProps {
  initialMode?: ViewMode;
}

export function EchoHeroCanvas({ initialMode = 'convergence' }: EchoHeroCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [activeMode, setActiveMode] = useState<ViewMode>(initialMode);
  const [finish, setFinish] = useState<MaterialFinish>('glass');
  const [isExpandedControls, setIsExpandedControls] = useState(true);

  const activeModeRef = useRef(activeMode);
  activeModeRef.current = activeMode;
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL Detection Guard (per ThreeJS skill directives)
    const isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    // 2. Scene, Fog, Camera, Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0c10, 0.04);

    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 0.2, 7.8);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    container.appendChild(renderer.domElement);

    // 3. Studio Environment Map via PMREMGenerator
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 4. Studio Balanced 3-Point Lighting Rig
    const ambientLight = new THREE.AmbientLight(0x18191e, 1.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x42d9ff, 3.2);
    keyLight.position.set(6, 5, 7);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x9270ff, 3.5);
    rimLight.position.set(-6, -4, -5);
    scene.add(rimLight);

    const centerPointLight = new THREE.PointLight(0x42d9ff, 3.0, 12);
    centerPointLight.position.set(0, 0, 0);
    scene.add(centerPointLight);

    // 5. Hero Composite Sculpture: 5 Coordinated Sub-Components
    const heroGroup = new THREE.Group();
    scene.add(heroGroup);

    // Part A: Inner Faceted Luminous Core
    const coreGeo = new THREE.IcosahedronGeometry(0.9, 3);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0x42d9ff,
      emissive: 0x0c3148,
      emissiveIntensity: 1.2,
      roughness: 0.12,
      metalness: 0.88,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });
    const innerCore = new THREE.Mesh(coreGeo, coreMat);
    heroGroup.add(innerCore);

    // Part B: Outer Optical Refractor Ribbon 1
    const ringGeo1 = new THREE.TorusGeometry(1.7, 0.2, 32, 100);
    const glassMat1 = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: isSoftwareGl ? 0 : 0.94,
      opacity: isSoftwareGl ? 0.35 : 1.0,
      transparent: true,
      roughness: 0.08,
      ior: 1.54,
      thickness: 1.4,
      clearcoat: 1.0,
      attenuationColor: new THREE.Color(0x42d9ff),
      attenuationDistance: 0.9,
    });
    const ring1 = new THREE.Mesh(ringGeo1, glassMat1);
    ring1.rotation.x = Math.PI / 3.2;
    heroGroup.add(ring1);

    // Part C: Outer Optical Refractor Ribbon 2 (Cross-Gimbal)
    const ringGeo2 = new THREE.TorusGeometry(1.95, 0.16, 32, 100);
    const glassMat2 = glassMat1.clone();
    (glassMat2 as THREE.MeshPhysicalMaterial).attenuationColor = new THREE.Color(0x9270ff);
    const ring2 = new THREE.Mesh(ringGeo2, glassMat2);
    ring2.rotation.y = Math.PI / 2.6;
    heroGroup.add(ring2);

    // Part D: Floating Precision Orbital Nodes (4 Multimodal Channels)
    const channelNodes: THREE.Mesh[] = [];
    const nodeColors = [0x42d9ff, 0x4169ff, 0x9270ff, 0xffffff];
    for (let i = 0; i < 4; i++) {
      const nodeGeo = new THREE.SphereGeometry(0.12, 18, 18);
      const nodeMat = new THREE.MeshStandardMaterial({
        color: nodeColors[i],
        emissive: nodeColors[i],
        emissiveIntensity: 1.8,
        roughness: 0.15,
      });
      const node = new THREE.Mesh(nodeGeo, nodeMat);
      heroGroup.add(node);
      channelNodes.push(node);
    }

    // Part E: Converging Luminous Communication Particles
    const particleCount = isSoftwareGl ? 400 : 1400;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const particleSpeeds = new Float32Array(particleCount);

    const cCyan = new THREE.Color(0x42d9ff);
    const cViolet = new THREE.Color(0x9270ff);
    const cWhite = new THREE.Color(0xf0f2f5);

    for (let i = 0; i < particleCount; i++) {
      const r = 2.4 + Math.random() * 3.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      particleSpeeds[i] = 0.35 + Math.random() * 0.45;

      const mixed = Math.random() > 0.6 ? cCyan : Math.random() > 0.3 ? cViolet : cWhite;
      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Circle particle texture
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 64;
    pCanvas.height = 64;
    const pCtx = pCanvas.getContext('2d');
    if (pCtx) {
      const grad = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.25, 'rgba(66,217,255,0.8)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      pCtx.fillStyle = grad;
      pCtx.fillRect(0, 0, 64, 64);
    }
    const particleTex = new THREE.CanvasTexture(pCanvas);

    const particleMat = new THREE.PointsMaterial({
      size: 0.11,
      vertexColors: true,
      map: particleTex,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particleField = new THREE.Points(particleGeo, particleMat);
    scene.add(particleField);

    // 6. Interactive Mouse Physics Tracker
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.targetX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      mouse.targetY = -((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMouseMove);

    // 7. Continuous Animation Loop with Exponential Damping
    const clock = new THREE.Clock();
    let frameId = 0;

    let targetExplode = 0;
    let currentExplode = 0;

    const tick = () => {
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Exponential damping on cursor
      mouse.x += (mouse.targetX - mouse.x) * (delta * 4.0);
      mouse.y += (mouse.targetY - mouse.y) * (delta * 4.0);

      const mode = activeModeRef.current;
      const currentFinish = finishRef.current;

      // Update finish appearance on the fly
      if (currentFinish === 'obsidian') {
        coreMat.color.setHex(0x18181a);
        coreMat.roughness = 0.05;
        coreMat.metalness = 0.95;
        (glassMat1 as THREE.MeshPhysicalMaterial).color.setHex(0x303030);
      } else if (currentFinish === 'titanium') {
        coreMat.color.setHex(0xd0d8e2);
        coreMat.roughness = 0.22;
        coreMat.metalness = 0.98;
        (glassMat1 as THREE.MeshPhysicalMaterial).color.setHex(0x9270ff);
      } else {
        coreMat.color.setHex(0x42d9ff);
        coreMat.roughness = 0.12;
        coreMat.metalness = 0.88;
        (glassMat1 as THREE.MeshPhysicalMaterial).color.setHex(0xffffff);
      }

      // Wireframe spectral toggle
      coreMat.wireframe = mode === 'spectral';
      glassMat1.wireframe = mode === 'spectral';
      glassMat2.wireframe = mode === 'spectral';

      // Exploded separation damping
      targetExplode = mode === 'exploded' ? 1.0 : 0.0;
      currentExplode += (targetExplode - currentExplode) * (delta * 3.0);

      // Apply exploded offsets
      ring1.position.z = currentExplode * 1.4;
      ring2.position.z = -currentExplode * 1.4;
      ring1.position.y = currentExplode * 0.4;
      ring2.position.y = -currentExplode * 0.4;

      const speedMult = mode === 'resonator' ? 2.0 : mode === 'exploded' ? 0.4 : 1.0;

      // Sculpture rotation & gentle levitation
      heroGroup.rotation.y = elapsed * 0.22 * speedMult + mouse.x * 0.5;
      heroGroup.rotation.x = Math.sin(elapsed * 0.35) * 0.12 + mouse.y * 0.4;
      heroGroup.position.y = Math.sin(elapsed * 0.8) * 0.1;

      // Ring rotations
      ring1.rotation.z = elapsed * 0.28 * speedMult;
      ring2.rotation.x = elapsed * -0.22 * speedMult;

      // Pulsing resonant core
      const pulse = 1 + Math.sin(elapsed * 2.4 * speedMult) * (mode === 'resonator' ? 0.08 : 0.04);
      innerCore.scale.set(pulse, pulse, pulse);

      // Orbiting channel nodes
      channelNodes.forEach((node, idx) => {
        const offset = (idx * Math.PI) / 2;
        const orbitR = 2.15 + Math.sin(elapsed * 1.4 + idx) * 0.25 + currentExplode * 0.6;
        node.position.x = Math.cos(elapsed * 0.85 * speedMult + offset) * orbitR;
        node.position.y = Math.sin(elapsed * 0.55 * speedMult + offset) * (orbitR * 0.65);
        node.position.z = Math.sin(elapsed * 0.85 * speedMult + offset) * orbitR;
      });

      // Stream particles into focal core
      const posAttr = particleGeo.attributes.position;
      const posArr = posAttr.array as Float32Array;

      for (let i = 0; i < particleCount; i++) {
        const idx = i * 3;
        const currR = Math.sqrt(
          posArr[idx] * posArr[idx] +
          posArr[idx + 1] * posArr[idx + 1] +
          posArr[idx + 2] * posArr[idx + 2]
        );

        const spd = particleSpeeds[i] * (mode === 'resonator' ? 1.8 : 1.0);
        const factor = Math.max(0.001, 1 - (spd * delta) / currR);

        posArr[idx] *= factor;
        posArr[idx + 1] *= factor;
        posArr[idx + 2] *= factor;

        // Respawn outward
        if (currR < 0.95) {
          const respawnR = 4.0 + Math.random() * 2.2;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(Math.random() * 2 - 1);
          posArr[idx] = respawnR * Math.sin(phi) * Math.cos(theta);
          posArr[idx + 1] = respawnR * Math.sin(phi) * Math.sin(theta);
          posArr[idx + 2] = respawnR * Math.cos(phi);
        }
      }
      posAttr.needsUpdate = true;
      particleField.rotation.y = elapsed * 0.06;

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(tick);
    };

    tick();

    // Resize handler
    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      particleTex.dispose();
      ringGeo1.dispose();
      ringGeo2.dispose();
      coreGeo.dispose();
      glassMat1.dispose();
      glassMat2.dispose();
      coreMat.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      {/* 3D WebGL Canvas */}
      <div ref={mountRef} className="w-full h-full min-h-[480px] md:min-h-[620px] cursor-grab active:cursor-grabbing" />

      {/* Lusion Studio Collapsible Bottom Dock */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 max-w-[94vw]">
        {/* Toggle Expand/Collapse Tab */}
        <button
          onClick={() => setIsExpandedControls(!isExpandedControls)}
          className="text-[10px] font-mono tracking-widest text-[#7E8594] hover:text-[#FFFFFF] uppercase px-3 py-1 rounded-full bg-[#18191E]/80 border border-white/5 backdrop-blur-md transition-colors"
        >
          {isExpandedControls ? '▾ MINIMIZE STUDIO DOCK' : '▴ EXPAND 3D STUDIO DOCK'}
        </button>

        {isExpandedControls && (
          <div className="flex flex-wrap items-center justify-center gap-2 p-2 rounded-2xl lusion-surface border border-white/10 shadow-2xl">
            {/* View Modes */}
            <div className="flex items-center gap-1 pr-2 border-r border-white/10">
              {(
                [
                  { id: 'convergence', label: 'Convergence' },
                  { id: 'resonator', label: 'Acoustic Pulse' },
                  { id: 'exploded', label: 'Exploded View' },
                  { id: 'spectral', label: 'Spectral Wire' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setActiveMode(m.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                    activeMode === m.id
                      ? 'bg-[#FFFFFF] text-[#0B0C10] font-semibold shadow-md'
                      : 'text-[#7E8594] hover:text-[#FFFFFF]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Material Finish Swatches */}
            <div className="flex items-center gap-1.5 pl-1">
              <span className="text-[10px] font-mono text-[#515663] uppercase hidden sm:inline">FINISH:</span>
              <button
                onClick={() => setFinish('glass')}
                className={`w-6 h-6 rounded-full border transition-all cursor-pointer ${
                  finish === 'glass' ? 'border-[#42D9FF] scale-110 shadow-[0_0_10px_#42D9FF]' : 'border-white/20'
                } bg-gradient-to-tr from-cyan-400 to-white`}
                title="Optical Glass"
              />
              <button
                onClick={() => setFinish('obsidian')}
                className={`w-6 h-6 rounded-full border transition-all cursor-pointer ${
                  finish === 'obsidian' ? 'border-[#FFFFFF] scale-110 shadow-[0_0_10px_#FFFFFF]' : 'border-white/20'
                } bg-gradient-to-tr from-[#121316] to-[#303030]`}
                title="Deep Obsidian"
              />
              <button
                onClick={() => setFinish('titanium')}
                className={`w-6 h-6 rounded-full border transition-all cursor-pointer ${
                  finish === 'titanium' ? 'border-[#9270FF] scale-110 shadow-[0_0_10px_#9270FF]' : 'border-white/20'
                } bg-gradient-to-tr from-[#9270FF] to-[#D0D8E2]`}
                title="Iridescent Titanium"
              />
            </div>
          </div>
        )}
      </div>

      {/* Subtle Studio Corner Metadata */}
      <div className="absolute top-6 left-6 hidden md:flex flex-col gap-1.5 p-3 rounded-xl bg-[#121316]/70 border border-white/5 backdrop-blur-md text-[11px] font-mono text-[#7E8594] pointer-events-none">
        <span className="text-[#FFFFFF] font-semibold">PROJECT ECHO 3D ILLUSTRATION</span>
        <span>ABSTRACT COMMUNICATION FORM</span>
      </div>
    </div>
  );
}
