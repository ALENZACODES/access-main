import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACTIVATIONS, EVIDENCE, KINDS, MINIMUM_TARGET, controlIssues, defaultControl,
  defaultProject, describeDecision, finding, frenchIssues, isCopy, isDate, isId,
  isPlainObject, isSafeFile, isSafeUrl, isText, moveControl, projectIssues,
  removeControl, reviewProject, safeCsvCell, sortFindings, sourceIssues, updateControl,
} from './model.ts';

const copy = (en='Entrance',fr='Entrée')=>({en,fr});
const source = (changes={})=>({title:'Public sample',url:'https://example.org/guide',licence:'Open licence',accessed:'2026-11-18',...changes});
const control = (id='first',changes={})=>({...defaultControl(id),evidence:'DOCUMENTED',reviewed:true,source:source(),...changes});
const project=(controls=[control()])=>({id:'practice',title:copy('Practice','Essai'),locale:'en',controls,focusOrder:controls.map(c=>c.id)});
const codes=(issues)=>issues.map(x=>x.code);
const has=(items,code)=>assert.ok(codes(items).includes(code),`${code} absent: ${JSON.stringify(items)}`);

test('model lists seven control roles',()=>assert.equal(KINDS.length,7));
test('button is a supported control kind',()=>assert.ok(KINDS.includes('button')));
test('link is a supported control kind',()=>assert.ok(KINDS.includes('link')));
test('checkbox is a supported control kind',()=>assert.ok(KINDS.includes('checkbox')));
test('radio is a supported control kind',()=>assert.ok(KINDS.includes('radio')));
test('tab is a supported control kind',()=>assert.ok(KINDS.includes('tab')));
test('field is a supported control kind',()=>assert.ok(KINDS.includes('field')));
test('switch is a supported control kind',()=>assert.ok(KINDS.includes('switch')));
test('activation includes Enter',()=>assert.ok(ACTIVATIONS.includes('ENTER')));
test('activation includes Space',()=>assert.ok(ACTIVATIONS.includes('SPACE')));
test('activation includes both',()=>assert.ok(ACTIVATIONS.includes('BOTH')));
test('activation includes arrows',()=>assert.ok(ACTIVATIONS.includes('ARROWS')));
test('activation includes none',()=>assert.ok(ACTIVATIONS.includes('NONE')));
test('evidence includes UNKNOWN',()=>assert.ok(EVIDENCE.includes('UNKNOWN')));
test('evidence includes OBSERVED',()=>assert.ok(EVIDENCE.includes('OBSERVED')));
test('evidence includes DOCUMENTED',()=>assert.ok(EVIDENCE.includes('DOCUMENTED')));
test('touch minimum is 44',()=>assert.equal(MINIMUM_TARGET,44));
test('default is unknown',()=>assert.equal(defaultControl().evidence,'UNKNOWN'));
test('default is not reviewed',()=>assert.equal(defaultControl().reviewed,false));
test('default width meets touch minimum',()=>assert.equal(defaultControl().width,44));
test('default height meets touch minimum',()=>assert.equal(defaultControl().height,44));
test('default has bilingual name',()=>assert.equal(defaultControl().name.fr,'Continuer'));
test('default has bilingual description',()=>assert.ok(defaultControl().description.en.length>0));
test('default activation is BOTH',()=>assert.equal(defaultControl().activation,'BOTH'));
test('default is visible',()=>assert.equal(defaultControl().visible,true));
test('default tab index is zero',()=>assert.equal(defaultControl().tabIndex,0));
test('default has no refs',()=>assert.deepEqual(defaultControl().refs,[]));
test('default project is empty',()=>assert.equal(defaultProject().controls.length,0));
test('default project retains English',()=>assert.equal(defaultProject().locale,'en'));
test('default project has no focus stops',()=>assert.equal(defaultProject().focusOrder.length,0));

