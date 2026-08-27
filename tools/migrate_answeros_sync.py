from pathlib import Path
import re

PAGES = [
    'answeros-dashboard.html',
    'answeros-all-answers.html',
    'answeros-analytics.html',
    'answeros-calendar.html',
    'answeros-pyq-tracker.html',
    'answeros-learnings.html',
    'answeros-revision-hub.html',
    'answeros-flashcards.html',
    'answeros-goals.html',
]

DATA_SCRIPT = '<script src="answeros-data.js"></script>'
INITIAL_SCRIPT = '<script src="answeros-initial-data.js"></script>'


def replace_answers_array(text: str) -> str:
    marker = re.search(r'\bconst\s+ANSWERS\s*=\s*\[', text)
    if not marker:
        return text
    start = marker.start()
    open_idx = text.find('[', marker.start())
    i = open_idx
    depth = 0
    quote = None
    escape = False
    line_comment = False
    block_comment = False
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ''
        if line_comment:
            if ch == '\n': line_comment = False
            i += 1; continue
        if block_comment:
            if ch == '*' and nxt == '/': block_comment = False; i += 2; continue
            i += 1; continue
        if quote:
            if escape: escape = False
            elif ch == '\\': escape = True
            elif ch == quote: quote = None
            i += 1; continue
        if ch == '/' and nxt == '/': line_comment = True; i += 2; continue
        if ch == '/' and nxt == '*': block_comment = True; i += 2; continue
        if ch in "'\"`": quote = ch; i += 1; continue
        if ch == '[': depth += 1
        elif ch == ']':
            depth -= 1
            if depth == 0:
                semi = i + 1
                while semi < len(text) and text[semi].isspace(): semi += 1
                if semi < len(text) and text[semi] == ';': semi += 1
                return text[:start] + 'const ANSWERS = AnswerOSData.getAnswers();' + text[semi:]
        i += 1
    raise RuntimeError(f'Could not find end of ANSWERS array in {marker.group(0)[:80]}')


def ensure_answers_binding(text: str) -> str:
    """Some older pages had their embedded array removed by the first migration but no replacement declaration.
    Add the shared binding before the first runtime reference so those pages execute normally."""
    if re.search(r'\b(?:const|let|var)\s+ANSWERS\s*=', text):
        return text
    if 'ANSWERS' not in text:
        return text
    anchor = text.find('/* ---------- derived stats ---------- */')
    if anchor == -1:
        anchor = text.find('<script>')
        if anchor == -1:
            return text
        insert_at = text.find('\n', anchor)
    else:
        insert_at = anchor
    return text[:insert_at] + '\nconst ANSWERS = AnswerOSData.getAnswers();\n' + text[insert_at:]


def add_data_scripts(text: str) -> str:
    if DATA_SCRIPT not in text:
        text = text.replace('<head>', '<head>\n' + INITIAL_SCRIPT + '\n' + DATA_SCRIPT, 1)
    elif INITIAL_SCRIPT not in text:
        text = text.replace(DATA_SCRIPT, INITIAL_SCRIPT + '\n' + DATA_SCRIPT, 1)
    return text


def patch_dashboard(text: str) -> str:
    # Never overwrite live demand values with the old date-keyed sample map.
    text = re.sub(
        r"const DEMAND_PCT = \{.*?\};\s*ANSWERS\.forEach\(a=> a\.demand = DEMAND_PCT\[a\.date\]\);",
        "ANSWERS.forEach(a=> { a.demand = a.demandPct == null ? (a.demand || 0) : a.demandPct; });",
        text,
        flags=re.S,
    )
    # Use the actual current date for the calendar's Today action.
    text = text.replace(
        "calYear=2026; calMonth=7; renderCalendar();",
        "const now = AnswerOSData.today(); calYear=now.getFullYear(); calMonth=now.getMonth(); renderCalendar();",
    )
    # Replace the old Claude-copy refresh behavior with the real shared sync.
    old = re.search(r"/\* ---------- Refresh from Sheet trigger ---------- \*/.*?document\.getElementById\('refreshBtn'\)\.addEventListener\('click', async \(\)=>\{.*?\n\}\);", text, flags=re.S)
    if old:
        new = '''/* ---------- Refresh from Sheet trigger ---------- */
document.getElementById('refreshBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('refreshBtn');
  const toast = document.getElementById('refreshToast');
  btn.classList.add('spinning');
  try{
    const result = await AnswerOSData.sync({reloadOnChange:true});
    toast.textContent = `Synced ${result.count} answers from your Google Sheet.`;
    toast.classList.add('show');
  }catch(err){
    toast.textContent = `Sync failed: ${err.message}`;
    toast.classList.add('show');
  }finally{
    btn.classList.remove('spinning');
    setTimeout(()=> toast.classList.remove('show'), 4500);
  }
});'''
        text = text[:old.start()] + new + text[old.end():]
    return text


