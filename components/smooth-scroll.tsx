'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';

export function SmoothScroll() {
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(pointer: fine)');
    let lenis: Lenis | undefined;
    function configure() {
      lenis?.destroy();
      lenis = undefined;
      if (!reducedMotion.matches && finePointer.matches) {
        lenis = new Lenis({ autoRaf: true, lerp: 0.12, syncTouch: false });
      }
    }
    configure();
    reducedMotion.addEventListener('change', configure);
    finePointer.addEventListener('change', configure);
    return () => {
      reducedMotion.removeEventListener('change', configure);
      finePointer.removeEventListener('change', configure);
      lenis?.destroy();
    };
  }, []);
  return null;
}
