import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frenchIssues } from './model.ts';
import { COMMANDS, MODES } from './engine.ts';
import {
  commandLabel, decisionLabel, evidenceLabel, issueLabel, kindLabel,
  modeLabel, workbenchCopy,
} from './copy.ts';
const en=workbenchCopy('en');
const fr=workbenchCopy('fr');

test('English title is nonempty',()=>assert.ok(en.title.length>0));
test('French title is nonempty',()=>assert.ok(fr.title.length>0));
test('English introductory copy is nonempty',()=>assert.ok(en.intro.length>0));
test('French introductory copy is nonempty',()=>assert.ok(fr.intro.length>0));
test('English privacy copy is nonempty',()=>assert.ok(en.local.length>0));
test('French privacy copy is nonempty',()=>assert.ok(fr.local.length>0));
test('English caveat is nonempty',()=>assert.ok(en.caveat.length>0));
test('French caveat is nonempty',()=>assert.ok(fr.caveat.length>0));
test('English title differs from French',()=>assert.notEqual(en.title,fr.title));
test('English intro differs from French',()=>assert.notEqual(en.intro,fr.intro));
test('English caveat differs from French',()=>assert.notEqual(en.caveat,fr.caveat));
test('English no-storage disclosure is explicit',()=>assert.ok(en.local.includes('stored')));
test('French no-storage disclosure is explicit',()=>assert.ok(fr.local.includes('conservée')));
test('English copy does not promise screen reader support',()=>assert.ok(en.caveat.includes('not a test')));
test('French copy describes its limits',()=>assert.ok(fr.caveat.includes('ne remplace pas')));
test('French copy uses typographic apostrophe',()=>assert.ok(fr.local.includes('’')));
test('UNKNOWN stays uppercase in English',()=>assert.equal(en.unknown,'UNKNOWN'));
test('UNKNOWN stays uppercase in French',()=>assert.equal(fr.unknown,'UNKNOWN'));
test('French copy does not imply a remote session',()=>assert.ok(fr.local.includes('page')));
test('English report is named',()=>assert.ok(en.report.length>0));
test('French report is named',()=>assert.ok(fr.report.length>0));
test('English export has distinct CSV label',()=>assert.notEqual(en.exportCsv,en.exportJson));
test('French export has distinct CSV label',()=>assert.notEqual(fr.exportCsv,fr.exportJson));
test('English controls heading is nonempty',()=>assert.ok(en.control.length>0));
test('French controls heading is nonempty',()=>assert.ok(fr.control.length>0));
test('English save label is nonempty',()=>assert.ok(en.save.length>0));
test('French save label is nonempty',()=>assert.ok(fr.save.length>0));
test('French reset label is nonempty',()=>assert.ok(fr.reset.length>0));
test('French invalid form text is nonempty',()=>assert.ok(fr.validation.length>0));
test('English invalid form text is nonempty',()=>assert.ok(en.validation.length>0));
for(const [key,english] of Object.entries(en)){
  test(`French translation exists for ${key}`,()=>assert.equal(typeof fr[key],'string'));
  test(`French translation nonempty for ${key}`,()=>assert.ok(fr[key].trim().length>0));
  test(`English translation nonempty for ${key}`,()=>assert.ok(english.trim().length>0));
  test(`French typography valid for ${key}`,()=>assert.deepEqual(frenchIssues(fr[key]),[]));
}
for(const command of COMMANDS){
  test(`English command ${command} is present`,()=>assert.ok(commandLabel(command,'en').length>0));
  test(`French command ${command} is present`,()=>assert.ok(commandLabel(command,'fr').length>0));
  test(`command ${command} language differs`,()=>assert.notEqual(commandLabel(command,'en'),commandLabel(command,'fr')));
  test(`command ${command} French typography valid`,()=>assert.deepEqual(frenchIssues(commandLabel(command,'fr')),[]));
}
for(const mode of MODES){
  test(`English mode ${mode} is present`,()=>assert.ok(modeLabel(mode,'en').length>0));
  test(`French mode ${mode} is present`,()=>assert.ok(modeLabel(mode,'fr').length>0));
  test(`mode ${mode} French typography valid`,()=>assert.deepEqual(frenchIssues(modeLabel(mode,'fr')),[]));
}
for(const kind of ['button','link','checkbox','radio','tab','field','switch']){
  test(`English kind ${kind} is present`,()=>assert.ok(kindLabel(kind,'en').length>0));
  test(`French kind ${kind} is present`,()=>assert.ok(kindLabel(kind,'fr').length>0));
  test(`kind ${kind} French typography valid`,()=>assert.deepEqual(frenchIssues(kindLabel(kind,'fr')),[]));
}
for(const tier of ['UNKNOWN','OBSERVED','DOCUMENTED']){
  test(`English evidence ${tier} is present`,()=>assert.ok(evidenceLabel(tier,'en').length>0));
  test(`French evidence ${tier} is present`,()=>assert.ok(evidenceLabel(tier,'fr').length>0));
  test(`evidence ${tier} French typography valid`,()=>assert.deepEqual(frenchIssues(evidenceLabel(tier,'fr')),[]));
}
for(const decision of ['UNKNOWN','REVIEW','READY']){
  test(`English decision ${decision} is present`,()=>assert.ok(decisionLabel(decision,'en').length>0));
  test(`French decision ${decision} is present`,()=>assert.ok(decisionLabel(decision,'fr').length>0));
  test(`decision ${decision} French typography valid`,()=>assert.deepEqual(frenchIssues(decisionLabel(decision,'fr')),[]));
}
for(const code of ['control.name','control.description','control.target-size','control.missing-source','project.duplicate-id','project.dangling-reference','project.unreachable-control','scan.no-controls','node.unnamed','node.small-target','focus.unvisited']){
  test(`English issue code ${code} has text`,()=>assert.ok(issueLabel(code,'en').length>0));
  test(`French issue code ${code} has text`,()=>assert.ok(issueLabel(code,'fr').length>0));
  test(`French issue code ${code} typography valid`,()=>assert.deepEqual(frenchIssues(issueLabel(code,'fr')),[]));
}
test('unknown issue code falls back safely',()=>assert.equal(issueLabel('other.example','fr'),'other — example'));
test('unknown issue code does not claim a status',()=>assert.ok(!issueLabel('missing.missing','fr').includes('READY')));
