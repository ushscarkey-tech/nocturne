"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export interface PlatformSceneProps {
  /** `final` turns half the lights off and stills the rain. */
  mood?: "waiting" | "final";
  rain?: boolean;
  /** Printed on the hanging station sign. */
  stationName?: string;
  className?: string;
}

/**
 * A small rural station at night, nearly empty: wet concrete, a canopy of
 * warm fluorescent tubes, two benches, one vending machine, rails running off
 * into fog. The camera only breathes; nothing performs. Rendered at ~30fps,
 * paused off-screen, and a single still frame for reduced motion.
 */
export default function PlatformScene3D({ mood = "waiting", rain = true, stationName = "NOCTURNE", className = "" }: PlatformSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const moodRef = useRef(mood);
  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    } catch {
      return; // No WebGL: the CSS gradient behind stays.
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x05070b, 1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070b0f, 0.042);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    const disposables: { dispose(): void }[] = [];
    const track = <T extends { dispose(): void }>(x: T) => {
      disposables.push(x);
      return x;
    };

    // ------------------------------------------------------------------ textures
    const noiseTexture = (base: string, spots: string, size = 256, grain = 26, repeat: [number, number] = [2, 20]) => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const g = c.getContext("2d")!;
      g.fillStyle = base;
      g.fillRect(0, 0, size, size);
      const img = g.getImageData(0, 0, size, size);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() - 0.5) * grain;
        img.data[i] += n;
        img.data[i + 1] += n;
        img.data[i + 2] += n;
      }
      g.putImageData(img, 0, 0);
      for (let i = 0; i < 26; i++) {
        g.fillStyle = spots;
        g.globalAlpha = 0.05 + Math.random() * 0.1;
        g.beginPath();
        g.ellipse(Math.random() * size, Math.random() * size, 8 + Math.random() * 40, 6 + Math.random() * 26, Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      const tex = track(new THREE.CanvasTexture(c));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(...repeat);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    };
    const concrete = noiseTexture("#4a4b47", "#1a1c1a");
    const gravel = noiseTexture("#2a2a28", "#0e0f0e", 256, 60, [3, 40]);

    // ----------------------------------------------------------------- materials
    const mat = {
      platform: track(new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.42, metalness: 0.05, color: 0x9a9a92 })),
      edgeWhite: track(new THREE.MeshStandardMaterial({ color: 0xcfc8b4, roughness: 0.6 })),
      tactile: track(new THREE.MeshStandardMaterial({ color: 0x8c7a3c, roughness: 0.8 })),
      gravel: track(new THREE.MeshStandardMaterial({ map: gravel, roughness: 0.95 })),
      rail: track(new THREE.MeshStandardMaterial({ color: 0x8e9290, roughness: 0.28, metalness: 0.85 })),
      sleeper: track(new THREE.MeshStandardMaterial({ color: 0x2b2926, roughness: 0.9 })),
      steel: track(new THREE.MeshStandardMaterial({ color: 0x223029, roughness: 0.6, metalness: 0.4 })),
      roof: track(new THREE.MeshStandardMaterial({ color: 0x151b18, roughness: 0.85 })),
      tube: track(new THREE.MeshStandardMaterial({ color: 0xf5ead0, emissive: 0xf2e2bd, emissiveIntensity: 2.2 })),
      tubeOff: track(new THREE.MeshStandardMaterial({ color: 0x4a4a44, emissive: 0x000000 })),
      wood: track(new THREE.MeshStandardMaterial({ color: 0x4a3a2b, roughness: 0.75 })),
      grass: track(new THREE.MeshStandardMaterial({ color: 0x0c140f, roughness: 1 })),
      wire: track(new THREE.LineBasicMaterial({ color: 0x0b0d0d })),
    };

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), m);
      mesh.position.set(x, y, z);
      scene.add(mesh);
      return mesh;
    };

    // ------------------------------------------------------------------ platform
    const LEN = 90;
    const Z0 = 12;
    const zc = Z0 - LEN / 2;
    box(4.4, 1.1, LEN, mat.platform, 2.2, -0.55, zc); // slab, top at y=0
    box(0.12, 0.012, LEN, mat.edgeWhite, 0.12, 0.006, zc);
    box(0.3, 0.014, LEN, mat.tactile, 0.75, 0.007, zc);

    // Track bed, sleepers, rails.
    const bed = new THREE.Mesh(track(new THREE.PlaneGeometry(7, LEN + 40)), mat.gravel);
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(-3.2, -1.08, zc - 10);
    scene.add(bed);
    const sleeperGeo = track(new THREE.BoxGeometry(2.1, 0.14, 0.22));
    const sleepers = new THREE.InstancedMesh(sleeperGeo, mat.sleeper, 180);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 180; i++) {
      m4.makeTranslation(-1.75, -1.0, Z0 + 6 - i * 0.62);
      sleepers.setMatrixAt(i, m4);
    }
    scene.add(sleepers);
    for (const x of [-1.2, -2.27]) box(0.07, 0.14, LEN + 40, mat.rail, x, -0.88, zc - 10);
    const verge = new THREE.Mesh(track(new THREE.PlaneGeometry(60, LEN + 60)), mat.grass);
    verge.rotation.x = -Math.PI / 2;
    verge.position.set(-36, -1.1, zc - 20);
    scene.add(verge);

    // Canopy, pillars and tubes.
    const ROOF_FROM = 6;
    const ROOF_TO = -30;
    const roofLen = ROOF_FROM - ROOF_TO;
    box(4.6, 0.16, roofLen, mat.roof, 2.3, 3.35, (ROOF_FROM + ROOF_TO) / 2);
    box(0.08, 0.3, roofLen, mat.steel, 0.1, 3.2, (ROOF_FROM + ROOF_TO) / 2);
    for (let z = ROOF_FROM - 2; z > ROOF_TO; z -= 6.5) {
      box(0.16, 3.35, 0.16, mat.steel, 3.7, 1.675, z);
      box(0.1, 0.1, 3.4, mat.steel, 3.7, 3.2, z);
    }
    const tubes: THREE.Mesh[] = [];
    const lamps: THREE.PointLight[] = [];
    let k = 0;
    for (let z = ROOF_FROM - 3.4; z > ROOF_TO + 1; z -= 4.6) {
      const tube = box(0.09, 0.05, 1.3, mat.tube, 1.9, 3.22, z);
      tubes.push(tube);
      if (k++ % 2 === 0) {
        const light = new THREE.PointLight(0xf3e0bb, 5.5, 13, 1.7);
        light.position.set(1.9, 3.0, z);
        scene.add(light);
        lamps.push(light);
      }
    }
    // Beyond the canopy: two sodium lamps on posts.
    for (const z of [-40, -54]) {
      box(0.1, 4, 0.1, mat.steel, 3.6, 2, z);
      box(0.5, 0.08, 0.2, mat.tube, 3.35, 4, z);
      const sodium = new THREE.PointLight(0xe8a860, 4, 12, 1.8);
      sodium.position.set(3.3, 3.8, z);
      scene.add(sodium);
      lamps.push(sodium);
    }

    // Benches.
    for (const z of [-4, -17]) {
      box(1.7, 0.05, 0.42, mat.wood, 3.1, 0.46, z);
      box(1.7, 0.4, 0.05, mat.wood, 3.1, 0.75, z + 0.22);
      for (const dx of [-0.7, 0.7]) box(0.05, 0.46, 0.4, mat.steel, 3.1 + dx, 0.23, z);
    }

    // Vending machine: the one cool light on the platform.
    const vmFace = document.createElement("canvas");
    vmFace.width = 128;
    vmFace.height = 256;
    {
      const g = vmFace.getContext("2d")!;
      g.fillStyle = "#dfe7ea";
      g.fillRect(0, 0, 128, 256);
      g.fillStyle = "#1c2830";
      g.fillRect(8, 150, 112, 96);
      const colors = ["#9b3b33", "#2f5d86", "#c9a54a", "#3f6f4b", "#e8e2d2", "#7a3f5e"];
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 6; col++) {
          g.fillStyle = colors[(row * 2 + col) % colors.length];
          g.fillRect(12 + col * 18, 14 + row * 44, 12, 30);
        }
    }
    const vmTex = track(new THREE.CanvasTexture(vmFace));
    vmTex.colorSpace = THREE.SRGBColorSpace;
    const vmMat = track(new THREE.MeshStandardMaterial({ color: 0x9aa4a8, emissive: 0xffffff, emissiveMap: vmTex, emissiveIntensity: 1.1, map: vmTex }));
    const vm = new THREE.Mesh(track(new THREE.BoxGeometry(0.9, 1.85, 0.75)), [mat.steel, mat.steel, mat.steel, mat.steel, mat.steel, vmMat].map((m, i) => (i === 4 ? vmMat : m)));
    vm.position.set(3.9, 0.925, -10);
    vm.rotation.y = -Math.PI / 2;
    scene.add(vm);
    const vmLight = new THREE.PointLight(0xd8ecf2, 2.2, 6, 2);
    vmLight.position.set(3.2, 1.1, -10);
    scene.add(vmLight);

    // Hanging station sign.
    const sign = document.createElement("canvas");
    sign.width = 512;
    sign.height = 128;
    {
      const g = sign.getContext("2d")!;
      g.fillStyle = "#ece6d6";
      g.fillRect(0, 0, 512, 128);
      g.fillStyle = "#2d3d35";
      g.fillRect(0, 96, 512, 32);
      g.fillStyle = "#1a201d";
      g.font = "600 52px ui-monospace, Menlo, monospace";
      g.textAlign = "center";
      g.fillText(stationName.slice(0, 16), 256, 72);
    }
    const signTex = track(new THREE.CanvasTexture(sign));
    signTex.colorSpace = THREE.SRGBColorSpace;
    const signMesh = new THREE.Mesh(
      track(new THREE.PlaneGeometry(1.8, 0.45)),
      track(new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.25, side: THREE.DoubleSide })),
    );
    signMesh.position.set(1.9, 2.75, -12);
    scene.add(signMesh);
    for (const dx of [-0.8, 0.8]) box(0.02, 0.45, 0.02, mat.steel, 1.9 + dx, 3.1, -12);

    // Catenary poles and wires over the track.
    const wirePoints: THREE.Vector3[] = [];
    for (let z = Z0; z > -120; z -= 24) {
      box(0.18, 6.5, 0.18, mat.steel, -4.3, 2.2, z);
      box(3.6, 0.1, 0.1, mat.steel, -2.6, 5.2, z);
    }
    for (let z = Z0; z > -120; z -= 2) wirePoints.push(new THREE.Vector3(-1.75, 4.95 - 0.12 * Math.sin(((z - Z0) / 24) * Math.PI) ** 2, z));
    scene.add(new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(wirePoints)), mat.wire));

    // A signal far down the line.
    const signal = new THREE.Mesh(track(new THREE.SphereGeometry(0.09, 12, 12)), track(new THREE.MeshBasicMaterial({ color: 0xd2503f })));
    signal.position.set(-3.4, 3.1, -78);
    scene.add(signal);
    box(0.12, 3.2, 0.12, mat.steel, -3.4, 1.5, -78);

    // Sky and distant hills (outside the fog so they read as silhouettes).
    const sky = new THREE.Mesh(
      track(new THREE.SphereGeometry(220, 32, 16)),
      track(
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          depthWrite: false,
          fog: false,
          uniforms: {},
          vertexShader: "varying vec3 vPos; void main(){ vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
          fragmentShader:
            "varying vec3 vPos; void main(){ float h = clamp(vPos.y*1.6+0.12,0.0,1.0); vec3 low = vec3(0.055,0.075,0.075); vec3 high = vec3(0.012,0.018,0.035); gl_FragColor = vec4(mix(low, high, h),1.0); }",
        }),
      ),
    );
    scene.add(sky);
    const hillsShape = new THREE.Shape();
    hillsShape.moveTo(-160, -2);
    for (let x = -160; x <= 160; x += 8) hillsShape.lineTo(x, 7 + Math.sin(x * 0.045) * 5 + Math.sin(x * 0.13) * 2.2);
    hillsShape.lineTo(160, -2);
    const hills = new THREE.Mesh(track(new THREE.ShapeGeometry(hillsShape)), track(new THREE.MeshBasicMaterial({ color: 0x080d0b, fog: false })));
    hills.position.set(-20, -1, -150);
    scene.add(hills);
    const farLights = new THREE.Points(
      track(
        new THREE.BufferGeometry().setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            Array.from({ length: 40 }, () => [-80 + Math.random() * 120, -0.2 + Math.random() * 2.5, -140]).flat(),
            3,
          ),
        ),
      ),
      track(new THREE.PointsMaterial({ color: 0xe0b070, size: 0.45, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.75 })),
    );
    scene.add(farLights);

    // Rain: thin streaks, only really visible under the lamps.
    const DROPS = rain ? 700 : 0;
    const rainPos = new Float32Array(DROPS * 6);
    const seedDrop = (i: number, y = Math.random() * 7) => {
      const x = -5 + Math.random() * 11;
      const z = 8 - Math.random() * 50;
      rainPos.set([x, y, z, x - 0.02, y - 0.28, z], i * 6);
    };
    for (let i = 0; i < DROPS; i++) seedDrop(i);
    const rainGeo = track(new THREE.BufferGeometry());
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    const rainLines = new THREE.LineSegments(rainGeo, track(new THREE.LineBasicMaterial({ color: 0xaab8c2, transparent: true, opacity: 0.22 })));
    if (DROPS) scene.add(rainLines);

    // Soft fill so silhouettes never go fully black.
    scene.add(new THREE.HemisphereLight(0x1d2934, 0x0b0d0b, 0.5));

    // ------------------------------------------------------------------ loop
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      // Narrow (portrait) frames need a wider view to keep the tracks in shot.
      camera.fov = camera.aspect < 0.8 ? 58 : camera.aspect < 1.2 ? 48 : 40;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const base = new THREE.Vector3(2.75, 1.55, 7.5);
    const look = new THREE.Vector3(0.6, 1.1, -30);
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let visible = true;
    let flicker = 0;
    const start = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;
      if (acc < 1 / 30 || !visible) return;
      const step = acc;
      acc = 0;
      const t = (now - start) / 1000;
      const final = moodRef.current === "final";

      // The camera only breathes.
      camera.position.set(base.x + Math.sin(t * 0.07) * 0.06, base.y + Math.sin(t * 0.21) * 0.012, base.z + Math.sin(t * 0.05) * 0.1);
      camera.lookAt(look.x + Math.sin(t * 0.04) * 0.35, look.y, look.z);

      // At the last station of the night half the tubes are off.
      tubes.forEach((tube, i) => {
        tube.material = final && i % 2 === 1 ? mat.tubeOff : mat.tube;
      });
      lamps.forEach((l, i) => {
        const target = final && i % 2 === 1 ? 1.2 : i >= lamps.length - 2 ? 4 : 5.5;
        l.intensity += (target - l.intensity) * Math.min(1, step * 1.5);
      });
      // One tube hums and, very rarely, flickers.
      if (!final && Math.random() < step * 0.04) flicker = 0.25;
      if (flicker > 0) {
        flicker -= step;
        tubes[2].material = Math.random() > 0.5 ? mat.tube : mat.tubeOff;
      }
      signal.visible = true;

      if (DROPS && !final) {
        for (let i = 0; i < DROPS; i++) {
          const o = i * 6;
          const fall = step * (7 + (i % 5));
          rainPos[o + 1] -= fall;
          rainPos[o + 4] -= fall;
          if (rainPos[o + 4] < -1) seedDrop(i, 7);
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
      renderer.render(scene, camera);
    };

    if (reduce) {
      camera.position.copy(base);
      camera.lookAt(look);
      renderer.render(scene, camera);
    } else {
      raf = requestAnimationFrame(frame);
    }

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && !document.hidden;
    });
    io.observe(mount);
    const onVisibility = () => {
      visible = !document.hidden;
      last = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [rain, stationName]);

  return <div ref={mountRef} className={className} aria-hidden />;
}
