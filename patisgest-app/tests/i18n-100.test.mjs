import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI_TEXT_AR, translateUI } from '../src/lib/i18n.ts';
import { UI_TEXT_AR_COMPLET } from '../src/lib/ui-text-ar-complet.ts';
import { contientDonnee, estDonneePure } from '../src/lib/i18n-data.ts';

/*
 * B.2 — couverture exhaustive locale du catalogue FR extrait de l'AST et du
 * navigateur. Aucun service de traduction, aucune pile externe : le dictionnaire
 * est généré hors ligne et figé dans le dépôt.
 */

const catalogue = JSON.parse(readFileSync(new URL('../src/lib/ui-catalog-fr.json', import.meta.url), 'utf8'));
const ARABE = /[\u0600-\u06FF]/u;
const LATIN = /[A-Za-z]/;

test('B.2 : le catalogue FR et le dictionnaire AR couvrent toute la surface source', () => {
  assert.ok(catalogue.length >= 2_500, `catalogue trop court : ${catalogue.length}`);
  assert.ok(Object.keys(UI_TEXT_AR_COMPLET).length >= 2_100, 'dictionnaire généré trop court');
  assert.ok(Object.keys(UI_TEXT_AR).length >= 2_500, 'dictionnaire fusionné trop court');
  assert.equal(new Set(catalogue).size, catalogue.length, 'catalogue FR avec doublons');

  for (const fr of catalogue) {
    assert.equal(translateUI(fr, 'fr'), fr, `FR altéré : ${fr}`);
    const ar = translateUI(fr, 'ar');
    if (estDonneePure(fr) && !Object.hasOwn(UI_TEXT_AR, fr)) {
      assert.equal(ar, fr, `donnée pure traduite : ${fr}`);
      continue;
    }
    assert.notEqual(ar, fr, `libellé non traduit : ${fr}`);
    assert.match(ar, ARABE, `traduction sans arabe : ${fr} → ${ar}`);
    if (!contientDonnee(fr)) {
      assert.ok(!LATIN.test(ar), `résidu latin hors donnée : ${fr} → ${ar}`);
    }
  }
});

test('B.2 : les libellés dynamiques observés sur les 18 routes sont traduits', () => {
  const cas = [
    ['Démarrer Éclair chocolat', /^بدء /u],
    ['Retirer Beurre pâtissier', /^إزالة /u],
    ['Design Pilotage', /^تصميم /u],
    ['Type ligne 4', /نوع السطر 4/u],
    ['0,8 كغ avec parage', /مع التقشير/u],
    ['Évolution des ventes sur 30 jours : 1 234,56 DA au total', /تطور المبيعات على 30 أيام/u],
    ['Aïcha (Propriétaire) · Propriétaire', /مالكة/u],
    ['Passer en français', /التبديل إلى الفرنسية/u],
    ['Passer en mode sombre', /تفعيل الوضع الداكن/u],
    ['Mettre en pause les animations décoratives', /إيقاف الحركات/u],
    ['Filtrer les عناصر', /تصفية العناصر/u],
    ['Annulation indisponible avec un OF lié', /أمر تصنيع/u],
    ['sur', /على/u],
    ['Client', /العميل/u],
    ['Estimation ~49 % · hors charges fixes', /بدون تكاليف ثابتة/u],
    ['Inventaire', /الجرد/u],
    ['Tout', /الكل/u],
    ['Destination', /الوجهة/u],
    ['Date péremption (optionnel)', /تاريخ الصلاحية/u],
    ['3 articles à surveiller', /عناصر للمراقبة/u],
    ['3 عناصر à surveiller', /عناصر للمراقبة/u],
    ['3 dates à vérifier', /تواريخ للتحقق/u],
    ['· Espèces', /نقداً/u],
    ['· Chèque / virement', /شيك/u],
    ['disponible', /متاح/u],
    ['Proportionnel', /نسبي/u],
    ['Fournisseur', /المورد/u],
    ['Aucun transfert.', /لا توجد تحويلات/u],
    ['Date مبرمجة', /التاريخ المبرمج/u],
    ['2 articles à surveiller.', /2 عناصر للمراقبة/u],
    ['10 700 DA restent à encaisser. Vérifiez les échéances et relancez si besoin.', /تبقى لتحصيلها/u],
    ['3 tickets · encaissé', /تذاكر · محصّلة/u],
    ['~1.2j stock', /مخزون/u],
    ['· TK-ABCD1234', /مرجع/u],
    ['Devis (2026-11-27T17:00:00.000Z) → Acompte payé (2026-11-27T17:00:00.000Z) → Confirmé (2026-11-27T17:00:00.000Z)', /العربون مدفوع/u],
  ];
  for (const [fr, attendu] of cas) {
    assert.match(translateUI(fr, 'ar'), attendu, `motif dynamique non traduit : ${fr}`);
  }
  for (const fr of ['PâtisGest', 'Maison Amande', 'Éclair chocolat']) {
    assert.equal(translateUI(fr, 'ar'), fr, `nom propre altéré : ${fr}`);
  }
  assert.equal(translateUI('Ventes du jour', 'ar'), 'مبيعات اليوم');
  assert.equal(translateUI('Ventes du jour', 'fr'), 'Ventes du jour');
});

test('B.2 : le dictionnaire généré est déterministe, arabe et sans valeur vide', () => {
  for (const [fr, ar] of Object.entries(UI_TEXT_AR_COMPLET)) {
    assert.ok(fr.length > 0 && ar.length > 0, `entrée vide : ${fr}`);
    assert.match(ar, ARABE, `valeur non arabe : ${fr} → ${ar}`);
    if (!contientDonnee(fr)) assert.ok(!LATIN.test(ar), `latin résiduel : ${fr} → ${ar}`);
  }
});
