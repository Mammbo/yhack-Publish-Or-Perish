"use client";

import ReactMarkdown from "react-markdown";
import BorderGlow from "../ui/BorderGlow";

export default function ProblemDisplay({ problem }: { problem: string }) {
  return (
    <BorderGlow
      backgroundColor="#111822"
      borderRadius={8}
      glowRadius={50}
      glowIntensity={0.9}
      colors={["#00DFA2", "#3399FF"]}
      fillOpacity={0.3}
      data-string="spotlight"
      data-string-id="problem-panel"
      data-string-lerp="0.2"
      className="problem-panel lab-scanlines"
    >
      <div className="p-6 relative z-10">
        <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)] mb-3">
          EXPERIMENT PROTOCOL
        </p>
        <div
          className="markdown-body leading-relaxed"
          style={{ color: "var(--lab-text)" }}
        >
          <ReactMarkdown>
            {problem || "Loading experiment protocol..."}
          </ReactMarkdown>
        </div>
      </div>
    </BorderGlow>
  );
}
