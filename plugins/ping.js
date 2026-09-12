'use strict';

const os = require('os');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { Module } = require('../main');
const config = require('../config');
const { AIRich } = require('../core/airich');

const BANNER = 'https://c.termai.cc/a199/0Dw0j.jpg';

function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let value = Number(bytes) || 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function getDisk() {
  try {
    const output = execFileSync('df', ['-kP', '/'], { timeout: 3000 }).toString().trim().split('\n');
    const row = output.slice(1).map(line => line.trim().split(/\s+/))[0];
    if (!row || row.length < 5) return null;
    const total = Number(row[1]) * 1024;
    const used = Number(row[2]) * 1024;
    if (!total) return null;
    return { total, used, percent: Number((used / total * 100).toFixed(1)) };
  } catch {
    return null;
  }
}

function getSwap() {
  try {
    const content = fs.readFileSync('/proc/meminfo', 'utf8');
    const totalMatch = content.match(/^SwapTotal:\s+(\d+)/m);
    const freeMatch = content.match(/^SwapFree:\s+(\d+)/m);
    const total = Number(totalMatch?.[1] || 0) * 1024;
    const free = Number(freeMatch?.[1] || 0) * 1024;
    if (!total) return null;
    const used = total - free;
    return { total, used, free, percent: Number((used / total * 100).toFixed(1)) };
  } catch {
    return null;
  }
}

function getNetwork() {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (!address.internal && address.family === 'IPv4') return address.address;
    }
  }
  return '-';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatUptime(seconds) {
  let remaining = Math.max(0, Math.floor(seconds));
  const days = Math.floor(remaining / 86400);
  remaining %= 86400;
  const hours = Math.floor(remaining / 3600);
  remaining %= 3600;
  const minutes = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return `${days ? days + 'd ' : ''}${hours || days ? hours + 'h ' : ''}${minutes || hours || days ? minutes + 'm ' : ''}${secs}s`;
}

function collectStats(message) {
  const cores = os.cpus().length || 1;
  const load = os.loadavg()[0] || 0;
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const heap = process.memoryUsage();
  const disk = getDisk();
  const swap = getSwap();
  const botInfo = String(config.BOT_INFO || '').split(';');
  const botName = escapeHtml(botInfo[0] || 'Raganork-MD');
  const cpuModel = escapeHtml((os.cpus()[0]?.model || 'Unknown CPU').replace(/\(R\)|\(TM\)/g, '').trim());
  const runtime = `Node ${process.version}`;
  const engine = `V8 ${process.versions.v8}`;

  return {
    botName,
    cpu: Number(Math.min(99.9, load / cores * 100).toFixed(1)),
    ram: Number((usedMemory / totalMemory * 100).toFixed(1)),
    disk: disk?.percent || 0,
    cores,
    cpuModel,
    osType: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    memUsed: formatSize(usedMemory),
    memTotal: formatSize(totalMemory),
    heapUsed: formatSize(heap.heapUsed),
    rss: formatSize(heap.rss),
    diskTxt: disk ? `${formatSize(disk.used)} / ${formatSize(disk.total)}` : '-',
    swapTxt: swap ? `${formatSize(swap.used)} / ${formatSize(swap.total)} (${swap.percent}%)` : 'not available',
    net: getNetwork(),
    runtime,
    engine,
    botUpSec: Math.floor(process.uptime()),
    sysUpSec: Math.floor(os.uptime()),
    at: Date.now(),
    sender: escapeHtml(message.senderName || 'User')
  };
}

