/** Dossiers actifs par date de retrait, puis dossiers clos du plus récent au plus ancien. */
export function compareCakePriority(a: { status: string; date: string; numero: string }, b: { status: string; date: string; numero: string }) {
  const aClosed = a.status === 'livre' || a.status === 'annule';
  const bClosed = b.status === 'livre' || b.status === 'annule';
  if (aClosed !== bClosed) return aClosed ? 1 : -1;
  const aDate = /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : (aClosed ? '' : '9999-99-99');
  const bDate = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : (bClosed ? '' : '9999-99-99');
  return (aClosed ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate)) || a.numero.localeCompare(b.numero);
}
