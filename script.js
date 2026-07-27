async function safeGet(key){ try{ const r = await window.storage.get(key,false); return r?r.value:null; }catch(e){ return null; } }
async function safeSet(key,val){ try{ return await window.storage.set(key,val,false); }catch(e){ return null; } }
async function safeDelete(key){ try{ return await window.storage.delete(key,false); }catch(e){ return null; } }

const WELCOME = `# Welcome to Manuscript

A distraction-light Markdown editor with **live preview**, multiple saved documents, and one-click export.

## Try the toolbar
Select some text and click **B** or *i*, or just type Markdown directly:

- Lists like this one
- \`inline code\` and fenced blocks
- > blockquotes for asides

\`\`\`
function hello(){
  return "formatted code blocks too";
}
\`\`\`

1. Everything autosaves
2. Switch between Edit, Split, and Preview up top
3. Export to \`.md\` or a styled \`.html\` file whenever you're ready

[Markdown cheatsheet](https://www.markdownguide.org/cheat-sheet/) if you ever need a refresher.
`;

let docs = [];      // [{id, title, updatedAt, snippet}]
let currentId = null;
let currentContent = '';
let currentTitle = '';
let saveTimer = null;
let viewMode = 'split';

/* ---------------- Persistence ---------------- */
async function loadIndex(){
  const raw = await safeGet('md:index');
  docs = raw ? JSON.parse(raw) : [];
}
async function saveIndex(){ await safeSet('md:index', JSON.stringify(docs)); }
async function loadDoc(id){
  const raw = await safeGet(`md:doc:${id}`);
  return raw ? JSON.parse(raw) : null;
}
async function persistCurrentDoc(){
  const doc = { id: currentId, title: currentTitle || 'Untitled', content: currentContent, updatedAt: Date.now() };
  await safeSet(`md:doc:${currentId}`, JSON.stringify(doc));
  const idx = docs.findIndex(d => d.id === currentId);
  const meta = { id: currentId, title: doc.title, updatedAt: doc.updatedAt, snippet: currentContent.replace(/[#*_>`\-\[\]!]/g,'').slice(0,60).trim() };
  if(idx >= 0) docs[idx] = meta; else docs.unshift(meta);
  docs.sort((a,b) => b.updatedAt - a.updatedAt);
  await saveIndex();
  renderDocList();
}

function scheduleSave(){
  document.getElementById('saveDot').classList.add('saving');
  document.getElementById('saveText').textContent = 'saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await persistCurrentDoc();
    document.getElementById('saveDot').classList.remove('saving');
    document.getElementById('saveText').textContent = 'saved';
  }, 500);
}
async function flushSave(){
  clearTimeout(saveTimer);
  await persistCurrentDoc();
  document.getElementById('saveDot').classList.remove('saving');
  document.getElementById('saveText').textContent = 'saved';
}

/* ---------------- Doc list UI ---------------- */
function renderDocList(){
  const list = document.getElementById('docList');
  list.innerHTML = '';
  docs.forEach(d => {
    const item = document.createElement('div');
    item.className = 'doc-item' + (d.id === currentId ? ' active' : '');
    item.innerHTML = `<div class="title">${escapeHtml(d.title || 'Untitled')}</div><div class="snippet">${escapeHtml(d.snippet || '')}</div><button class="del" title="Delete">✕</button>`;
    item.addEventListener('click', async (e) => {
      if(e.target.classList.contains('del')) return;
      if(d.id === currentId) return;
      await flushSave();
      await openDoc(d.id);
    });
    item.querySelector('.del').addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteDoc(d.id);
    });
    list.appendChild(item);
  });
  document.getElementById('docCount').textContent = `${docs.length} document${docs.length===1?'':'s'}`;
}
function escapeHtml(str){ const d=document.createElement('div'); d.textContent=str; return d.innerHTML; }

async function openDoc(id){
  const doc = await loadDoc(id);
  if(!doc) return;
  currentId = doc.id; currentTitle = doc.title; currentContent = doc.content;
  document.getElementById('titleInput').value = currentTitle;
  document.getElementById('editor').value = currentContent;
  renderPreview();
  updateStats();
  renderDocList();
}

async function newDoc(seedContent){
  const id = 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
  currentId = id; currentTitle = 'Untitled'; currentContent = seedContent || '';
  document.getElementById('titleInput').value = currentTitle;
  document.getElementById('editor').value = currentContent;
  renderPreview();
  updateStats();
  await persistCurrentDoc();
}

async function deleteDoc(id){
  docs = docs.filter(d => d.id !== id);
  await safeDelete(`md:doc:${id}`);
  await saveIndex();
  if(currentId === id){
    if(docs.length){ await openDoc(docs[0].id); }
    else { await newDoc(WELCOME); }
  }
  renderDocList();
}

/* ---------------- Preview + stats ---------------- */
function renderPreview(){
  try{
    document.getElementById('preview').innerHTML = marked.parse(currentContent || '');
  }catch(e){
    document.getElementById('preview').innerHTML = '<p style="color:#a1442e">Could not render preview.</p>';
  }
}
function updateStats(){
  const words = (currentContent.trim().match(/\S+/g) || []).length;
  const mins = Math.max(1, Math.ceil(words / 200));
  document.getElementById('wordStats').textContent = `${words} word${words===1?'':'s'} · ${mins} min read`;
}

/* ---------------- Editor events ---------------- */
const editorEl = document.getElementById('editor');
editorEl.addEventListener('input', () => {
  currentContent = editorEl.value;
  renderPreview();
  updateStats();
  scheduleSave();
});
document.getElementById('titleInput').addEventListener('input', (e) => {
  currentTitle = e.target.value;
  scheduleSave();
});

