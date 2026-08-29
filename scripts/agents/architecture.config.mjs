export const architectureRules = {
  app: { mayImport: ["features", "platform", "shared", "app"] },
  features: { mayImport: ["features", "platform", "shared"] },
  platform: { mayImport: ["platform", "shared"] },
  shared: { mayImport: ["shared"] },
};

export const activeInstructionPaths = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".github/copilot-instructions.md",
  "docs/agents",
];
