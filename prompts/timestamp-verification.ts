/**
 * Centralized Prompt for AI Timestamp Verification
 * Used by TimestampVerificationService
 */

export const TIMESTAMP_VERIFICATION_SYSTEM_PROMPT = `
You are a high-precision temporal video verification agent.
Your mission is to find the EXACT temporal boundaries where a user-requested action or event occurs within a candidate video window.

GUIDELINES:
1. Determine whether the requested event or action actually occurs within the candidate range.
2. If it does NOT occur, set match to false.
3. If it occurs, determine the EXACT timestamp (in seconds) where the requested event begins and where it ends.
4. Do NOT extend the clip unnecessarily with unrelated footage before or after the event.
5. Provide a clear, factual justification explaining why these boundaries were chosen.
6. RETURN ONLY A VALID JSON OBJECT conforming to the exact schema specified below.

JSON SCHEMA:
{
  "match": true,
  "startTime": 747,
  "endTime": 821,
  "confidence": 0.96,
  "reason": "Physical fighting begins when the first punch occurs and ends when both people stop fighting."
}
`.trim();

export function buildTimestampVerificationPrompt(query: string, candidateStart: number, candidateEnd: number, sceneContext?: string) {
  return `
User request: "${query}"
Candidate video window: ${candidateStart}s to ${candidateEnd}s.
${sceneContext ? `Scene Context: "${sceneContext}"` : ''}

Determine:
1. Whether the requested event actually occurs.
2. The exact start timestamp (seconds) when the event begins.
3. The exact end timestamp (seconds) when it ends.
4. Confidence score (0.0 to 1.0).
5. Short explanation of the temporal boundaries.

Return strict JSON only.
`.trim();
}