/* ---------------- Toolbar formatting ---------------- */
function wrapSelection(before, after, placeholder){
  const start = editorEl.selectionStart, end = editorEl.selectionEnd;
  const val = editorEl.value;
  const selected = val.slice(start, end) || placeholder;
  const newVal = val.slice(0, start) + before + selected + after + val.slice(end);
  editorEl.value = newVal;
  editorEl.focus();
  editorEl.selectionStart = start + before.length;
  editorEl.selectionEnd = start + before.length + selected.length;
  editorEl.dispatchEvent(new Event('input'));
}
function prefixLines(prefix){
  const start = editorEl.selectionStart, end = editorEl.selectionEnd;
  const val = editorEl.value;
  const lineStart = val.lastIndexOf('\n', start-1) + 1;
  const lineEnd = val.indexOf('\n', end); const realEnd = lineEnd === -1 ? val.length : lineEnd;
  const block = val.slice(lineStart, realEnd);
  const newBlock = block.split('\n').map(l => l ? prefix + l : l).join('\n');
  editorEl.value = val.slice(0, lineStart) + newBlock + val.slice(realEnd);
  editorEl.focus();
  editorEl.dispatchEvent(new Event('input'));
}
const commands = {
  bold: () => wrapSelection('**','**','bold text'),
  italic: () => wrapSelection('*','*','italic text'),
  h2: () => prefixLines('## '),
  link: () => wrapSelection('[','](https://)','link text'),
  image: () => wrapSelection('![','](https://)','alt text'),
  code: () => wrapSelection('`','`','code'),
  ul: () => prefixLines('- '),
  ol: () => prefixLines('1. '),
  quote: () => prefixLines('> '),
};
document.querySelectorAll('.tb-btn').forEach(btn => {
  btn.addEventListener('click', () => commands[btn.dataset.cmd] && commands[btn.dataset.cmd]());
});

/* ---------------- View mode ---------------- */
document.querySelectorAll('#viewToggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    viewMode = btn.dataset.mode;
    document.querySelectorAll('#viewToggle button').forEach(b => b.classList.toggle('active', b === btn));
    const editorPane = document.getElementById('editorPane');
    const previewPane = document.getElementById('previewPane');
    editorPane.style.display = viewMode === 'preview' ? 'none' : 'block';
    previewPane.style.display = viewMode === 'edit' ? 'none' : 'flex';
  });
});

/* ---------------- Synced scroll ---------------- */
let syncing = false;
editorEl.addEventListener('scroll', () => {
  if(syncing || viewMode !== 'split') return;
  syncing = true;
  const previewPane = document.getElementById('previewPane');
  const frac = editorEl.scrollTop / Math.max(1, editorEl.scrollHeight - editorEl.clientHeight);
  previewPane.scrollTop = frac * (previewPane.scrollHeight - previewPane.clientHeight);
  requestAnimationFrame(() => syncing = false);
});

/* ---------------- Export ---------------- */
document.getElementById('exportBtn').addEventListener('click', () => document.getElementById('exportPanel').classList.toggle('open'));
document.addEventListener('click', (e) => {
  if(!e.target.closest('.export-menu')) document.getElementById('exportPanel').classList.remove('open');
});
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}
document.getElementById('copyMd').addEventListener('click', async () => {
  await navigator.clipboard.writeText(currentContent);
  showToast('Markdown copied'); document.getElementById('exportPanel').classList.remove('open');
});
document.getElementById('copyHtml').addEventListener('click', async () => {
  await navigator.clipboard.writeText(document.getElementById('preview').innerHTML);
  showToast('HTML copied'); document.getElementById('exportPanel').classList.remove('open');
});
function download(filename, content, mime){
  const blob = new Blob([content], {type: mime});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
document.getElementById('dlMd').addEventListener('click', () => {
  download((currentTitle||'untitled') + '.md', currentContent, 'text/markdown');
  document.getElementById('exportPanel').classList.remove('open');
});
document.getElementById('dlHtml').addEventListener('click', () => {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(currentTitle)}</title>
  <style>body{font-family:Georgia,serif;max-width:680px;margin:60px auto;line-height:1.7;color:#2b241c;padding:0 20px}
  h1,h2,h3{font-family:Georgia,serif} code{background:#f0ece2;padding:2px 6px;border-radius:4px}
  pre{background:#231f1a;color:#e9e4d8;padding:16px;border-radius:8px;overflow-x:auto}
  blockquote{border-left:3px solid #3d6b63;margin:0;padding-left:18px;color:#666;font-style:italic}
  img{max-width:100%}</style></head><body>${document.getElementById('preview').innerHTML}</body></html>`;
  download((currentTitle||'untitled') + '.html', html, 'text/html');
  document.getElementById('exportPanel').classList.remove('open');
});

/* ---------------- Sidebar toggle (mobile) ---------------- */
document.getElementById('sidebarToggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
document.getElementById('newDocBtn').addEventListener('click', async () => { await flushSave(); await newDoc(''); });

/* ---------------- Init ---------------- */
(async function init(){
  await loadIndex();
  if(docs.length){
    await openDoc(docs[0].id);
  } else {
    await newDoc(WELCOME);
    docs = [{ id: currentId, title: 'Untitled', updatedAt: Date.now(), snippet: 'Welcome to Manuscript…' }];
    renderDocList();
  }
  window.addEventListener('beforeunload', () => { flushSave(); });
})();