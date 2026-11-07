import fs from 'node:fs';
const files=fs.readdirSync('dist/assets');
const js=fs.readFileSync('dist/assets/'+files.find(f=>f.endsWith('.js')),'utf8');
const css=fs.readFileSync('dist/assets/'+files.find(f=>f.endsWith('.css')),'utf8');
fs.writeFileSync('preview.html',`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ruby vs Sapphire — Interactive prototype</title><style>${css}</style></head><body><div id="root"></div><script type="module">${js.replaceAll('</script','<\\/script')}</script></body></html>`);
console.log('Created standalone preview.html');
