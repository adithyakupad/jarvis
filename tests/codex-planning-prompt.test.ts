import { describe, expect, it } from "vitest";
import { buildPlanningPrompt } from "../src/server/providers/codex-planning-adapter.js";

describe("Codex context planning prompt", () => {
  it("delimits user claims from repository findings and unresolved questions", () => {
    const prompt = buildPlanningPrompt({ projectId: "mk-42", repositoryPath: "/tmp/repo", instruction: "Resolve the reported icing problem.", readOnly: true, proposalRevision: 2, providerSessionId: "thread-1", previousProposal: null, modification: null, contextPacket: { context: "My suit freezes at high altitude." } });
    expect(prompt).toContain("USER-SUPPLIED CONTEXT");
    expect(prompt).toContain("REPOSITORY-CONFIRMED FINDINGS");
    expect(prompt).toContain("UNRESOLVED ASSUMPTIONS OR QUESTIONS");
    expect(prompt).toContain("USER-SUPPLIED CONTEXT\nMy suit freezes at high altitude.");
    expect(prompt).not.toContain("OPTIONAL STRUCTURED DETAILS");
    expect(prompt).toContain("Resolve the reported icing problem.");
    expect(prompt).toContain("ask exactly one smallest, specific follow-up question");
    expect(prompt).toContain("Never present user claims as repository-confirmed facts");
  });

  it("includes optional details only when the user supplied them", () => {
    const prompt = buildPlanningPrompt({ projectId: "mk-42", repositoryPath: "/tmp/repo", instruction: "Resolve icing.", readOnly: true, proposalRevision: 2, providerSessionId: "thread-1", previousProposal: null, modification: null, contextPacket: { context: "The suit freezes.", evidence: "A temperature trace drops." } });
    expect(prompt).toContain("OPTIONAL STRUCTURED DETAILS");
    expect(prompt).toContain("A temperature trace drops.");
  });
});
