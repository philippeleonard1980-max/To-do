"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import { ACCENT_HUE, AvatarScene, type Emotion } from "@/lib/avatar3d";

export interface Avatar3DHandle {
  setMouthOpen(value: number): void;
  setSpeaking(speaking: boolean): void;
  setEmotion(emotion: Emotion): void;
}

/**
 * Mounts the 3D companion onto a canvas.
 *
 * Three.js is imported by the scene module, which is heavy, so callers should
 * load this component with `next/dynamic` and `ssr: false` — there is no
 * WebGL context on the server and no reason to ship it in the initial bundle.
 */
export function Avatar3D({
  accent = "violet",
  className,
  handleRef,
  trackPointer = true,
}: {
  accent?: string;
  className?: string;
  handleRef?: Ref<Avatar3DHandle>;
  trackPointer?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<AvatarScene | null>(null);
  const [failed, setFailed] = useState(false);

  useImperativeHandle(
    handleRef,
    () => ({
      setMouthOpen: (v) => sceneRef.current?.setMouthOpen(v),
      setSpeaking: (s) => sceneRef.current?.setSpeaking(s),
      setEmotion: (e) => sceneRef.current?.setEmotion(e),
    }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let scene: AvatarScene | null = null;
    try {
      scene = new AvatarScene(canvas, {
        hue: ACCENT_HUE[accent] ?? ACCENT_HUE.violet,
        skin: 0xf3d9c8,
        reducedMotion: Boolean(reducedMotion),
      });
      sceneRef.current = scene;
    } catch (error) {
      // No WebGL (old browser, blocked context, headless): fall back to a
      // static placeholder rather than tearing the page down.
      console.error("Avatar scene failed to start:", error);
      setFailed(true);
      return;
    }

    return () => {
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [accent]);

  useEffect(() => {
    if (!trackPointer || failed) return;
    const onMove = (event: PointerEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      sceneRef.current?.lookAt(x, y);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [trackPointer, failed]);

  if (failed) {
    return (
      <div
        className={className}
        role="img"
        aria-label="3D character unavailable"
      >
        <div className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed border-[var(--border-strong)] p-6 text-center">
          <p className="text-xs text-faint">
            Your browser can&apos;t start WebGL, so the 3D view is off. Everything else works.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        aria-label="Animated 3D character"
        role="img"
      />
    </div>
  );
}
