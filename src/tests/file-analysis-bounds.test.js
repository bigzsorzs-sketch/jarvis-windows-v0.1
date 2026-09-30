import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const AdmZip=require('adm-zip');
const {MAX_FILE_BYTES}=require('../../electron/analysis/file-upload-validator.cjs');
const {analyzeUploadedFiles}=require('../../electron/analysis/file-analyzer.cjs');

function inspectFile(name,body,mime='application/octet-stream') {
  const data=Buffer.isBuffer(body)?body:Buffer.from(body);
  const url='data:'+mime+';base64,'+data.toString('base64');
  return analyzeUploadedFiles([{name,url}]).analyses[0];
}

test('a FileReader data URL with charset is decoded correctly',()=>{
  const content=Buffer.from('Szia, Jarvis!','utf8');
  const result=analyzeUploadedFiles([{
    name:'notes.txt',
    url:'data:text/plain;charset=utf-8;base64,'+content.toString('base64')
  }]).analyses[0];
  assert.equal(result.extracted_files[0].content,'Szia, Jarvis!');
  assert.equal(result.error,undefined);
});

test('direct analysis refuses oversized base64 payload before any decode',()=>{
  const payload='data:application/octet-stream;base64,'
    +'A'.repeat(Math.ceil((MAX_FILE_BYTES+1)/3)*4);
  const result=analyzeUploadedFiles([{name:'too-big.bin',url:payload}]).analyses[0];
  assert.match(result.error,/FILE_ANALYSIS_FILE_TOO_LARGE/);
  assert.equal(result.extracted_files.length,0);
});

test('corrupt base64 is not silently decoded into a different file',()=>{
  for (const value of ['@@@', 'YQ', 'abcd===', 'YQ==%%']) {
    const result=analyzeUploadedFiles([{name:'code.txt',url:'data:text/plain;base64,'+value}]).analyses[0];
    assert.match(result.error,/FILE_ANALYSIS_INVALID_BASE64/,value);
    assert.equal(result.extracted_files.length,0);
  }
});

test('valid small text and ZIP attachments remain readable',()=>{
  const text=inspectFile('hello.txt','Hello, Jarvis!', 'text/plain');
  assert.equal(text.extracted_files[0].content,'Hello, Jarvis!');
  const zip=new AdmZip();
  zip.addFile('hello.txt',Buffer.from('zip works'));
  const result=inspectFile('source.zip',zip.toBuffer());
  assert.equal(result.extracted_files[0].content,'zip works');
});

test('oversized ZIP member is skipped without stopping safe siblings',()=>{
  const zip=new AdmZip();
  zip.addFile('large.js',Buffer.alloc(600*1024,97));
  zip.addFile('small.js',Buffer.from('console.log(1);'));
  const result=inspectFile('source.zip',zip.toBuffer());
  assert.equal(result.error,undefined);
  assert.ok(result.extracted_files.some(x=>x.path==='small.js'));
  assert.ok(!result.extracted_files.some(x=>x.path==='large.js'));
});

test('declared huge DOCX XML is rejected instead of decompressed',()=>{
  const zip=new AdmZip();
  zip.addFile('word/document.xml',Buffer.alloc(9*1024*1024,97));
  const result=inspectFile('danger.docx',zip.toBuffer());
  assert.match(result.error,/FILE_ANALYSIS_DOCX_XML_TOO_LARGE/);
  assert.equal(result.extracted_files.length,0);
});

test('ordinary DOCX XML is still extracted',()=>{
  const zip=new AdmZip();
  zip.addFile('word/document.xml',Buffer.from('<w:document><w:p>Test sentence</w:p></w:document>'));
  const result=inspectFile('document.docx',zip.toBuffer());
  assert.equal(result.error,undefined);
  assert.match(result.extracted_files[0].content,/Test sentence/);
});
