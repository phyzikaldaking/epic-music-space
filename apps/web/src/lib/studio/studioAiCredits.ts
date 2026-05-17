export const STUDIO_AI_CREDIT_COSTS = {
  beatGeneration: 10,
  stemGeneration: 20,
  vocalEnhancement: 12,
  arrangementSuggestion: 6,
  masteringPreview: 15,
  stemSeparation: 30,
  aiMixPass: 24,
  aiMasterPass: 18,
  harmonyGeneration: 14,
} as const;

export type StudioAiAction = keyof typeof STUDIO_AI_CREDIT_COSTS;

export function getAiCreditCost(action: StudioAiAction) {
  return STUDIO_AI_CREDIT_COSTS[action];
}

export function canAffordAiAction(balance: number, action: StudioAiAction) {
  return balance >= getAiCreditCost(action);
}

export function consumeAiCredits(balance: number, action: StudioAiAction) {
  return Math.max(0, balance - getAiCreditCost(action));
}