function buildHtml(data, speed) {
  const payload = JSON.stringify({
    cpu: data.cpu,
    ram: data.ram,
    disk: data.disk,
    botUpSec: data.botUpSec,
    sysUpSec: data.sysUpSec,
    at: data.at
  }).replace(/</g, '\\u003c');

  return `<style>
*{box-sizing:border-box;margin:0;font-family:'Segoe UI',Arial,sans-serif;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
html,body{width:100%}
body{background:linear-gradient(165deg,#0a1526,#060c18 60%,#04080f);padding:8px;color:#e8f0ff;overflow-y:auto}
#app{max-width:420px;margin:0 auto}
.hdr{display:flex;gap:10px;align-items:center;padding:10px;border:1px solid rgba(90,160,255,.25);border-radius:16px;background:linear-gradient(150deg,rgba(40,90,180,.25),rgba(10,25,50,.5));margin-bottom:8px}
.hdr img{width:52px;height:52px;border-radius:12px;object-fit:cover;border:1px solid rgba(120,180,255,.4)}
.hdr h1{font:900 16px 'Arial Black';color:#fff}
.hdr .st{display:flex;align-items:center;gap:5px;font-size:10px;color:#4ade80;margin-top:2px}
.hdr .st i{width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 8px #4ade80;animation:blink 1.6s infinite}
@keyframes blink{50%{opacity:.35}}
.up{border:1px solid rgba(74,222,128,.3);border-radius:13px;background:rgba(74,222,128,.06);padding:9px 11px;margin-bottom:8px;text-align:center}
.up small{font:700 8px Arial;letter-spacing:1.5px;color:#5ea877}
.up b{display:block;font:900 17px 'Arial Black';color:#7dffab;font-variant-numeric:tabular-nums;margin-top:2px}
.up span{font:600 9px monospace;color:#9fb8d8}
.gauge{border:1px solid rgba(255,255,255,.1);border-radius:13px;background:rgba(255,255,255,.04);padding:9px 11px;margin-bottom:7px}
.gl{display:flex;justify-content:space-between;font:700 10.5px monospace;margin-bottom:5px}
.gl b{color:#7db8ff}.gl span{color:#eaf3ff;font-variant-numeric:tabular-nums}
.bar{height:9px;border-radius:6px;background:rgba(0,0,0,.45);overflow:hidden}
.bar i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#3b82f6,#22d3ee);transition:width 1.8s cubic-bezier(.45,.05,.3,1);box-shadow:0 0 9px #38bdf866}
.bar.r i{background:linear-gradient(90deg,#f43f5e,#fb923c)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:8px 0}
.cell{border:1px solid rgba(255,255,255,.09);border-radius:11px;padding:7px 9px;background:rgba(255,255,255,.03)}
.cell i{display:block;font:700 7.5px Arial;font-style:normal;letter-spacing:1px;color:#7285a8}
.cell b{font:700 10.5px monospace;color:#dbe7ff;word-break:break-word}
.ft{display:flex;justify-content:space-between;font:600 8.5px monospace;color:#5d7396;padding:2px 4px}
.pulse{animation:pl 2.4s ease-in-out infinite}
@keyframes pl{50%{opacity:.45}}
</style>
<div id="app">
<div class="hdr"><img src="${BANNER}" onerror="this.remove()"><div><h1>📡 SERVER LIVE</h1><div class="st"><i></i>REALTIME MONITOR · <b id="spd">${speed} ms</b></div></div></div>
<div class="up"><small>⏱️ BOT UPTIME — REALTIME</small><b id="up">-</b><span id="sys">-</span></div>
<div class="gauge"><div class="gl"><b>CPU LOAD</b><span id="cv">-</span></div><div class="bar" id="cb"><i style="width:0%"></i></div></div>
<div class="gauge"><div class="gl"><b>RAM</b><span id="rv">-</span></div><div class="bar" id="rb"><i style="width:0%"></i></div></div>
<div class="gauge"><div class="gl"><b>DISK</b><span id="dv">-</span></div><div class="bar" id="db"><i style="width:0%"></i></div></div>
<div class="grid">
<div class="cell"><i>OS</i><b>${data.osType}</b></div>
<div class="cell"><i>ARCH</i><b>${data.arch}</b></div>
<div class="cell"><i>CPU</i><b>${data.cores} core · ${data.cpuModel}</b></div>
<div class="cell"><i>HEAP / RSS</i><b>${data.heapUsed} / ${data.rss}</b></div>
<div class="cell"><i>SWAP</i><b>${data.swapTxt}</b></div>
<div class="cell"><i>IP PRIMER</i><b>${data.net}</b></div>
<div class="cell"><i>MEMORY</i><b>${data.memUsed} / ${data.memTotal}</b></div>
<div class="cell"><i>DISK</i><b>${data.diskTxt}</b></div>
<div class="cell" style="grid-column:1/-1"><i>RUNTIME</i><b>${data.runtime} · ${data.engine}</b></div>
</div>
<div class="ft"><span id="age">updated 0 sec ago</span><b class="pulse">data monitor · ${data.botName}</b></div>
</div>
<script>
var D=${payload};
function $(i){return document.getElementById(i)}
function fmt(s){var d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),x=s%60;return (d?d+'d ':'')+(h||d?h+'h ':'')+(m||h||d?m+'m ':'')+x+'s'}
function paint(cpu,ram,disk){$('cb').firstChild.style.width=cpu+'%';$('cv').textContent=cpu.toFixed(1)+'%';$('rb').firstChild.style.width=ram+'%';$('rv').textContent=ram.toFixed(1)+'%';$('db').firstChild.style.width=disk+'%';$('dv').textContent=disk.toFixed(1)+'%';$('cb').className='bar'+(cpu>85?' r':'');$('rb').className='bar'+(ram>85?' r':'');$('db').className='bar'+(disk>90?' r':'')}
function tick(){var el=Math.floor((Date.now()-D.at)/1000);$('up').textContent=fmt(D.botUpSec+el);$('sys').textContent='system: '+fmt(D.sysUpSec+el);$('age').textContent='updated '+el+' sec ago'}
function breathe(){var n=function(v,a,l,h){var x=v+(Math.random()*2-1)*a;return Math.max(l,Math.min(h,x))};paint(n(D.cpu,3,2,99),n(D.ram,1.5,2,99),n(D.disk,.6,1,99))}
paint(0,0,0);setTimeout(breathe,350);setInterval(breathe,2000);setInterval(tick,1000);tick();
</script>`;
}

Module({
  pattern: 'ping',
  desc: 'Shows live server status with realtime monitoring',
  use: 'utility',
  usage: 'ping'
}, async (message) => {
  const startedAt = process.hrtime.bigint();

  try {
    await message.react('📡');

    const stats = collectStats(message);
    const elapsed = Number(process.hrtime.bigint() - startedAt) / 1000000;
    const speed = Math.max(0, Number(elapsed.toFixed(2)));

    const rich = new AIRich(message.client, {
      dynamic: true,
      unsupportedTypeAlert: false
    });

    rich
      .setTitle('📡 SERVER LIVE')
      .setFooter(`Uptime realtime · monitor bernafas · ${stats.sender}`)
      .addHtml(buildHtml(stats, speed));

    await rich.send(message.jid, {
      quoted: message.data,
      forwarded: false,
      notification: false,
      includesUnifiedResponse: true,
      includesSubmessages: false
    });
  } catch (error) {
    console.error('[PING]', error);
    try {
      await message.sendReply(`_Ping failed:_ ${String(error?.message || error).slice(0, 300)}`);
    } catch {}
  }
});
