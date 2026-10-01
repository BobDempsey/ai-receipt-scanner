import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next writes its own AGENTS.md and CLAUDE.md at the repo root unless this is
  // off. This project keeps its agent instructions in .claude/ and handoff.md,
  // so the generated pair would sit beside them saying something else.
  agentRules: false,
};

export default nextConfig;
