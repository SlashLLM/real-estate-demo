"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The hero's biro drawing of a Singapore street, drawn in code with anidoodle (source in art/house-doodle).
 * houseDraw (9 s) plays once and ends on the finished drawing; houseIdle (6 s, seamless) then loops from that
 * same picture. Both are white-paper renders, multiplied over the hero so only the blue ink shows.
 * With prefers-reduced-motion the finished still is shown instead and nothing plays.
 */
export function HeroDoodle() {
  const [phase, setPhase] = useState<"draw" | "idle" | "still">("draw");
  const draw = useRef<HTMLVideoElement>(null);
  const idle = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      if (mq.matches) {
        draw.current?.pause();
        idle.current?.pause();
        setPhase("still");
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // The draw-in holds its last frame when it ends; start the loop underneath, then swap. No blank frame.
  const handOff = () => {
    const v = idle.current;
    if (!v) return setPhase("still");
    v.currentTime = 0;
    v.play().then(() => setPhase("idle")).catch(() => setPhase("still"));
  };

  const layer = "absolute inset-0 h-full w-full object-cover object-[32%_100%] mix-blend-multiply lg:object-[50%_100%]";

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      {phase === "still" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/images/doodle/house-still.webp"
          srcSet="/images/doodle/house-still-1600.webp 1600w, /images/doodle/house-still.webp 2400w"
          sizes="100vw"
          alt=""
          className={layer}
        />
      ) : (
        <>
          <video
            ref={draw}
            className={`${layer} ${phase === "draw" ? "opacity-100" : "opacity-0"}`}
            autoPlay
            muted
            playsInline
            preload="auto"
            onEnded={handOff}
          >
            {/* H.264 for Safari and most browsers; VP9 for Chromium builds without proprietary codecs */}
            <source src="/images/doodle/house-draw.mp4" type="video/mp4" />
            <source src="/images/doodle/house-draw.webm" type="video/webm" onError={() => setPhase("still")} />
          </video>
          <video
            ref={idle}
            className={`${layer} ${phase === "idle" ? "opacity-100" : "opacity-0"}`}
            muted
            playsInline
            loop
            preload="auto"
          >
            <source src="/images/doodle/house-idle.mp4" type="video/mp4" />
            <source src="/images/doodle/house-idle.webm" type="video/webm" />
          </video>
        </>
      )}
    </div>
  );
}