for(const [label,value,expected] of [
  ['empty object',{},true],
  ['object with keys',{a:1},true],
  ['null prototype',Object.create(null),true],
  ['array',[],false],
  ['filled array',[1],false],
  ['null',null,false],
  ['undefined',undefined,false],
  ['text','a',false],
  ['number',2,false],
  ['boolean',false,false],
]){
  test(`plain objects: ${label}`,()=>assert.equal(isPlainObject(value),expected));
}
for(const [label,value,expected] of [
  ['one letter','a',true],
  ['simple slug','input-panel',true],
  ['digits inside','panel-2',true],
  ['long but bounded',`a${'b'.repeat(69)}`,true],
  ['leading number','2-panel',false],
  ['uppercase','Panel',false],
  ['underscore','panel_a',false],
  ['double dash','panel--two',false],
  ['trailing dash','panel-',false],
  ['space','panel two',false],
  ['dot','panel.two',false],
  ['slash','panel/two',false],
  ['empty','',false],
  ['too long',`a${'b'.repeat(70)}`,false],
  ['non text',44,false],
  ['null',null,false],
]){
  test(`identifier: ${label}`,()=>assert.equal(isId(value),expected));
}
for(const [label,value,expected] of [
  ['ordinary text','A clear label',true],
  ['French text','Entrée facile',true],
  ['leading spaces','  Continue',true],
  ['trailing spaces','Continue  ',true],
  ['blank','',false],
  ['only spaces','    ',false],
  ['null',null,false],
  ['number',0,false],
  ['newline','a\nb',false],
  ['tab','a\tb',false],
  ['carriage return','a\rb',false],
  ['null byte','a\u0000b',false],
  ['delete','a\u007fb',false],
  ['max length','a'.repeat(240),true],
  ['too long','a'.repeat(241),false],
]){
  test(`label text: ${label}`,()=>assert.equal(isText(value),expected));
}
for(const [label,value,expected] of [
  ['valid bilingual',copy(),true],
  ['valid French punctuation',copy('Info','Note\u00A0: suite'),true],
  ['valid exclamation',copy('Open','Bonjour\u00a0!'),true],
  ['valid guillemets',copy('Welcome','«\u00a0Bienvenue\u00a0»'),true],
  ['valid question', copy('Ready?', 'Prêt\u00a0?'), true],
  ['ordinary space before colon', copy('Note', 'Note : texte'), false],
  ['narrow space before question', copy('Ready?', 'Prêt\u202f?'), false],
  ['ordinary spaces inside guillemets', copy('Text', '« extrait »'), false],
  ['narrow space before semicolon', copy('Notes', 'Un\u202f; deux'), true],
  ['missing French',{en:'Hello'},false],
  ['missing English',{fr:'Bonjour'},false],
  ['empty English',{en:'',fr:'Bonjour'},false],
  ['empty French',{en:'Hello',fr:''},false],
  ['ASCII apostrophe',copy('Day',"Aujourd'hui"),false],
  ['ASCII colon',copy('Note','Note: texte'),false],
  ['ASCII exclamation',copy('Hello','Bonjour!'),false],
  ['ASCII guillemet',copy('Welcome','«Bonjour»'),false],
  ['array',[],false],
  ['null',null,false],
]){
  test(`bilingual copy: ${label}`,()=>assert.equal(isCopy(value),expected));
}
for(const [label,value,expected] of [
  ['ordinary day','2026-11-18',true],
  ['leap day','2024-02-29',true],
  ['first day','2026-01-01',true],
  ['last day','2026-12-31',true],
  ['invalid leap','2025-02-29',false],
  ['invalid month','2026-13-01',false],
  ['invalid day','2026-04-31',false],
  ['missing zeros','2026-1-1',false],
  ['time appended','2026-11-18T12:00',false],
  ['text','today',false],
  ['empty','',false],
  ['null',null,false],
]){
  test(`calendar date: ${label}`,()=>assert.equal(isDate(value),expected));
}
for(const [label,value,expected] of [
  ['HTTPS source','https://example.org/path',true],
  ['HTTPS query','https://example.org/path?lang=fr',true],
  ['HTTPS other domain','https://example.net/a',true],
  ['plain HTTP','data:text/plain,example',false],
  ['file protocol','file:///local',false],
  ['FTP','ftp://example.org',false],
  ['javascript','javascript:alert(1)',false],
  ['credentials','https://a:b@example.org/path',false],
  ['fragment','https://example.org/path#info',false],
  ['space','https://example.org/path with space',false],
  ['empty','',false],
  ['null',null,false],
  ['number',4,false],
  ['long URL',`https://example.org/${'a'.repeat(1400)}`,false],
]){
  test(`source URL: ${label}`,()=>assert.equal(isSafeUrl(value),expected));
}
for(const [label,value,expected] of [
  ['valid source',source(),false],
  ['missing title',source({title:''}),true],
  ['missing URL',source({url:''}),true],
  ['insecure URL',source({url:'data:text/plain,example'}),true],
  ['missing licence',source({licence:''}),true],
  ['missing date',source({accessed:''}),true],
  ['invalid date',source({accessed:'2026-02-30'}),true],
  ['array',[],true],
  ['null',null,true],
]){
  test(`source issues: ${label}`,()=>assert.equal(sourceIssues(value).length>0,expected));
}
for(const [label,controlValue,code] of [
  ['missing id',control('first',{id:''}),'control.id'],
  ['wrong kind',control('first',{kind:'gesture'}),'control.kind'],
  ['missing English name',control('first',{name:{en:'',fr:'Entrée'}}),'control.name'],
  ['missing French name',control('first',{name:{en:'Door',fr:''}}),'control.name'],
  ['missing English description',control('first',{description:{en:'',fr:'Porte'}}),'control.description'],
  ['invalid group',control('first',{group:'bad group'}),'control.group'],
  ['invalid references',control('first',{refs:['bad id'] }),'control.refs'],
  ['wrong activation',control('first',{activation:'DRAG'}),'control.activation'],
  ['small width',control('first',{width:43}),'control.target-size'],
  ['small height',control('first',{height:43}),'control.target-size'],
  ['zero width',control('first',{width:0}),'control.target-size'],
  ['nonfinite width',control('first',{width:Infinity}),'control.target-size'],
  ['positive tab index',control('first',{tabIndex:4}),'control.positive-tabindex'],
  ['negative tab index below minus one',control('first',{tabIndex:-3}),'control.tabindex'],
  ['hidden tab stop',control('first',{visible:false}),'control.hidden-tabbable'],
  ['disabled tab stop',control('first',{disabled:true}),'control.disabled-tabbable'],
  ['unknown review',control('first',{evidence:'UNKNOWN'}),'control.unknown-reviewed'],
  ['missing documented source',control('first',{source:null}),'control.missing-source'],
  ['none activation',control('first',{activation:'NONE'}),'control.no-activation'],
  ['link space only',control('first',{kind:'link',activation:'SPACE'}),'control.link-space-only'],
  ['checkbox Enter only',control('first',{kind:'checkbox',activation:'ENTER'}),'control.checkbox-enter-only'],
]){
  test(`control issue: ${label}`,()=>has(controlIssues(controlValue),code));
}
test('clean documented control has no findings',()=>assert.deepEqual(controlIssues(control()),[]));
test('malformed control is rejected',()=>has(controlIssues(null),'control.invalid'));
test('empty project stays unknown',()=>assert.equal(reviewProject(defaultProject()).decision,'UNKNOWN'));
test('fully sourced project can be ready',()=>assert.equal(reviewProject(project()).decision,'READY'));
test('unknown source stays unknown',()=>assert.equal(reviewProject(project([defaultControl()])).decision,'UNKNOWN'));
test('insecure source holds review',()=>assert.equal(reviewProject(project([control('first',{source:source({url:'data:text/plain,example'})})])).decision,'REVIEW'));
test('repeated control IDs are rejected',()=>has(projectIssues(project([control(),control()])),'project.duplicate-id'));
test('broken reference is rejected',()=>has(projectIssues(project([control('first',{refs:['absent']})])),'project.dangling-reference'));
test('missing focus target is rejected',()=>has(projectIssues({...project(),focusOrder:['unknown']}),'project.missing-focus'));
test('repeated focus target is rejected',()=>has(projectIssues({...project(),focusOrder:['first','first']}),'project.duplicate-focus'));
test('hidden focus target is rejected',()=>has(projectIssues(project([control('first',{visible:false})])),'project.inactive-focus'));
test('unreachable control is review finding',()=>has(projectIssues({...project(),focusOrder:[]}), 'project.unreachable-control'));
test('invalid locale is rejected',()=>has(projectIssues({...project(),locale:'de'}),'project.locale'));
test('invalid project is rejected',()=>has(projectIssues(null),'project.invalid'));
test('updated control is inserted',()=>assert.equal(updateControl(defaultProject(),control()).controls.length,1));
test('updated control joins focus order',()=>assert.deepEqual(updateControl(defaultProject(),control()).focusOrder,['first']));
test('same ID replaces rather than duplicates',()=>assert.equal(updateControl(updateControl(defaultProject(),control()),control('first',{width:60})).controls.length,1));
test('replacement retains changed width',()=>assert.equal(updateControl(updateControl(defaultProject(),control()),control('first',{width:60})).controls[0].width,60));
test('removal clears controls',()=>assert.equal(removeControl(project(),'first').controls.length,0));
test('removal clears focus order',()=>assert.deepEqual(removeControl(project(),'first').focusOrder,[]));
test('removal removes stale refs',()=>assert.deepEqual(removeControl(project([control('first'),control('second',{refs:['first']})]),'first').controls[0].refs,[]));
test('move first forward',()=>assert.deepEqual(moveControl(project([control('first'),control('second')]),'first',1).focusOrder,['second','first']));
test('move second backward',()=>assert.deepEqual(moveControl(project([control('first'),control('second')]),'second',-1).focusOrder,['second','first']));
test('move out of range is a no-op',()=>assert.deepEqual(moveControl(project(),'first',1),project()));
test('finding object is stable',()=>assert.deepEqual(finding('code','path'),{code:'code',path:'path',severity:'error'}));
test('sorting findings uses path first',()=>assert.equal(sortFindings([finding('b','z'),finding('a','a')])[0].path,'a'));
test('describing decision preserves unknown',()=>assert.equal(describeDecision(reviewProject(defaultProject())),'UNKNOWN'));
test('CSV formula guarded',()=>assert.ok(safeCsvCell('=A1').startsWith('"\'')));
test('CSV quotes doubled',()=>assert.ok(safeCsvCell('a"b').includes('""')));
test('CSV newline neutralized',()=>assert.equal(safeCsvCell('a\nb'),'"a b"'));
test('filename contract accepts slug',()=>assert.equal(isSafeFile('report.json'),true));
test('filename contract rejects traversal',()=>assert.equal(isSafeFile('../file.json'),false));
test('French colon needs no-break space',()=>assert.ok(frenchIssues('Note: texte').includes('fr.colon')));
test('French non-breaking space accepted before exclamation',()=>assert.deepEqual(frenchIssues('Bonjour\u00a0!'),[]));
test('French opening guillemet needs a non-breaking space',()=>assert.ok(frenchIssues('«Bonjour').includes('fr.open')));
test('French closing guillemet needs a non-breaking space',()=>assert.ok(frenchIssues('Bonjour»').includes('fr.close')));
test('French apostrophe must be typographic',()=>assert.ok(frenchIssues("Aujourd'hui").includes('fr.apostrophe')));
