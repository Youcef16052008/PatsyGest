import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyserAccessibiliteSnapshot,
  formaterRapportB2,
  mesurerChargeHttp,
  percentile,
  resumerLatences,
} from '../scripts/audit-b2-reel.mjs';

test('audit B.2 : percentiles et résumé de charge HTTP', async () => {
  assert.equal(percentile([10, 20, 30, 40, 100], 50), 30);
  assert.equal(percentile([10, 20, 30, 40, 100], 95), 100);
  const resume = resumerLatences([12, 24, 50, 100], [200, 200, 200, 503]);
  assert.equal(resume.total, 4);
  assert.equal(resume.ok200, 3);
  assert.equal(resume.erreurs, 1);
  assert.equal(resume.tauxErreurPct, 25);

  const charge = await mesurerChargeHttp({
    cible: 'https://exemple.invalid/api/health',
    total: 8,
    concurrence: 4,
    fetchImpl: async () => ({
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(8),
    }),
  });
  assert.equal(charge.total, 8);
  assert.equal(charge.ok200, 8);
  assert.equal(charge.erreurs, 0);
});

test('audit B.2 : détection accessibilité et débordement RTL/mobile', () => {
  assert.deepEqual(
    analyserAccessibiliteSnapshot({
      lang: 'ar',
      dir: 'rtl',
      expectedDir: 'rtl',
      hasMain: true,
      hasH1: true,
      unlabeledControls: 0,
      brokenImages: 0,
      horizontalOverflowPx: 0,
    }),
    [],
  );

  const errs = analyserAccessibiliteSnapshot({
    lang: '',
    dir: 'ltr',
    expectedDir: 'rtl',
    hasMain: false,
    hasH1: false,
    unlabeledControls: 2,
    brokenImages: 1,
    horizontalOverflowPx: 14,
  });
  assert.equal(errs.length, 7);

  const md = formaterRapportB2({
    chromiumResults: [
      {
        label: 'prod:/estimation',
        viewport: '360x780',
        locale: 'fr',
        httpStatus: 200,
        ttfbMs: 85,
        fcpMs: 310,
        loadMs: 490,
        overflowPx: 0,
        ok: true,
        consoleErrors: [],
        pageErrors: [],
        badResponses: [],
        a11yProblemes: [],
      },
    ],
    loadResults: [
      {
        cible: 'https://patsy-gest.vercel.app/api/health',
        concurrence: 5,
        total: 50,
        ok200: 50,
        tauxErreurPct: 0,
        p50Ms: 65,
        p95Ms: 140,
        maxMs: 210,
        reqParSec: 60.5,
      },
    ],
  });
  assert.match(md, /prod:\/estimation/);
  assert.match(md, /310 ms/);
  assert.match(md, /60\.5 req\/s/);
});
