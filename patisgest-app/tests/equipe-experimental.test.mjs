import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equipeExperimentaleActive } from '../src/lib/equipe-experimental.ts';

const local = { NODE_ENV:'development', PATSYGEST_EQUIPE_EXPERIMENTAL:'true', NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321' };
test('gestion équipe expérimentale : opt-in et API locale uniquement', () => {
  assert.equal(equipeExperimentaleActive(local),true);
  for (const change of [
    {NODE_ENV:'production'}, {VERCEL_ENV:'preview'}, {VERCEL_ENV:'production'},
    {PATSYGEST_EQUIPE_EXPERIMENTAL:'false'}, {PATSYGEST_EQUIPE_EXPERIMENTAL:undefined},
    {NEXT_PUBLIC_SUPABASE_URL:'https://pilote.supabase.co'},
    {NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54322'},
    {NEXT_PUBLIC_SUPABASE_URL:'http://localhost.evil.test:54321'},
    {NEXT_PUBLIC_SUPABASE_URL:'http://localhost:54321/path'},
    {NEXT_PUBLIC_SUPABASE_URL:'http://user:password@localhost:54321'},
    {NEXT_PUBLIC_SUPABASE_URL:'http://localhost:54321/?url=pilote'},
    {NEXT_PUBLIC_SUPABASE_URL:''},
  ]) assert.equal(equipeExperimentaleActive({...local,...change}),false,JSON.stringify(change));
});
