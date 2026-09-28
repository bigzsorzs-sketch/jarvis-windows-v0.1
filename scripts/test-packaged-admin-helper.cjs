'use strict';

const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

if (process.platform !== 'win32') {
  console.log('Packaged admin helper handshake test skipped outside Windows.');
  process.exit(0);
}

const exe = path.resolve(process.argv[2] || path.join('release','win-unpacked','Jarvis.exe'));
const pipeName = 'jarvis-ci-' + crypto.randomBytes(12).toString('hex');
const token = crypto.randomBytes(32).toString('hex');
const pipe = '\\\\.\\pipe\\' + pipeName;
const timeoutMs = 30000;

let child = null;
let done = false;
const fail = (error) => {
  if (done) return;
  done = true;
  try { child?.kill(); } catch {}
  console.error(error?.stack || error);
  process.exitCode = 1;
};

const timer = setTimeout(() => fail(new Error('ADMIN_HELPER_HANDSHAKE_TIMEOUT')), timeoutMs);
timer.unref?.();

const server = net.createServer((socket) => {
  socket.setEncoding('utf8');
  let buffer = '';
  let helloSeen = false;

  socket.on('data', (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);

      if (!helloSeen) {
        if (message?.type !== 'hello' || message?.token !== token) {
          fail(new Error('ADMIN_HELPER_BAD_HELLO'));
          return;
        }
        helloSeen = true;
        socket.write(JSON.stringify({ id:1, token, operation:'ping', payload:{} }) + '\n');
        continue;
      }

      if (message?.id === 1) {
        if (!message.ok || !message.result?.identity) {
          fail(new Error('ADMIN_HELPER_PING_FAILED:' + JSON.stringify(message)));
          return;
        }
        socket.write(JSON.stringify({ id:2, token, operation:'close', payload:{} }) + '\n');
        continue;
      }

      if (message?.id === 2) {
        clearTimeout(timer);
        done = true;
        try { socket.end(); } catch {}
        try { server.close(); } catch {}
        console.log('Packaged admin helper handshake OK');
      }
    }
  });
  socket.on('error', fail);
});

server.on('error', fail);
server.listen(pipe, () => {
  child = spawn(exe, [
    '--jarvis-admin-helper',
    '--jarvis-admin-pipe=' + pipeName,
    '--jarvis-admin-token=' + token
  ], {
    windowsHide:true,
    stdio:['ignore','pipe','pipe']
  });
  child.stdout?.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr?.on('data', (chunk) => process.stderr.write(chunk));
  child.on('error', fail);
  child.on('exit', (code) => {
    if (!done && code !== 0) fail(new Error('ADMIN_HELPER_EXIT_' + code));
  });
});
