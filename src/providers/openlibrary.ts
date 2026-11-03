import type { CatalogueProvider, ProviderResult, SearchQuery, WorkCandidate } from '../catalogue/types.js';
import {checkedAt, getJson, readableError} from './http.js';

interface Doc { key?: string; title?: string; author_name?: string[]; author_key?: string[];
  first_publish_year?: number; isbn?: string[]; edition_key?: string[]; }
interface Response { docs?: Doc[]; }
export class OpenLibraryProvider implements CatalogueProvider {
  readonly id = 'openlibrary' as const;
  async search(query: SearchQuery): Promise<ProviderResult> {
    const now = checkedAt();
    try {
      if (!query.title && !query.isbn) throw new Error('Title or ISBN required');
      const url = new URL('https://openlibrary.org/search.json');
      if (query.title) url.searchParams.set('title', query.title);
      if (query.author) url.searchParams.set('author', query.author);
      if (query.isbn) url.searchParams.set('isbn', query.isbn);
      url.searchParams.set('fields', 'key,title,author_name,author_key,first_publish_year,isbn,edition_key');
      url.searchParams.set('limit', String(Math.min(Math.max(query.limit ?? 10, 1), 20)));
      const body = await getJson<Response>(url);
      const candidates: WorkCandidate[] = (body.docs ?? []).filter(d => d.key && d.title).map(d => {
        const sourceId = d.key!.replace(/^\/works\//, '');
        return {
          provider: this.id, sourceId, title: d.title!,
          authors: (d.author_name ?? []).map((name, i) => ({
            name, role: 'author' as const, sourceId: d.author_key?.[i],
          })),
          firstPublishedYear: d.first_publish_year,
          // Search results can contain edition keys, but their facts require a separate verified lookup.
          editions: [],
          attribution: {provider: this.id, sourceId, retrievedAt: now},
        };
      });
      return {provider: this.id, candidates, checkedAt: now, status: 'ok'};
    } catch (e) { return {provider: this.id, candidates: [], checkedAt: now, status: 'error', error: readableError(e)}; }
  }
}
