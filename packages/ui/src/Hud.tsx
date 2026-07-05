import { useEffect, useRef, useState } from 'react';
import { useAtlas } from './context';

export function Hud() {
  const { renderer } = useAtlas();
  const [fps, setFps] = useState(0);
  const needleRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frames = 0;
    let lastFpsAt = performance.now();
    let lastCompass = 0;
    const off = renderer.onFrame(() => {
      frames += 1;
      const now = performance.now();
      if (now - lastFpsAt >= 500) {
        setFps(Math.round((frames * 1000) / (now - lastFpsAt)));
        frames = 0;
        lastFpsAt = now;
      }
      if (now - lastCompass > 100 && needleRef.current) {
        lastCompass = now;
        const { x, y, z, w } = renderer.camera.quaternion;
        const fx = -(2 * (x * z + w * y));
        const fz = -(1 - 2 * (x * x + y * y));
        // North = -z. Rotate the needle so it keeps pointing north on screen.
        const yaw = Math.atan2(fx, -fz);
        needleRef.current.style.transform = `rotate(${yaw}rad)`;
      }
    });
    return off;
  }, [renderer]);

  return (
    <div className="atlas-hud">
      <div className="atlas-fps" data-testid="fps">
        {fps} FPS
      </div>
      <button className="atlas-compass" title="Reset north" onClick={() => renderer.goHome()}>
        <span ref={needleRef} className="needle">
          ➤
        </span>
      </button>
    </div>
  );
}
