"use client";

// Lightweight confetti trigger using dynamic import to avoid bundling cost
export function useConfetti() {
  return async function fire() {
    try {
      const mod = await import('canvas-confetti');
      const confetti = mod.default;
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
    } catch (e) {
      console.warn('Confetti not available', e);
    }
  }
}
