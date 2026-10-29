export function responseGenerationConfig(model: string, fast = false) {
  if (!fast) return undefined;
  const thinkingConfig = /^gemini-3[.-].*(flash|flash-lite)/.test(model)
    ? { thinkingLevel: "minimal" }
    : /^gemini-3[.-].*pro/.test(model)
      ? { thinkingLevel: "low" }
      : /^gemini-2\.5-flash/.test(model)
        ? { thinkingBudget: 0 }
        : undefined;
  return {
    maxOutputTokens: 1536,
    ...(thinkingConfig ? { thinkingConfig } : {}),
  };
}
