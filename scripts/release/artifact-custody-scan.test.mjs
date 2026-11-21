import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SCAN_EXTENSIONS, safeRoot, relativeAsset, fileExtension, acceptedExtension,
  inspectAssetBytes, scanBundle, inspectBundleFiles,
} from './artifact-custody-scan.mjs';
import { sha256 } from './artifact-custody-core.mjs';

const PROVENANCE={source:'https://example.org/source',licence:'CC0-1.0',retrievedOn:'2026-11-19',tier:0};
const codes=result=>result.problems.map(x=>x.code);
async function tempDirectory(){
  const root=await mkdtemp(join(tmpdir(),'custody-test-'));
  return root;
}
async function put(root,path,content){
  const full=join(root,...path.split('/'));
  const parent=full.slice(0,full.lastIndexOf('/'));
  await mkdir(parent,{recursive:true});
  await writeFile(full,content);
  return full;
}
async function withFiles(files,fn){
  const root=await tempDirectory();
  try{
    for(const [path,content] of Object.entries(files))await put(root,path,content);
    return await fn(root);
  }finally{await rm(root,{recursive:true,force:true});}
}
const SAMPLE='<!doctype html><html lang="en"><body><h1>Sample</h1></body></html>';

test('extension list contains typical offline assets',()=>{
  for(const ext of ['html','css','js','json','png','woff2','webmanifest']){
    assert.ok(SCAN_EXTENSIONS.includes(ext),ext);
  }
});
test('extension matcher refuses unknown executable formats',()=>{
  for(const path of ['bin.exe','config.php','template.sh','video.mp4','a.cjs']){
    assert.equal(acceptedExtension(path),false,path);
  }
});
test('extension matcher accepts case-insensitive image formats',()=>{
  assert.equal(acceptedExtension('assets/ICON.PNG'),true);
  assert.equal(fileExtension('folder/PHOTO.JPEG'),'jpeg');
});
test('safeRoot rejects empty and nul-containing paths',()=>{
  assert.equal(safeRoot(''),null);
  assert.equal(safeRoot('a\0b'),null);
  assert.ok(safeRoot('/tmp'));
});
test('relativeAsset preserves POSIX bundle paths',()=>{
  assert.equal(relativeAsset('/tmp/bundle','/tmp/bundle/a/b.js'),'a/b.js');
});
test('relativeAsset refuses path outside root',()=>{
  assert.equal(relativeAsset('/tmp/bundle','/tmp/other/b.js'),null);
});
test('relativeAsset rejects unsafe reserved directory names',()=>{
  assert.equal(relativeAsset('/tmp/bundle','/tmp/bundle/__proto__/a.js'),null);
});
test('well-formed sample HTML passes static byte inspection',()=>{
  const result=inspectAssetBytes('index.html',Buffer.from(SAMPLE));
  assert.deepEqual(result.problems,[]);
  assert.deepEqual(result.references,[]);
});
test('UTF-8 decoder identifies broken byte sequences',()=>{
  const result=inspectAssetBytes('index.html',Buffer.from([0xff,0xfe,0xfd]));
  assert.ok(codes(result).includes('INVALID_UTF8'));
});
test('replacement character in text is reported',()=>{
  const result=inspectAssetBytes('index.html',Buffer.from(`<html>\uFFFD</html>`));
  assert.ok(codes(result).includes('REPLACEMENT_CHARACTER'));
});
test('non-HTML text under HTML extension is rejected',()=>{
  const result=inspectAssetBytes('index.html',Buffer.from('random body'));
  assert.ok(codes(result).includes('HTML_ROOT_MISSING'));
});
test('valid JSON manifests pass byte inspection',()=>{
  assert.deepEqual(inspectAssetBytes('manifest.webmanifest',Buffer.from('{}')).problems,[]);
});
test('malformed JSON is never interpreted as a resource record',()=>{
  const result=inspectAssetBytes('data.json',Buffer.from('{invalid'));
  assert.ok(codes(result).includes('INVALID_JSON'));
});
test('synthetic image data is classified without text decoding',()=>{
  const result=inspectAssetBytes('img.png',Buffer.from([0x89,0x50,0x4e,0x47]));
  assert.deepEqual(result.problems,[]);
  assert.deepEqual(result.references,[]);
});
test('HTML-linked files produce path references',()=>{
  const html='<html><link rel="stylesheet" href="/style.css"><script src="app.js"></script></html>';
  const result=inspectAssetBytes('index.html',Buffer.from(html));
  assert.deepEqual(result.references,['app.js','style.css']);
});
test('CSS font and image references are recorded',()=>{
  const css='@font-face{src:url("../fonts/main.woff2")}body{background:url(../images/bg.png)}';
  const result=inspectAssetBytes('css/site.css',Buffer.from(css));
  assert.deepEqual(result.references,['fonts/main.woff2','images/bg.png']);
});
test('remote resources are flagged before being dropped from inventory',()=>{
  const html='<html><script src="https://example.org/script.js"></script></html>';
  const result=inspectAssetBytes('index.html',Buffer.from(html));
  assert.ok(codes(result).includes('EXTERNAL_ASSET'));
  assert.deepEqual(result.references,[]);
});
test('minimal bundle scan returns a deterministic digest',async()=>{
  await withFiles({'index.html':SAMPLE},async root=>{
    const result=await scanBundle(root,PROVENANCE);
    assert.equal(result.ok,true);
    assert.equal(result.manifest.files.length,1);
    assert.equal(result.manifest.files[0].sha256,sha256(Buffer.from(SAMPLE)));
  });
});
test('scan does not mutate any file in the bundle',async()=>{
  await withFiles({'index.html':SAMPLE},async root=>{
    const before=await readFile(join(root,'index.html'));
    await scanBundle(root,PROVENANCE);
    const after=await readFile(join(root,'index.html'));
    assert.deepEqual(after,before);
  });
});
test('scan descends directories in stable sorted order',async()=>{
  await withFiles({'z.js':'1','a/main.js':'2','index.html':SAMPLE,'b/x.css':'*{}'},async root=>{
    const result=await scanBundle(root,PROVENANCE);
    assert.equal(result.ok,true);
    assert.deepEqual(result.manifest.files.map(x=>x.path),['a/main.js','b/x.css','index.html','z.js']);
  });
});
test('scan captures file lengths without guessing',async()=>{
  await withFiles({'index.html':SAMPLE,'data.json':'{"a":1}'},async root=>{
    const result=await scanBundle(root,PROVENANCE);
    assert.equal(result.summary.bytes,Buffer.byteLength(SAMPLE)+7);
    assert.equal(result.manifest.files.find(x=>x.path==='data.json').bytes,7);
  });
});
test('binary image bytes do not need a text decoder',async()=>{
  await withFiles({'index.html':SAMPLE,'images/icon.png':Buffer.from([255,254,253])},async root=>{
    const result=await scanBundle(root,PROVENANCE);
    assert.equal(result.ok,true);
    assert.equal(result.manifest.files.find(x=>x.path.endsWith('.png')).kind,'image');
  });
});
test('nonexistent scan root fails without any partial manifest',async()=>{
  const result=await scanBundle('/path/that/cannot/exist',PROVENANCE);
  assert.equal(result.ok,false);
  assert.equal(result.manifest,null);
  assert.ok(codes(result).includes('ROOT_UNREADABLE'));
});
test('a file path cannot impersonate a bundle directory',async()=>{
  await withFiles({'index.html':SAMPLE},async root=>{
    const result=await scanBundle(join(root,'index.html'),PROVENANCE);
    assert.equal(result.ok,false);
    assert.ok(codes(result).includes('ROOT_NOT_DIRECTORY'));
  });
});
test('scan fails on unsupported extension rather than silently hiding it',async()=>{
  await withFiles({'index.html':SAMPLE,'unknown.sh':'echo hi'},async root=>{
    const result=await scanBundle(root,PROVENANCE);
    assert.equal(result.ok,false);
    assert.ok(codes(result).includes('UNSUPPORTED_EXTENSION'));
  });
});
test('scan refuses symlinks pointing outside the build root',async()=>{
  const root=await tempDirectory();
  try{
    await put(root,'index.html',SAMPLE);
    await symlink('/etc/passwd',join(root,'linked.txt'));
    const result=await scanBundle(root,PROVENANCE);
    assert.equal(result.ok,false);
    assert.ok(codes(result).includes('SYMLINK_REJECTED'));
  }finally{await rm(root,{recursive:true,force:true});}
});
test('scan refuses symlinks pointing inside the build root',async()=>{
  const root=await tempDirectory();
  try{
    await put(root,'index.html',SAMPLE);
    await symlink('index.html',join(root,'duplicate.html'));
    const result=await scanBundle(root,PROVENANCE);
    assert.equal(result.ok,false);
    assert.ok(codes(result).includes('SYMLINK_REJECTED'));
  }finally{await rm(root,{recursive:true,force:true});}
});
test('scan rejects invalid JSON resources even if there is an HTML entry',async()=>{
  await withFiles({'index.html':SAMPLE,'a.json':'{'},async root=>{
    const result=await scanBundle(root,PROVENANCE);
    assert.equal(result.ok,false);
    assert.ok(codes(result).includes('INVALID_JSON'));
  });
});
test('scan refuses a missing open licence instead of creating evidence',async()=>{
  await withFiles({'index.html':SAMPLE},async root=>{
    const result=await scanBundle(root,{...PROVENANCE,licence:'unknown'});
    assert.equal(result.ok,false);
    assert.ok(codes(result).includes('LICENCE_REQUIRED'));
  });
});
test('scan preserves the caller-supplied retrieval date',async()=>{
  await withFiles({'index.html':SAMPLE},async root=>{
    const result=await scanBundle(root,{...PROVENANCE,retrievedOn:'2026-11-18'});
    assert.equal(result.manifest.provenance.retrievedOn,'2026-11-18');
  });
});
test('scan never silently upgrades UNKNOWN source tier',async()=>{
  await withFiles({'index.html':SAMPLE},async root=>{
    const result=await scanBundle(root,{...PROVENANCE,tier:'UNKNOWN'});
    assert.equal(result.ok,false);
    assert.ok(codes(result).includes('TIER_REQUIRED'));
  });
});
test('file count limit stops traversal conservatively',async()=>{
  await withFiles({'index.html':SAMPLE,'a.js':'a','b.js':'b'},async root=>{
    const result=await scanBundle(root,PROVENANCE,{maxFiles:1});
    assert.equal(result.ok,false);
    assert.ok(codes(result).includes('FILE_LIMIT'));
  });
});
test('file byte limit refuses large assets',async()=>{
  await withFiles({'index.html':SAMPLE,'a.js':'x'.repeat(100)},async root=>{
    const result=await scanBundle(root,PROVENANCE,{maxFileBytes:50});
    assert.equal(result.ok,false);
    assert.ok(codes(result).includes('FILE_SIZE_LIMIT'));
  });
});
test('total byte limit prevents hidden oversized packages',async()=>{
  await withFiles({'index.html':SAMPLE,'a.js':'x'.repeat(100)},async root=>{
    const result=await scanBundle(root,PROVENANCE,{maxBytes:90});
    assert.equal(result.ok,false);
    assert.ok(codes(result).includes('TOTAL_SIZE_LIMIT'));
  });
});
test('scan captures relative links without relying on a browser',async()=>{
  const html='<html><link href="style.css" rel="stylesheet"><img src="img.png"></html>';
  await withFiles({'index.html':html,'style.css':'h1{}','img.png':Buffer.from([0,1])},async root=>{
    const result=await scanBundle(root,PROVENANCE);
    assert.equal(result.ok,true);
    assert.deepEqual(result.manifest.files.find(x=>x.path==='index.html').references,['img.png','style.css']);
  });
});
test('capturing an external stylesheet is not an offline success',async()=>{
  await withFiles({'index.html':'<html><link href="https://example.org/theme.css"></html>'},async root=>{
    const result=await scanBundle(root,PROVENANCE);
    assert.equal(result.ok,false);
    assert.ok(codes(result).includes('EXTERNAL_ASSET'));
  });
});
test('comparison of captured files succeeds without network access',async()=>{
  await withFiles({'index.html':SAMPLE,'a.js':'foo'},async root=>{
    const scan=await scanBundle(root,PROVENANCE);
    const result=await inspectBundleFiles(root,scan.manifest);
    assert.equal(result.ok,true);
    assert.deepEqual(result.changes,[]);
  });
});
test('integrity comparison finds changed JavaScript bytes',async()=>{
  await withFiles({'index.html':SAMPLE,'a.js':'old'},async root=>{
    const scan=await scanBundle(root,PROVENANCE);
    await writeFile(join(root,'a.js'),'new');
    const result=await inspectBundleFiles(root,scan.manifest);
    assert.equal(result.ok,false);
    assert.ok(result.changes.some(x=>x.path==='a.js'&&x.kind==='CHANGED'));
  });
});
test('integrity comparison finds missing assets',async()=>{
  await withFiles({'index.html':SAMPLE,'a.js':'script'},async root=>{
    const scan=await scanBundle(root,PROVENANCE);
    await unlink(join(root,'a.js'));
    const result=await inspectBundleFiles(root,scan.manifest);
    assert.ok(result.changes.some(x=>x.kind==='MISSING'));
  });
});
test('integrity comparison refuses replacing a file with symlink',async()=>{
  await withFiles({'index.html':SAMPLE,'a.js':'data'},async root=>{
    const scan=await scanBundle(root,PROVENANCE);
    await unlink(join(root,'a.js'));
    await symlink('/etc/passwd',join(root,'a.js'));
    const result=await inspectBundleFiles(root,scan.manifest);
    assert.equal(result.ok,false);
    assert.ok(codes(result).includes('NOT_REGULAR_FILE'));
  });
});
test('integrity comparison fails on invalid manifest before opening files',async()=>{
  const result=await inspectBundleFiles('/does/not/exist',{files:[]});
  assert.equal(result.ok,false);
  assert.ok(codes(result).includes('MANIFEST_INVALID'));
});
test('the scanner does not create any asset on its own',async()=>{
  await withFiles({'index.html':SAMPLE},async root=>{
    const before=(await readFile(join(root,'index.html'),'utf8'));
    await scanBundle(root,PROVENANCE);
    const after=(await readFile(join(root,'index.html'),'utf8'));
    assert.equal(after,before);
  });
});
