/**
 * Rough token estimation for AI costs
 * 1 token ≈ 4 chars in English, ≈ 2 chars in Hungarian
 */

export const estimateTokens = (text, language = 'hu') => {
  if (!text) return 0;
  const charsPerToken = language === 'hu' ? 2 : 4;
  return Math.ceil(text.length / charsPerToken);
};

export const estimateImageTokens = (width, height) => {
  // Rough estimate: higher res = more tokens
  return Math.ceil((width * height) / 1000);
};

export const estimateTotalCost = (inputTokens, outputTokens, model = 'gemini_3_flash') => {
  // Rough pricing (adjust based on actual rates)
  const rates = {
    'gemini_3_flash': { input: 0.00001, output: 0.00002 },
    'gpt_5_mini': { input: 0.00015, output: 0.0006 },
  };
  
  const rate = rates[model] || rates['gemini_3_flash'];
  const cost = (inputTokens * rate.input) + (outputTokens * rate.output);
  return cost.toFixed(6);
};

export const formatTokenCount = (tokens) => {
  if (tokens > 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
};