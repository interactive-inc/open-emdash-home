import { loadPage, type LoadedPage } from './load-page.ts';

type Result = { page: LoadedPage | null; status: number };
export async function pageResponse(identifier: string): Promise<Result> {
  try {
    const page = await loadPage(identifier);
    return { page, status: page ? 200 : 404 };
  } catch (error) {
    console.error('[site-builder] Page resolution failed', error);
    return { page: null, status: 503 };
  }
}