def patch_all_answers(text: str) -> str:
    # The old page contained a separate CSV sync implementation. The shared Apps Script layer is now canonical.
    text = text.replace(
        "let connectedCsvUrl = ''; // → on your own host: let connectedCsvUrl = localStorage.getItem('answeros_csv_url') || '';",
        "let connectedCsvUrl = AnswerOSData.getConfig().syncUrl || '';",
    )
    # Make the visible Sync Now button use the shared Apps Script endpoint rather than a CSV URL.
    old = re.search(r"document\.getElementById\('syncNowBtn'\)\.addEventListener\('click', async \(\)=>\{.*?\n\}\);", text, flags=re.S)
    if old:
        new = '''document.getElementById('syncNowBtn').addEventListener('click', async ()=>{
  const url = document.getElementById('csvUrlInput').value.trim() || AnswerOSData.getConfig().syncUrl;
  const statusEl = document.getElementById('syncStatus');
  if(!url){ statusEl.textContent = 'Configure your Apps Script Web App URL in Settings first.'; statusEl.className='sync-status error'; return; }
  statusEl.textContent = 'Fetching…'; statusEl.className='sync-status';
  try{
    AnswerOSData.saveConfig({syncUrl:url});
    const result = await AnswerOSData.sync({reloadOnChange:true});
    connectedCsvUrl = url;
    statusEl.textContent = `Synced ${result.count} answers from your Google Sheet.`;
    statusEl.className='sync-status ok';
  }catch(err){
    statusEl.textContent = `Sync failed: ${err.message}`;
    statusEl.className='sync-status error';
  }
});'''
        text = text[:old.start()] + new + text[old.end():]
    return text


def migrate_page(path: Path) -> bool:
    text = path.read_text(encoding='utf-8')
    original = text
    text = add_data_scripts(text)
    text = replace_answers_array(text)
    text = ensure_answers_binding(text)
    text = re.sub(r"const\s+TODAY\s*=\s*new\s+Date\(\s*['\"]2026-08-16['\"]\s*\)\s*;", 'const TODAY = AnswerOSData.today();', text)
    text = re.sub(r"const\s+todayStr\s*=\s*['\"]2026-08-16['\"]\s*;", "const todayStr = AnswerOSData.formatDate(AnswerOSData.today());", text)
    if path.name == 'answeros-dashboard.html':
        text = patch_dashboard(text)
    elif path.name == 'answeros-all-answers.html':
        text = patch_all_answers(text)
    bootstrap = '''\n<script>\n// AnswerOS shared data bootstrap: cached data renders immediately, then the Sheet is synced.\nAnswerOSData.initPage({reloadOnChange:true});\n</script>\n'''
    if 'AnswerOSData.initPage({reloadOnChange:true});' not in text:
        text = text.replace('</body>', bootstrap + '</body>', 1)
    if text != original:
        path.write_text(text, encoding='utf-8')
        return True
    return False


def migrate_settings(path: Path) -> bool:
    text = path.read_text(encoding='utf-8')
    original = text
    text = add_data_scripts(text)
    bootstrap = r'''\n<script>\n(function(){\n  // Persist the sync controls in the same shared store used by every page.\n  function applySavedSync(){\n    const cfg = AnswerOSData.getConfig();\n    const url = document.getElementById('cfgSyncUrl');\n    const token = document.getElementById('cfgSyncToken');\n    if (url && cfg.syncUrl && !url.dataset.answerosLoaded) { url.value = cfg.syncUrl; url.dataset.answerosLoaded = '1'; }\n    if (token && cfg.syncToken && !token.dataset.answerosLoaded) { token.value = cfg.syncToken; token.dataset.answerosLoaded = '1'; }\n  }\n  function saveSyncFromUI(){\n    const url = document.getElementById('cfgSyncUrl');\n    const token = document.getElementById('cfgSyncToken');\n    const toggle = document.getElementById('togAutoSync');\n    if (!url) return;\n    AnswerOSData.saveConfig({\n      syncUrl: url.value.trim(),\n      syncToken: token ? token.value.trim() : '',\n      autoSyncEnabled: !!(toggle && toggle.classList.contains('on'))\n    });\n  }\n  const observer = new MutationObserver(applySavedSync);\n  observer.observe(document.body, {childList:true, subtree:true});\n  applySavedSync();\n  document.addEventListener('click', function(e){\n    const target = e.target.closest && e.target.closest('#saveSyncSettings, #togAutoSync');\n    if (target) setTimeout(function(){ saveSyncFromUI(); }, 0);\n  });\n})();\n</script>\n'''
    if 'Persist the sync controls in the same shared store' not in text:
        text = text.replace('</body>', bootstrap + '</body>', 1)
    if text != original:
        path.write_text(text, encoding='utf-8')
        return True
    return False

changed = []
for filename in PAGES:
    path = Path(filename)
    if path.exists() and migrate_page(path):
        changed.append(filename)

settings = Path('answeros-settings.html')
if settings.exists() and migrate_settings(settings):
    changed.append('answeros-settings.html')

print('Migrated:', ', '.join(changed) if changed else 'none')
