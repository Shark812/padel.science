"use client";

import * as React from "react";
import type { VariantProps } from "class-variance-authority";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Ripple = {
  id: number;
  x: number;
  y: number;
  size: number;
};

type RippleButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants>;

export function RippleButton({
  children,
  className,
  onPointerDown,
  variant = "default",
  size = "default",
  ...props
}: RippleButtonProps) {
  const [ripples, setRipples] = React.useState<Ripple[]>([]);
  const rippleId = React.useRef(0);

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    onPointerDown?.(event);

    if (event.defaultPrevented || props.disabled) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const sizeValue = Math.max(rect.width, rect.height) * 2;
    const id = rippleId.current;
    rippleId.current += 1;

    setRipples((current) => [
      ...current,
      {
        id,
        x: event.clientX - rect.left - sizeValue / 2,
        y: event.clientY - rect.top - sizeValue / 2,
        size: sizeValue,
      },
    ]);

    window.setTimeout(() => {
      setRipples((current) => current.filter((ripple) => ripple.id !== id));
    }, 650);
  }

  return (
    <button
      className={cn(
        buttonVariants({ variant, size }),
        "relative overflow-hidden",
        className,
      )}
      onPointerDown={handlePointerDown}
      {...props}
    >
      {ripples.map((ripple) => (
        <span
          aria-hidden="true"
          key={ripple.id}
          className="pointer-events-none absolute rounded-full bg-current/25 motion-safe:animate-ripple"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: ripple.size,
            height: ripple.size,
          }}
        />
      ))}
      <span className="relative z-10 inline-flex items-center justify-center gap-inherit">
        {children}
      </span>
    </button>
  );
}
