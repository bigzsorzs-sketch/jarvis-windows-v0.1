import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {validateUploadedFileUrl,MAX_FILE_BYTES} = require('../../electron/analysis/file-upload-validator.cjs');

// Execute the REAL UploadFile method from jarvisClient, substituting only its
// two external boundaries (FileReader and the native IPC invoke). These tests
// exercise the full validation call path rather than looking for a string.
function makeUpload({ipc,reader}) {
  const source = fs.readFileSync('src/api/jarvisClient.js','utf8');
  const from = source.indexOf('async UploadFile({ file }) {');
  const to = source.indexOf('async GenerateImage(',from);
  assert.ok(from !== -1 && to > from,'UploadFile method not found');
  const method = source.slice(from,to).trim().replace(/,\s*$/, '');
  return vm.runInNewContext('({' + method + '})',{FileReader:reader,invoke:ipc}).UploadFile;
}

class TestFileReader {
  readAsDataURL(file) {
    this.result = file.content;
    this.onload();
  }
}

test('a normal uploaded file is checked by the Electron validator before return', async () => {
  const seen=[];
  const upload=makeUpload({
    reader:TestFileReader,
    ipc:async (operation,payload)=>{
      seen.push({operation,payload});
      return {data:validateUploadedFileUrl(payload.file_url)};
    }
  });
  const content='data:text/plain;base64,'+Buffer.from('hello').toString('base64');
  const result=await upload({file:{name:'test.txt',type:'text/plain',size:5,content}});
  assert.equal(seen.length,1);
  assert.equal(seen[0].operation,'validateFileUpload');
  assert.equal(seen[0].payload.file_url,content);
  assert.equal(result.file_url,content);
  assert.equal(result.size,5);
});

test('a failed native validator cannot be bypassed by a valid-looking file URL', async () => {
  const upload=makeUpload({
    reader:TestFileReader,
    ipc:async()=>({data:{valid:false,allowed:false,reason:'FILE_DENIED'}})
  });
  await assert.rejects(
    () => upload({file:{name:'test.txt',size:1,content:'data:text/plain;base64,YQ=='}}),
    /FILE_DENIED/
  );
});

test('a malformed upload gets rejected in the actual upload path', async () => {
  const upload=makeUpload({
    reader:TestFileReader,
    ipc:async(_operation,payload)=>({data:validateUploadedFileUrl(payload.file_url)})
  });
  await assert.rejects(
    ()=>upload({file:{name:'bad.txt',size:1,content:'file:///C:/Windows/win.ini'}}),
    /FILE_DATA_URL_REQUIRED/
  );
});

test('a missing or broken native bridge is a failed upload, never an approval', async () => {
  for(const ipc of [async()=>undefined,async()=>({data:{}}),async()=>{throw new Error('IPC_UNAVAILABLE');}]) {
    const upload=makeUpload({reader:TestFileReader,ipc});
    await assert.rejects(
      ()=>upload({file:{name:'test.txt',size:1,content:'data:text/plain;base64,YQ=='}}),
      /FILE_VALIDATION_FAILED|IPC_UNAVAILABLE/
    );
  }
});

test('oversized uploads are rejected before allocating a FileReader result', async () => {
  let readCount=0,ipcCount=0;
  class ProbeFileReader {
    readAsDataURL(){readCount++;throw new Error('SHOULD_NOT_READ');}
  }
  const upload=makeUpload({reader:ProbeFileReader,ipc:async()=>{ipcCount++;return null;}});
  await assert.rejects(
    ()=>upload({file:{name:'big.zip',size:MAX_FILE_BYTES+1,type:'application/zip'}}),
    /FILE_TOO_LARGE/
  );
  assert.equal(readCount,0);
  assert.equal(ipcCount,0);
});
