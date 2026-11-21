import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { sortFefo } from '../src/lib/fefo-cost.ts';

// Comparaison de la clause réellement présente dans la migration 21, sur des
// lots fictifs : ne prouve pas que cette définition est installée au pilote.
test('FEFO : ordre TypeScript et clause SQL de la migration 21 identiques', async () => {
  const sql = await readFile(new URL('../supabase/21-prix-demain-panier.sql', import.meta.url), 'utf8');
  const clauses = [...sql.matchAll(/order by l\.congele asc, l\.dlc asc nulls last, l\.date_reception asc, l\.id asc/gi)];
  assert.ok(clauses.length >= 3, 'Vérifier les règles SQL de vente, production et transfert');
  const order = clauses[0][0];
  const lots = [
    { id: '00000000-0000-0000-0000-000000000005', congele: true, dlc: '2028-01-01', date_reception: '2027-01-01', qte_rest: 1, pu: 1 },
    { id: '00000000-0000-0000-0000-000000000004', congele: false, dlc: null, date_reception: '2027-01-01', qte_rest: 1, pu: 1 },
    { id: '00000000-0000-0000-0000-000000000003', congele: false, dlc: '2028-04-01', date_reception: '2027-01-02', qte_rest: 1, pu: 1 },
    { id: '00000000-0000-0000-0000-000000000002', congele: false, dlc: '2028-04-01', date_reception: '2027-01-01', qte_rest: 1, pu: 1 },
    { id: '00000000-0000-0000-0000-000000000001', congele: false, dlc: '2028-04-01', date_reception: '2027-01-01', qte_rest: 1, pu: 1 },
  ];
  const db = new PGlite();
  try {
    const result = await db.query(`select l.id from jsonb_to_recordset($1::jsonb)
      as l(id uuid, congele boolean, dlc date, date_reception date) ${order}`, [JSON.stringify(lots)]);
    assert.deepEqual(sortFefo(lots).map(l => l.id), result.rows.map(row => row.id));
    assert.deepEqual(result.rows.map(row => row.id), [lots[4], lots[3], lots[2], lots[1], lots[0]].map(l => l.id));
  } finally {
    await db.close();
  }
});
