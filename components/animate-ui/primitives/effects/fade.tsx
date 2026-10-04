'use client';

// Adapted from Animate UI's Fade. See ../../LICENSE.md.
// Uses native divs and respects reduced motion; content is visible during SSR.
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';

type FadeProps = HTMLMotionProps<'div'> & { delay?: number; initialOpacity?: number; opacity?: number };

export function Fade({ delay = 0, initialOpacity = 0, opacity = 1, transition, ...props }: FadeProps) {
  const reducedMotion = useReducedMotion();
  return <motion.div
    initial={false}
    animate={{ opacity }}
    exit={{ opacity: initialOpacity }}
    transition={reducedMotion ? { duration: 0 } : { duration: 0.2, delay: delay / 1000, ...transition }}
    {...props}
  />;
}
