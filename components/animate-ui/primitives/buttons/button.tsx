'use client';

// Adapted from Animate UI's Button. See ../../LICENSE.md.
// Native buttons only; disabled and reduced-motion states suppress scaling.
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';

export type ButtonProps = HTMLMotionProps<'button'> & {
  hoverScale?: number;
  tapScale?: number;
};

export function Button({ hoverScale = 1.025, tapScale = 0.97, disabled, type = 'button', ...props }: ButtonProps) {
  const reducedMotion = useReducedMotion();
  return <motion.button
    type={type}
    disabled={disabled}
    whileHover={disabled || reducedMotion ? undefined : { scale: hoverScale }}
    whileTap={disabled || reducedMotion ? undefined : { scale: tapScale }}
    {...props}
  />;
}
