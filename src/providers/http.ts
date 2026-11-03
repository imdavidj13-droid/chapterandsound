export async function getJson<T>(url: URL): Promise<T> {
  if (url.protocol !== 'https:') throw new Error('HTTPS required');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: {Accept: 'application/json', 'User-Agent': 'ChapterAndSoundCatalogueResearch/0.1 (development contact required before production)'},
  });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' from ' + url.hostname);
  return await response.json() as T;
}
export function checkedAt(): string { return new Date().toISOString(); }
export function readableError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown provider error';
}
