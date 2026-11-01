import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

interface IglooWorldCanvasProps {
  scrollProgress: number; // 0.0 to 1.0
  isDashboard?: boolean;
  onSceneReady?: () => void;
}

export function IglooWorldCanvas({ scrollProgress, isDashboard = false, onSceneReady }: IglooWorldCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef(scrollProgress);
  scrollRef.current = scrollProgress;
  const isDashboardRef = useRef(isDashboard);
  isDashboardRef.current = isDashboard;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let cleanup = () => {};

    try {
      // 1. Software-WebGL Detection Guard
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
      // Deep Obsidian (#0D0D0E) Atmospheric Fog
      scene.fog = new THREE.FogExp2(0x0D0D0E, 0.045);

      const camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.1,
        100
      );
      camera.position.set(0, 0.5, 11);

      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.35;

      container.appendChild(renderer.domElement);

      // 3. Studio Environment Map for Pure Silver & Obsidian Refraction
      try {
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
        pmremGenerator.dispose();
      } catch (envErr) {
        console.warn('RoomEnvironment fallback:', envErr);
      }

    // 4. Strict Monochromatic Lighting Rig
    // Ambient: Charcoal Slate
    const ambientLight = new THREE.AmbientLight(0x3A3A3E, 1.8);
    scene.add(ambientLight);

    // Key Light: Pure White Starlight (#FFFFFF)
    const keyLight = new THREE.DirectionalLight(0xFFFFFF, 3.8);
    keyLight.position.set(7, 6, 8);
    scene.add(keyLight);

    // Fill Light: Metallic Silver (#8E8E93)
    const fillLight = new THREE.DirectionalLight(0x8E8E93, 1.6);
    fillLight.position.set(-6, -4, -6);
    scene.add(fillLight);

    // Core Hearth Point Light: Pale Silver (#F0F0F2)
    const hearthLight = new THREE.PointLight(0xF0F0F2, 4.2, 16);
    hearthLight.position.set(0, 0.2, 0);
    scene.add(hearthLight);

    // 5. Crystalline Igloo Monument Group
    const iglooMasterGroup = new THREE.Group();
    scene.add(iglooMasterGroup);

    // Part A: Main Crystalline Igloo Shell in Frosted Pale Silver (#F0F0F2)
    const domeGeo = new THREE.IcosahedronGeometry(2.3, 2);
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0xF0F0F2,
      emissive: 0x222226,
      emissiveIntensity: 0.4,
      transmission: isSoftwareGl ? 0 : 0.92,
      opacity: isSoftwareGl ? 0.35 : 1.0,
      transparent: true,
      roughness: 0.12,
      metalness: 0.35,
      ior: 1.52,
      thickness: 1.6,
      clearcoat: 1.0,
      attenuationColor: new THREE.Color(0x8E8E93),
      attenuationDistance: 1.4,
      flatShading: true,
    });
    const crystalDome = new THREE.Mesh(domeGeo, crystalMat);
    crystalDome.position.y = 0.2;
    iglooMasterGroup.add(crystalDome);

    // Part B: Outer Geodesic Lattice in Deep Obsidian Wireframe (#4A4A50)
    const wireGeo = new THREE.IcosahedronGeometry(2.42, 2);
    const wireEdges = new THREE.WireframeGeometry(wireGeo);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x555558,
      transparent: true,
      opacity: 0.7,
      linewidth: 1,
    });
    const wireframeCage = new THREE.LineSegments(wireEdges, wireMat);
    wireframeCage.position.y = 0.2;
    iglooMasterGroup.add(wireframeCage);

    // Part C: Floating Modular Crystal Satellite Blocks (8 parts in Polished Silver)
    const satelliteGroup = new THREE.Group();
    iglooMasterGroup.add(satelliteGroup);

    const satelliteBlocks: THREE.Mesh[] = [];
    const blockGeo = new THREE.OctahedronGeometry(0.45, 0);
    const blockMat = new THREE.MeshPhysicalMaterial({
      color: 0xF0F0F2,
      emissive: 0x333338,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.85,
      clearcoat: 1.0,
    });

    for (let i = 0; i < 8; i++) {
      const block = new THREE.Mesh(blockGeo, blockMat.clone());
      const angle = (i / 8) * Math.PI * 2;
      const radius = 3.2;
      block.position.set(
        Math.cos(angle) * radius,
        Math.sin(i * 1.5) * 0.8 + 0.3,
        Math.sin(angle) * radius
      );
      satelliteGroup.add(block);
      satelliteBlocks.push(block);
    }

    // Part D: Luminous Resonance Core (Pure White #FFFFFF with Silver Quartz sheen)
    const coreGeo = new THREE.OctahedronGeometry(0.85, 1);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0xFFFFFF,
      emissive: 0xF0F0F2,
      emissiveIntensity: 1.5,
      roughness: 0.08,
      metalness: 0.95,
      clearcoat: 1.0,
    });
    const resonantCore = new THREE.Mesh(coreGeo, coreMat);
    resonantCore.position.y = 0.2;
    iglooMasterGroup.add(resonantCore);

    // Part E: 1,600 Drifting White Starlight and Silver Particles
    const particleCount = isSoftwareGl ? 500 : 1600;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const particleSpeeds = new Float32Array(particleCount);

    const colWhite = new THREE.Color(0xFFFFFF);
    const colSilver = new THREE.Color(0xF0F0F2);
    const colCharcoal = new THREE.Color(0x8E8E93);

    for (let i = 0; i < particleCount; i++) {
      const r = 2.0 + Math.random() * 8.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      particleSpeeds[i] = 0.2 + Math.random() * 0.5;

      const pick = Math.random();
      const c = pick > 0.5 ? colWhite : pick > 0.2 ? colSilver : colCharcoal;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Circle particle canvas texture (pure white glow)
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 64;
    pCanvas.height = 64;
    const pCtx = pCanvas.getContext('2d');
    if (pCtx) {
      const grad = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(240,240,242,0.8)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      pCtx.fillStyle = grad;
      pCtx.fillRect(0, 0, 64, 64);
    }
    const particleTex = new THREE.CanvasTexture(pCanvas);

    const particleMat = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      map: particleTex,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particleField = new THREE.Points(particleGeo, particleMat);
    scene.add(particleField);

    // 6. Mouse Parallax Tracking
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const onMouseMove = (e: MouseEvent) => {
      mouse.targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.targetY = -(e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMouseMove);

    // 7. Continuous 6-Stage Camera Choreography via Scroll
    const stageWaypoints = [
      { progress: 0.00, cam: new THREE.Vector3(0, 0.5, 11), target: new THREE.Vector3(0, 0.2, 0) },
      { progress: 0.20, cam: new THREE.Vector3(5.0, 2.2, 8.2), target: new THREE.Vector3(0, 0.3, 0) },
      { progress: 0.40, cam: new THREE.Vector3(-4.2, 1.2, 6.5), target: new THREE.Vector3(0, 0.2, 0) },
      { progress: 0.60, cam: new THREE.Vector3(0.5, 3.4, 5.2), target: new THREE.Vector3(0, 0.1, 0) },
      { progress: 0.80, cam: new THREE.Vector3(0, 0.2, 3.6), target: new THREE.Vector3(0, 0.1, 0) },
      { progress: 1.00, cam: new THREE.Vector3(0, 4.2, 9.0), target: new THREE.Vector3(0, 0.2, 0) },
    ];

    const currentCamPos = new THREE.Vector3(0, 0.5, 11);
    const currentLookTarget = new THREE.Vector3(0, 0.2, 0);

    const clock = new THREE.Clock();
    let frameId = 0;

    const tick = () => {
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Mouse damping
      mouse.x += (mouse.targetX - mouse.x) * (delta * 3.5);
      mouse.y += (mouse.targetY - mouse.y) * (delta * 3.5);

      if (isDashboardRef.current) {
        // Dashboard View Choreography: Frame the 3D crystalline sphere & outer geodesic lattice
        // slightly offset to right so it sits behind the hero & cards like the landing page screenshot
        const desiredCamPos = new THREE.Vector3(1.0, 0.4, 9.8);
        const desiredLookTarget = new THREE.Vector3(0.3, 0.2, 0);

        // Smooth mouse parallax with depth
        desiredCamPos.x += mouse.x * 1.1;
        desiredCamPos.y += mouse.y * 0.7;

        currentCamPos.lerp(desiredCamPos, delta * 2.5);
        currentLookTarget.lerp(desiredLookTarget, delta * 2.5);

        camera.position.copy(currentCamPos);
        camera.lookAt(currentLookTarget);

        // Continuous monument rotation
        iglooMasterGroup.rotation.y = elapsed * 0.12;
        wireframeCage.rotation.y = -elapsed * 0.07;
        wireframeCage.rotation.x = Math.sin(elapsed * 0.3) * 0.08;

        // Resonant core gentle pulse
        const corePulse = 1 + Math.sin(elapsed * 2.0) * 0.06;
        resonantCore.scale.set(corePulse, corePulse, corePulse);

        // Satellite crystal blocks orbiting gracefully
        satelliteBlocks.forEach((block, idx) => {
          const baseAngle = (idx / 8) * Math.PI * 2 + elapsed * 0.22;
          const currentR = 3.4;
          block.position.x = Math.cos(baseAngle) * currentR;
          block.position.z = Math.sin(baseAngle) * currentR;
          block.position.y = Math.sin(elapsed * 1.1 + idx) * 0.6 + 0.3;
          block.rotation.x = elapsed * 0.5 + idx;
          block.rotation.y = elapsed * 0.7 + idx;
        });
      } else {
        const p = Math.max(0, Math.min(1, scrollRef.current));

        let segIdx = 0;
        for (let i = 0; i < stageWaypoints.length - 1; i++) {
          if (p >= stageWaypoints[i].progress && p <= stageWaypoints[i + 1].progress) {
            segIdx = i;
            break;
          }
        }
        const w1 = stageWaypoints[segIdx];
        const w2 = stageWaypoints[segIdx + 1] || stageWaypoints[stageWaypoints.length - 1];
        const localT = (p - w1.progress) / (w2.progress - w1.progress || 0.001);
        const easedT = THREE.MathUtils.smoothstep(localT, 0, 1);

        const desiredCamPos = new THREE.Vector3().lerpVectors(w1.cam, w2.cam, easedT);
        const desiredLookTarget = new THREE.Vector3().lerpVectors(w1.target, w2.target, easedT);

        desiredCamPos.x += mouse.x * 0.8;
        desiredCamPos.y += mouse.y * 0.5;

        currentCamPos.lerp(desiredCamPos, delta * 3.0);
        currentLookTarget.lerp(desiredLookTarget, delta * 3.0);

        camera.position.copy(currentCamPos);
        camera.lookAt(currentLookTarget);

        // Monument ambient rotation
        iglooMasterGroup.rotation.y = elapsed * 0.08 + (p * Math.PI * 1.5);
        wireframeCage.rotation.y = -elapsed * 0.05;
        wireframeCage.rotation.x = Math.sin(elapsed * 0.3) * 0.08;

        // Resonant core pulse
        const corePulse = 1 + Math.sin(elapsed * 2.2) * 0.05;
        resonantCore.scale.set(corePulse, corePulse, corePulse);

        // Modular satellite crystals separation
        const deconstructionFactor = p > 0.25 && p < 0.65 ? Math.sin(((p - 0.25) / 0.4) * Math.PI) : 0;
        satelliteBlocks.forEach((block, idx) => {
          const baseAngle = (idx / 8) * Math.PI * 2 + elapsed * 0.15;
          const currentR = 3.2 + deconstructionFactor * 2.2;
          block.position.x = Math.cos(baseAngle) * currentR;
          block.position.z = Math.sin(baseAngle) * currentR;
          block.position.y = Math.sin(elapsed * 1.2 + idx) * 0.6 + 0.3 + deconstructionFactor * 0.8;
          block.rotation.x = elapsed * 0.5 + idx;
          block.rotation.y = elapsed * 0.7 + idx;
        });
      }

      // Drifting Particles
      const posArr = particleGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        const idx = i * 3;
        posArr[idx + 1] -= particleSpeeds[i] * delta * 0.8;
        if (posArr[idx + 1] < -4) {
          posArr[idx + 1] = 6 + Math.random() * 2;
        }
      }
      particleGeo.attributes.position.needsUpdate = true;
      particleField.rotation.y = elapsed * 0.02;

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(tick);
    };

    tick();

    if (onSceneReady) {
      onSceneReady();
    }

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

      cleanup = () => {
        cancelAnimationFrame(frameId);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('resize', onResize);
        renderer.dispose();
        domeGeo.dispose();
        crystalMat.dispose();
        wireGeo.dispose();
        wireEdges.dispose();
        wireMat.dispose();
        blockGeo.dispose();
        blockMat.dispose();
        coreGeo.dispose();
        coreMat.dispose();
        particleGeo.dispose();
        particleMat.dispose();
        particleTex.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    } catch (err) {
      console.warn('WebGL / Three.js canvas could not be initialized:', err);
      if (onSceneReady) {
        onSceneReady();
      }
    }

    return () => {
      cleanup();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    />
  );
}
