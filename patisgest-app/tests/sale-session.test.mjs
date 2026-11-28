import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameSaleSession, sameSaleReplay } from '../src/lib/sale-session.ts';

test('caisse : une file ne peut être envoyée depuis un onglet avec une autre session', () => {
 const ctx={clientId:'atelier',authUserId:'alice'};
 assert.equal(sameSaleSession(ctx,'atelier','alice'),true);
 assert.equal(sameSaleSession(ctx,'atelier','bob'),false);
 assert.equal(sameSaleSession(ctx,'autre','alice'),false);
 assert.equal(sameSaleSession(ctx,null,null),false);
 assert.equal(sameSaleSession(ctx,new File(['x'],'x'),'alice'),false);
});


test('caisse : ne confirme un rejeu que si le mode et les lignes correspondent', () => {
 const request={modePaiement:'especes',lignes:[{articleId:'a',qte:2},{articleId:'b',qte:0.5}]};
 const stored={mode_paiement:'especes',lignes:[{articleId:'b',qty:0.5},{articleId:'a',qty:2}]};
 assert.equal(sameSaleReplay(request,stored),true);
 assert.equal(sameSaleReplay(request,{...stored,mode_paiement:'cheque_virement'}),false);
 assert.equal(sameSaleReplay(request,{...stored,lignes:[{articleId:'a',qty:1},{articleId:'b',qty:0.5}]}),false);
 assert.equal(sameSaleReplay(request,{...stored,lignes:[{articleId:'a',qty:2},{articleId:'a',qty:2}]}),false);
 assert.equal(sameSaleReplay(request,{...stored,lignes:null}),false);
});


/**
 * W1-B1 (revue 11/01) — `sellProduct` repacke le FormData des appels hérités.
 * Un identifiant de session recopié tel quel peut arriver entouré d'espaces
 * (copier/coller, ancien onglet, client non-React). Sans trim, la comparaison
 * stricte refuse un ticket pourtant légitime : la caisse ne vend plus.
 * Le trim ne relâche AUCUNE autorisation : l'identité réelle reste celle de
 * Auth, et une valeur vide reste refusée.
 */
test('caisse : un identifiant de session entouré d’espaces reste le même compte', () => {
  const ctx = { clientId: 'atelier', authUserId: 'alice' };
  // Doit accepter (regression : refusé avant correctif).
  assert.equal(sameSaleSession(ctx, ' atelier', 'alice'), true);
  assert.equal(sameSaleSession(ctx, 'atelier ', 'alice'), true);
  assert.equal(sameSaleSession(ctx, 'atelier', ' alice '), true);
  // Ne doit JAMAIS accepter : identité différente, vide, espaces seuls, non-string.
  assert.equal(sameSaleSession(ctx, 'autre', 'alice'), false);
  assert.equal(sameSaleSession(ctx, '', 'alice'), false);
  assert.equal(sameSaleSession(ctx, '   ', 'alice'), false);
  assert.equal(sameSaleSession(ctx, 'atelier', '   '), false);
  assert.equal(sameSaleSession(ctx, null, null), false);
});
