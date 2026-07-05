import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function App() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0e14);
    scene.fog = new THREE.Fog(0x0b0e14, 200, 900);

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      2000,
    );
    camera.position.set(120, 90, 120);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    const grid = new THREE.GridHelper(1000, 100, 0x2a3350, 0x1a2036);
    scene.add(grid);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(100, 200, 50);
    scene.add(sun);

    let frames = 0;
    let lastFpsAt = performance.now();
    let rafId = 0;

    const loop = () => {
      rafId = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
      frames += 1;
      const now = performance.now();
      if (now - lastFpsAt >= 500) {
        setFps(Math.round((frames * 1000) / (now - lastFpsAt)));
        frames = 0;
        lastFpsAt = now;
      }
    };
    loop();

    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      <div
        data-testid="fps"
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          padding: '4px 10px',
          borderRadius: 8,
          background: 'rgba(15, 20, 32, 0.7)',
          color: '#7fd77f',
          fontSize: 13,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {fps} FPS
      </div>
    </div>
  );
}
