import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { WORKSPACE_LINKS, splitWorkspaceLinks } from '../src/lib/workspace-nav.ts';
import { canAccessModule, canReadCosts } from '../src/lib/permissions.ts';

const hrefs = (links) => links.map((link) => link.href);

test('Navigation : cinq modules principaux et les réglages toujours dans Plus', () => {
  const simple = splitWorkspaceLinks(WORKSPACE_LINKS, false);
  assert.deepEqual(hrefs(simple.core), ['/tableau-de-bord', '/caisse', '/cake-design', '/recettes', '/stocks']);
  assert.deepEqual(hrefs(simple.extra), ['/parametres']);
  const advanced = splitWorkspaceLinks(WORKSPACE_LINKS, true);
  assert.deepEqual(hrefs(advanced.core), hrefs(simple.core));
  assert.deepEqual(hrefs(advanced.extra), hrefs(WORKSPACE_LINKS.filter((link) => !link.primary)));
  assert.equal(new Set([...hrefs(advanced.core), ...hrefs(advanced.extra)]).size, WORKSPACE_LINKS.length);
});

test('Navigation : les liens filtrés par rôle restent filtrés dans Plus', () => {
  for (const role of ['proprietaire', 'labo', 'vendeur']) {
    const allowed = WORKSPACE_LINKS.filter(({ href }) => {
      if (href === '/parametres' || href === '/tableau-de-bord') return true;
      if (['/recettes', '/simulation'].includes(href) && !canReadCosts(role) && !(role === 'labo' && href === '/recettes')) return false;
      return canAccessModule(role, href.slice(1));
    });
    for (const advancedMode of [false, true]) {
      const { core, extra } = splitWorkspaceLinks(allowed, advancedMode);
      assert.ok(hrefs(extra).includes('/parametres'));
      for (const link of [...core, ...extra]) assert.ok(allowed.includes(link));
      if (!advancedMode) assert.ok(extra.every((link) => !link.advanced));
    }
  }
});

test('Navigation : un seul menu Plus et apparence accessible dans les paramètres', () => {
  const nav = readFileSync('src/components/workspace-nav.tsx', 'utf8');
  const layout = readFileSync('src/app/(app)/layout.tsx', 'utf8');
  const settings = readFileSync('src/app/(app)/parametres/page.tsx', 'utf8');
  assert.equal((nav.match(/extra\.map\(item\)/g) ?? []).length, 1);
  assert.match(nav, /event\.key === "Escape"/);
  assert.doesNotMatch(layout, /QuickDesignMenu|QuickColorMode/);
  assert.match(settings, /<AppearanceSettings\s*\/>/);
  assert.match(settings, /<AdvancedModeToggle/);
});
