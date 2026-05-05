"use client";

import { useEffect, useRef } from "react";
import type React from "react";

import { cn } from "@/lib/utils";

type Star = {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  speed: number;
};

type StarsBackgroundProps = React.ComponentProps<"div"> & {
  factor?: number;
  speed?: number;
  starColor?: string;
  pointerEvents?: boolean;
};

export function StarsBackground({
  className,
  factor = 0.05,
  speed = 50,
  starColor,
  pointerEvents = true,
  ...props
}: StarsBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    const parentElement = canvasElement?.parentElement;
    if (!canvasElement || !parentElement) return;

    const canvas = canvasElement;
    const parent = parentElement;
    const contextValue = canvas.getContext("2d");
    if (!contextValue) return;
    const context: CanvasRenderingContext2D = contextValue;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = { x: 0, y: 0 };
    const stars: Star[] = [];
    let elapsed = 0;
    let lastFrameTime = 0;
    let animationId = 0;
    let width = 0;
    let height = 0;
    let devicePixelRatio = 1;

    function randomStar(): Star {
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0.55 + Math.random() * 1.85,
        alpha: 0.2 + Math.random() * 0.58,
        speed: 0.35 + Math.random() * 1.15,
      };
    }

    function resize() {
      const rect = parent.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * devicePixelRatio);
      canvas.height = Math.floor(height * devicePixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

      const starCount = Math.max(72, Math.floor((width * height) / 7200));
      stars.length = 0;
      for (let index = 0; index < starCount; index += 1) {
        stars.push(randomStar());
      }
    }

    function draw(timestamp = 0) {
      if (!lastFrameTime) lastFrameTime = timestamp;
      const delta = timestamp - lastFrameTime;
      lastFrameTime = timestamp;

      if (!mediaQuery.matches) {
        elapsed += delta / 1000;
      }

      context.clearRect(0, 0, width, height);
      const color = starColor ?? getComputedStyle(canvas).color;

      for (const star of stars) {
        const drift = mediaQuery.matches ? 0 : (elapsed * speed * star.speed) % height;
        const x = (star.x + pointer.x * factor * star.speed + width) % width;
        const y = (star.y - drift + pointer.y * factor * star.speed + height * 2) % height;
        const pulse = mediaQuery.matches ? 1 : 0.78 + Math.sin(elapsed * 2.2 + star.x) * 0.22;

        context.globalAlpha = star.alpha * pulse;
        context.beginPath();
        context.arc(x, y, star.radius, 0, Math.PI * 2);
        context.fillStyle = color;
        context.fill();
      }

      context.globalAlpha = 1;
      animationId = window.requestAnimationFrame(draw);
    }

    function handlePointerMove(event: PointerEvent) {
      const rect = parent.getBoundingClientRect();
      pointer.x = event.clientX - rect.left - width / 2;
      pointer.y = event.clientY - rect.top - height / 2;
    }

    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    resize();
    draw();

    return () => {
      window.cancelAnimationFrame(animationId);
      observer.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, [factor, speed, starColor]);

  return (
    <div
      aria-hidden="true"
      className={cn("absolute inset-0 overflow-hidden", !pointerEvents && "pointer-events-none", className)}
      {...props}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
