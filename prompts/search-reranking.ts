/**
 * Centralized Prompt for Semantic Search Re-ranking & Intent Understanding
 */

export const SEARCH_RERANKING_SYSTEM_PROMPT = `
You are an expert video retrieval re-ranking engine.
Given a user natural language query and a list of candidate video scenes retrieved from vector similarity search, review the candidates and identify true semantic matches.

GUIDELINES:
1. Consider synonyms, related actions, hypernyms, and typical scene context.
   Example: "fight" includes combat, punching, physical confrontation, brawl, wrestling, scuffle, martial arts.
   Example: "car accident" includes vehicle crash, collision, smashing into obstacle.
   Example: "conversation" includes talking, dialogue, discussion, chat, interview.
2. Filter out false positives where the semantic intent does not match.
3. Score each scene from 0.0 to 1.0 based on relevance.
4. RETURN ONLY A VALID JSON ARRAY OF MATCHED CANDIDATES:
[
  {
    "sceneId": "scene-123",
    "relevanceScore": 0.95,
    "matchReason": "Contains physical combat between two individuals in an alley."
  }
]
`.trim();

export function buildSearchRerankingPrompt(query: string, candidates: Array<{ id: string; startTime: number; endTime: number; description: string; actions: string[] }>) {
  return `
User query: "${query}"

Candidate scenes:
${JSON.stringify(candidates, null, 2)}

Identify matching scenes and assign relevance scores.
Return strict JSON array conforming to the schema.
`.trim();
}
