export interface ResearchEvidence {
  title: string;
  url: string;
  excerpt: string;
}

/** Future evidence boundary. Gate 2.6 does not register or invoke a live research adapter. */
export interface ResearchAdapter {
  readonly id: string;
  research(query: string): Promise<readonly ResearchEvidence[]>;
}
