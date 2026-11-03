export type Format = 'paperback' | 'hardback' | 'ebook' | 'audiobook' | 'unknown';
export type ContributorRole = 'author' | 'narrator' | 'editor' | 'translator';
export type ProviderId = 'openlibrary' | 'googlebooks' | 'libex' | 'audnexus';
export type FieldStatus = 'supplied' | 'missing' | 'unverified' | 'conflict';
export interface Attribution { provider: ProviderId; sourceId: string; retrievedAt: string; }
export interface ContributorCandidate { name: string; role: ContributorRole; sourceId?: string; }
export interface EditionCandidate {
  sourceId: string; format: Format; isbn13?: string; asin?: string;
  publisher?: string; publishedAt?: string; language?: string;
  pageCount?: number; durationMinutes?: number; abridged?: boolean;
  contributors: ContributorCandidate[]; attribution: Attribution;
}
export interface WorkCandidate {
  provider: ProviderId; sourceId: string; title: string;
  authors: ContributorCandidate[]; firstPublishedYear?: number;
  editions: EditionCandidate[]; attribution: Attribution;
}
export interface SearchQuery { title?: string; author?: string; isbn?: string; limit?: number; }
export interface ProviderResult {
  provider: ProviderId; candidates: WorkCandidate[]; checkedAt: string;
  status: 'ok' | 'error'; error?: string;
}
export interface CatalogueProvider {
  readonly id: ProviderId;
  search(query: SearchQuery): Promise<ProviderResult>;
}
