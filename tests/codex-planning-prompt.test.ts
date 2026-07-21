import { describe, expect, it } from "vitest";
import { buildPlanningPrompt } from "../src/server/providers/codex-planning-adapter.js";

describe("Codex context planning prompt", () => {
  it("delimits user claims from repository findings and unresolved questions", () => {
    const prompt = buildPlanningPrompt({ projectId: "mk-42", repositoryPath: "/tmp/repo", instruction: "Resolve the reported icing problem.", readOnly: true, proposalRevision: 2, providerSessionId: "thread-1", previousProposal: null, modification: null, contextPacket: { summary: "My suit freezes at high altitude." } });
    expect(prompt).toContain("USER-SUPPLIED CONTEXT");
    expect(prompt).toContain("REPOSITORY-CONFIRMED FINDINGS");
    expect(prompt).toContain("GENERAL KNOWLEDGE AND INFERENCES");
    expect(prompt).toContain("UNRESOLVED QUESTIONS");
    expect(prompt).toContain("USER-SUPPLIED CONTEXT\nMy suit freezes at high altitude.");
    expect(prompt).not.toContain("OPTIONAL STRUCTURED DETAILS");
    expect(prompt).toContain("Resolve the reported icing problem.");
    expect(prompt).toContain("ask at most one smallest, targeted question");
    expect(prompt).toContain("General model knowledge is allowed");
    expect(prompt).toContain("Do not invent repository files");
  });

  it("includes optional details only when the user supplied them", () => {
    const prompt = buildPlanningPrompt({ projectId: "mk-42", repositoryPath: "/tmp/repo", instruction: "Resolve icing.", readOnly: true, proposalRevision: 2, providerSessionId: "thread-1", previousProposal: null, modification: null, contextPacket: { summary: "The suit freezes.", evidence: "A temperature trace drops." } });
    expect(prompt).toContain("OPTIONAL STRUCTURED DETAILS");
    expect(prompt).toContain("A temperature trace drops.");
  });
});
