import { describe, expect, it } from "vitest";
import { buildPlanningPrompt } from "../src/server/providers/codex-planning-adapter.js";

describe("Codex context planning prompt", () => {
  it("delimits user claims from repository findings and unresolved questions", () => {
    const prompt = buildPlanningPrompt({ projectId: "mk-42", repositoryPath: "/tmp/repo", instruction: "Resolve the reported icing problem.", readOnly: true, proposalRevision: 2, providerSessionId: "thread-1", previousProposal: null, modification: null, contextPacket: { problem: "Ice forms on the left actuator.", evidence: "The trace drops below threshold." } });
    expect(prompt).toContain("USER-SUPPLIED CONTEXT");
    expect(prompt).toContain("REPOSITORY-CONFIRMED FINDINGS");
    expect(prompt).toContain("UNRESOLVED ASSUMPTIONS OR QUESTIONS");
    expect(prompt).toContain("--- BEGIN USER-SUPPLIED CONTEXT PACKET ---");
    expect(prompt).toContain("Resolve the reported icing problem.");
    expect(prompt).toContain("Ice forms on the left actuator.");
    expect(prompt).toContain("Never present user claims as repository-confirmed facts");
  });
});
