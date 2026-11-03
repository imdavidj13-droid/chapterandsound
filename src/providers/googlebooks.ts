import type { CatalogueProvider, ProviderResult, SearchQuery, WorkCandidate } from '../catalogue/types.js';
import {checkedAt, getJson, readableError} from './http.js';

interface Volume {id?: string; volumeInfo?: {title?: string; authors?: string[]; publisher?: string;
  publishedDate?: string; language?: string; pageCount?: number;
  industryIdentifiers?: {type: string; identifier: string}[]; }; }
interface Result { items?: Volume[]; }
export class GoogleBooksProvider implements CatalogueProvider {
  readonly id = 'googlebooks' as const;
  async search(query: SearchQuery): Promise<ProviderResult> {
    const now = checkedAt();
    try {
      const parts = [query.isbn ? 'isbn:' + query.isbn : '',
        query.title ? 'intitle:' + query.title : '', query.author ? 'inauthor:' + query.author : ''].filter(Boolean);
      if (!parts.length) throw new Error('Title, author or ISBN required');
      const url = new URL('https://www.googleapis.com/books/v1/volumes');
      url.searchParams.set('q', parts.join(' '));
      url.searchParams.set('maxResults', String(Math.min(Math.max(query.limit ?? 10, 1), 40)));
      const body = await getJson<Result>(url);
      const candidates: WorkCandidate[] = (body.items ?? []).filter(v => v.id && v.volumeInfo?.title).map(v => {
        const info = v.volumeInfo!;
        const sourceId = v.id!;
        const isbn13 = info.industryIdentifiers?.find(i => i.type === 'ISBN_13')?.identifier;
        return {
          provider: this.id, sourceId, title: info.title!,
          authors: (info.authors ?? []).map(name => ({name, role: 'author' as const})),
          editions: [{
            sourceId, format: 'unknown' as const, isbn13,
            publisher: info.publisher, publishedAt: info.publishedDate,
            language: info.language, pageCount: info.pageCount,
            contributors: [], attribution: {provider: this.id, sourceId, retrievedAt: now},
          }],
          attribution: {provider: this.id, sourceId, retrievedAt: now},
        };
      });
      // A Google volume ID is not a globally verified canonical work ID.
      return {provider: this.id, candidates, checkedAt: now, status: 'ok'};
    } catch (e) { return {provider: this.id, candidates: [], checkedAt: now, status: 'error', error: readableError(e)}; }
  }
}
