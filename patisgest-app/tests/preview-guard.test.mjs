import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewBloquee, routePubliquePreview } from '../src/lib/preview-guard.ts';

test('un aperçu Vercel est bloqué, les autres environnements ne changent pas', () => {
  assert.equal(previewBloquee('preview'), true);
  assert.equal(previewBloquee('production'), false);
  assert.equal(previewBloquee('development'), false);
  assert.equal(previewBloquee(undefined), false);
  assert.equal(previewBloquee(undefined, '1'), true);
  assert.equal(previewBloquee('production', '1'), true);
  assert.equal(previewBloquee('preview', '0'), true);
});

test('seul le calculateur public en lecture passe en aperçu', () => {
  assert.equal(routePubliquePreview('/estimation', 'GET'), true);
  assert.equal(routePubliquePreview('/estimation', 'HEAD'), true);
  for (const [path, method] of [['/estimation','POST'],['/connexion','GET'],['/api/export','GET'],['/estimation/autre','GET'],['/','GET']]) {
    assert.equal(routePubliquePreview(path,method),false,`${method} ${path}`);
  }
});
