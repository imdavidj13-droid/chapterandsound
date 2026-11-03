import type { WorkCandidate } from './types.js';

export function normalizeName(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
export function titleSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = new Set(x.split(' '));
  const B = new Set(y.split(' '));
  let overlap = 0;
  for (const token of A) if (B.has(token)) overlap++;
  return overlap / (A.size + B.size - overlap);
}
export type Decision = 'strong_candidate' | 'review_required' | 'unmatched';
export interface MatchAssessment { decision: Decision; score: number; reasons: string[]; }
/** A score is a triage hint, never authorisation to auto-merge two source records. */
export function assessMatch(title: string, author: string, work: WorkCandidate): MatchAssessment {
  const titleScore = titleSimilarity(title, work.title);
  const authorMatch = work.authors.some(a => normalizeName(a.name) === normalizeName(author));
  const score = Math.round((titleScore * 0.75 + (authorMatch ? 0.25 : 0)) * 100);
  const reasons = [titleScore === 1 ? 'exact_normalized_title' : 'nonexact_title'];
  reasons.push(authorMatch ? 'exact_normalized_author' : 'author_unverified');
  return {
    decision: titleScore === 1 && authorMatch ? 'strong_candidate'
      : score >= 55 ? 'review_required' : 'unmatched',
    score, reasons,
  };
}
/** Only a previously verified shared identifier is sufficient for deterministic joining. */
export function sameVerifiedEdition(a: {isbn13?: string; asin?: string}, b: {isbn13?: string; asin?: string}): boolean {
  return Boolean((a.isbn13 && b.isbn13 && a.isbn13 === b.isbn13)
    || (a.asin && b.asin && a.asin === b.asin));
}
