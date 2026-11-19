import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recettesPlanValides} from '../src/lib/tomorrow-recipe-guard.ts';
const article={id:'a',code:'A',nom:'Farine',unite:'kg'};
const ver=(id,ingredients,active=true)=>({id,familleId:id,active,rendementQte:10,ingredients});
test('plan : les recettes cycliques ou incomplètes ne peuvent pas produire une couverture trompeuse',()=>{
 const ok=ver('v',[{articleId:'a',q:2,u:'kg'}]);
 assert.equal(recettesPlanValides([ok],[article]),true);
 assert.equal(recettesPlanValides([ver('v',[{articleId:'absent',q:2}])],[article]),false);
 assert.equal(recettesPlanValides([ver('v',[{articleId:'a',q:2,parage:-1}])],[article]),false);
 assert.equal(recettesPlanValides([ver('v',[{articleId:'a',subVersionId:'x',q:1}])],[article]),false);
 assert.equal(recettesPlanValides([ver('v',[{subVersionId:'x',q:1}])],[article]),false);
 assert.equal(recettesPlanValides([ver('v',[{subVersionId:'x',q:1}]),ver('x',[{subVersionId:'v',q:1}],false)],[article]),false);
 assert.equal(recettesPlanValides([ver('v',[{subVersionId:'x',q:1}]),ver('x',[{code:'A',q:1}],false)],[article]),true);
});
