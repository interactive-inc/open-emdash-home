/** Resolve only saved Pages entries; new-entry and unrelated editors have no preview. */
export const getEditorPageId = (pathname: string): string | null => {
  const match = /^(?:\/_emdash\/admin)?\/content\/pages\/([^/]+)\/?$/.exec(pathname);

  if (!match || match[1] === 'new') return null;

  return match[1];
};
