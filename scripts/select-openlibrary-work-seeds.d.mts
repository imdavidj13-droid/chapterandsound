/** Types for the offline Open Library dump seed selector. */
export interface WorkSeedOptions {
  works: string;
  out: string;
  count?: number;
}
export interface WorkSeedResult {
  seeds: string;
  report: string;
  selected: number;
  eligible: number;
}
export function selectWorkSeeds(options: WorkSeedOptions): Promise<WorkSeedResult>;
