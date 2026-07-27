/**
 * PageTransition — direction-aware route transitions.
 *
 * Navigating "deeper" (map → venue → queue) slides forward; going back
 * reverses it. Honours prefers-reduced-motion.
 */

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const DEPTH = [
  [/^\/business\//, 1],
  [/^\/queue\//, 2],
  [/^\/booking\//, 2],
];

export function depthOf(pathname) {
  for (const [re, d] of DEPTH) if (re.test(pathname)) return d;
  return 0;
}

const SPRING = { type: 'spring', stiffness: 420, damping: 38, mass: 0.85 };
const FADE = { duration: 0.26, ease: [0.22, 1, 0.36, 1] };

export default function PageTransition({ children, dir = 0 }) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        style={{ minHeight: '100dvh' }}
      >
        {children}
      </motion.div>
    );
  }

  // dir: 1 = going deeper, -1 = going back, 0 = lateral (tab switch)
  const enterX = dir === 0 ? 0 : dir > 0 ? 36 : -36;
  const exitX = dir === 0 ? 0 : dir > 0 ? -28 : 28;

  return (
    <motion.div
      initial={{ opacity: 0, x: enterX, y: dir === 0 ? 10 : 0, scale: 0.985, filter: 'blur(5px)' }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, x: exitX, y: dir === 0 ? -6 : 0, scale: 0.99, filter: 'blur(4px)' }}
      transition={{
        x: SPRING,
        y: SPRING,
        scale: SPRING,
        opacity: FADE,
        filter: FADE,
      }}
      style={{ minHeight: '100dvh', willChange: 'transform, opacity, filter' }}
    >
      {children}
    </motion.div>
  );
}
