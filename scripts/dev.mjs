import {spawn} from 'node:child_process';
const children = [
  spawn('uv', ['run', 'uvicorn', 'backend.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000'], {stdio:'inherit'}),
  spawn('npm', ['--prefix', 'ruby-sapphire-prototype', 'run', 'dev'], {stdio:'inherit'}),
];
let stopping = false;
function stop(code=0) {if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');process.exitCode=code;}
for(const child of children){child.on('error',e=>{console.error(e.message);stop(1)});child.on('exit',code=>stop(code||0));}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
