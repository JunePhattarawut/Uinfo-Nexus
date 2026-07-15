"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function WelcomePage() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.replace("/"), 2800);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div
      style={{ background: "#0f2044" }}
      className="flex min-h-screen flex-col items-center justify-center gap-8"
    >
      {/* Logo mark — animated path draw */}
      <div
        style={{
          animation: "uinfo-fade-scale 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
        }}
      >
        <svg
          viewBox="0 0 80 56"
          width="128"
          height="90"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Subtle glow behind the path */}
          <path
            d="M10,44 C10,8 28,8 28,44 C28,8 50,8 56,26 C62,44 74,26 78,8"
            fill="none"
            stroke="rgba(99,132,255,0.18)"
            strokeWidth="13"
            strokeLinecap="round"
          />
          {/* Main animated path */}
          <path
            d="M10,44 C10,8 28,8 28,44 C28,8 50,8 56,26 C62,44 74,26 78,8"
            fill="none"
            stroke="white"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 230,
              strokeDashoffset: 230,
              animation: "uinfo-draw 1.5s cubic-bezier(0.4,0,0.2,1) 0.25s both",
            }}
          />
        </svg>
      </div>

      {/* Brand name + subtitle */}
      <div
        className="flex flex-col items-center gap-1.5 text-center"
        style={{ animation: "uinfo-fade-up 0.5s ease-out 0.8s both" }}
      >
        <h1
          className="text-[22px] font-bold tracking-tight text-white"
          style={{ fontFamily: "var(--font-heading, sans-serif)" }}
        >
          Uinfo Nexus
        </h1>
        <p className="text-[13px] text-white/40">
          Preparing your workspace&hellip;
        </p>
      </div>

      {/* Pulsing dots */}
      <div
        className="flex items-center gap-2"
        style={{ animation: "uinfo-fade-up 0.4s ease-out 1.3s both" }}
        aria-label="Loading"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-[6px] w-[6px] rounded-full bg-white/40"
            style={{
              animation: `uinfo-pulse-dot 1.2s ease-in-out ${i * 200}ms infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
