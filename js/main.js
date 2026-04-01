// =============================================================
//  BẢNG TÂM SỰ 12 TIN — main.js
//  Anon key để lộ là bình thường với Supabase.
//  Bảo vệ data bằng Row Level Security (RLS) trên Supabase dashboard.
// =============================================================

// ── Credentials (thay 2 dòng này)
const SUPABASE_URL = 'https://ofdaljfdvxudloedyeez.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9iqTy72xARfxIHnEYNkceg_CVCJ7FUg';

// ── Config giao diện
const CONFIG = {
  className : '12 Tin',
  year      : '2026',
  maxChars  : 160,
  colors    : ['#fef08a','#fda4af','#a7f3d0','#ddd6fe','#fed7aa','#bae6fd'],
  pinColors : ['#ef4444','#3b82f6','#8b5cf6','#f97316','#10b981','#ec4899'],
};

// =============================================================
//  UTILS
// =============================================================

const rand    = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick    = (arr)  => arr[randInt(0, arr.length - 1)];

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  // → "25/05/2026, 21:34"
}

let _toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function spawnConfetti() {
  for (let i = 0; i < 30; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.cssText = `
      left:${rand(15,85)}vw; top:-20px;
      background:${pick(CONFIG.colors)};
      width:${randInt(7,13)}px; height:${randInt(7,13)}px;
      animation-delay:${rand(0,0.6)}s;
      animation-duration:${rand(1,1.8)}s;
      border-radius:${Math.random()>.5?'50%':'2px'};
    `;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }
}

// =============================================================
//  NOTES
// =============================================================

function renderNote(note, isNew = false) {
  const container = document.getElementById('notesContainer');
  if (document.querySelector(`.note[data-id="${note.id}"]`)) return;

  const el       = document.createElement('div');
  const rot      = note.rotation ?? parseFloat(rand(-6, 6).toFixed(2));
  const tx       = parseFloat(rand(-8, 8).toFixed(1));
  const ty       = parseFloat(rand(-8, 8).toFixed(1));
  const color    = note.color ?? pick(CONFIG.colors);
  const pinColor = pick(CONFIG.pinColors);

  el.className  = 'note' + (isNew ? ' note--new' : '');
  el.dataset.id = note.id;
  el.style.cssText = `background:${color}; --rot:${rot}deg; --tx:${tx}px; --ty:${ty}px;`;

  el.innerHTML = `
    <div class="note__pin" style="background:radial-gradient(circle at 35% 35%,${pinColor}cc,${pinColor})"></div>
    <p class="note__text">${escHtml(note.content)}</p>
    <span class="note__time">${formatTime(note.created_at)}</span>
  `;

  el.addEventListener('click', () => openViewer(note, color, pinColor));

  container.appendChild(el);
  if (isNew) el.addEventListener('animationend', () => el.classList.remove('note--new'), { once: true });
  syncUI();
}

function syncUI() {
  const count = document.querySelectorAll('.note').length;
  const countEl = document.getElementById('noteCount');
  const emptyEl = document.getElementById('emptyState');
  if (countEl) countEl.textContent = `${count} tâm sự`;
  if (emptyEl) emptyEl.style.display = count === 0 ? 'flex' : 'none';
}


// =============================================================
//  NOTE VIEWER — click để đọc full
// =============================================================

function openViewer(note, color, pinColor) {
  const overlay = document.getElementById('viewerOverlay');
  const card    = document.getElementById('viewerCard');
  const pin     = document.getElementById('viewerPin');
  const text    = document.getElementById('viewerText');
  const time    = document.getElementById('viewerTime');

  card.style.background = color;
  pin.style.background  = `radial-gradient(circle at 35% 35%, ${pinColor}cc, ${pinColor})`;
  text.textContent      = note.content;
  time.textContent      = formatTime(note.created_at);

  overlay.classList.add('open');
}

function closeViewer() {
  document.getElementById('viewerOverlay').classList.remove('open');
}

// =============================================================
//  SUPABASE
// =============================================================

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

function setStatus(state) {
  const map = {
    connecting : { dot: '',        text: 'Đang kết nối...' },
    live       : { dot: '',        text: '● Live'           },
    offline    : { dot: 'offline', text: 'Mất kết nối'     },
  };
  const s = map[state] ?? map.offline;
  document.getElementById('liveDot').className    = 'dot ' + s.dot;
  document.getElementById('liveText').textContent = s.text;
}

async function loadNotes() {
  try {
    const { data, error } = await db
      .from('notes')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    document.getElementById('loadingOverlay').style.display = 'none';
    (data ?? []).forEach(n => renderNote(n, false));
    syncUI();
  } catch (err) {
    document.getElementById('loadingOverlay').style.display = 'none';
    setStatus('offline');
    showToast('⚠️ Không kết nối được DB — kiểm tra credentials!');
    console.error('[DB] loadNotes:', err);
  }
}

let _realtimeChannel = null;
let _reconnectTimer  = null;

function subscribeRealtime() {
  // Hủy channel cũ nếu có
  if (_realtimeChannel) {
    db.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }

  _realtimeChannel = db.channel('notes-rt', {
    config: { broadcast: { self: false } },
  });

  _realtimeChannel
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notes' }, ({ new: note }) => {
      renderNote(note, true);
      showToast('📌 Có tâm sự mới vừa được dán lên!');
    })
    .subscribe(status => {
      clearTimeout(_reconnectTimer);

      if (status === 'SUBSCRIBED') {
        setStatus('live');
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setStatus('offline');
        // Tự reconnect sau 3 giây
        _reconnectTimer = setTimeout(() => {
          setStatus('connecting');
          subscribeRealtime();
        }, 3000);
      }
    });
}

async function insertNote(payload) {
  const { error } = await db.from('notes').insert([payload]);
  if (error) throw error;
}

// =============================================================
//  MODAL
// =============================================================

let _selectedColor = CONFIG.colors[0];

function openModal() {
  const input = document.getElementById('noteInput');
  input.value = '';
  updateCharCount(0);
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => input.focus(), 280);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function updateCharCount(len) {
  const el = document.getElementById('charCount');
  el.textContent = `${len} / ${CONFIG.maxChars}`;
  el.classList.toggle('warn', len > CONFIG.maxChars - 30);
}

async function submitNote() {
  const input     = document.getElementById('noteInput');
  const submitBtn = document.getElementById('submitBtn');
  const content   = input.value.trim();
  if (!content) { input.focus(); return; }

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Đang dán...';

  try {
    await insertNote({
      content,
      color    : _selectedColor,
      rotation : parseFloat(rand(-6, 6).toFixed(2)),
    });
    closeModal();
    showToast('🎉 Tâm sự đã được dán lên bảng!');
    spawnConfetti();
  } catch (err) {
    showToast('❌ Lỗi: ' + err.message);
    console.error('[Modal] submit:', err);
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = '📌 Dán lên bảng!';
  }
}

// =============================================================
//  BOOT
// =============================================================

document.addEventListener('DOMContentLoaded', () => {

  // Tên lớp từ config
  document.getElementById('boardTitle').textContent    = `📌 Bảng Tâm Sự Lớp ${CONFIG.className}`;
  document.getElementById('boardSubtitle').textContent = `Mùa thi ${CONFIG.year} — Gửi hết tâm tư vào đây đi nào`;

  // Render color swatches động từ config
  document.getElementById('colorPicker').innerHTML = CONFIG.colors.map((c, i) => `
    <div class="color-swatch ${i === 0 ? 'selected' : ''}" data-color="${c}" style="background:${c}"></div>
  `).join('');

  // ── Event listeners
  document.getElementById('addBtn')      .addEventListener('click', openModal);
  document.getElementById('cancelBtn')   .addEventListener('click', closeModal);
  document.getElementById('submitBtn')   .addEventListener('click', submitNote);

  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target.id === 'modalOverlay') closeModal();
  });

  document.getElementById('noteInput').addEventListener('input', e => {
    updateCharCount(e.target.value.length);
  });

  document.getElementById('noteInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) submitNote();
  });

  document.getElementById('colorPicker').addEventListener('click', e => {
    const sw = e.target.closest('.color-swatch');
    if (!sw) return;
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected');
    _selectedColor = sw.dataset.color;
  });

  document.addEventListener('keydown', e => {
    const tag = document.activeElement.tagName;
    if (e.key === 'Escape') { closeModal(); closeViewer(); document.getElementById('qrPopupOverlay').classList.remove('open'); }
    if (e.key === 'n' && tag !== 'TEXTAREA' && tag !== 'INPUT'
        && !document.getElementById('modalOverlay').classList.contains('open')) {
      openModal();
    }
  });

  // ── QR popup events
  document.getElementById('qrPopupClose').addEventListener('click', () =>
    document.getElementById('qrPopupOverlay').classList.remove('open')
  );
  document.getElementById('qrPopupOverlay').addEventListener('click', e => {
    if (e.target.id === 'qrPopupOverlay')
      document.getElementById('qrPopupOverlay').classList.remove('open');
  });
  document.querySelector('.qr-badge').addEventListener('click', () =>
    document.getElementById('qrPopupOverlay').classList.add('open')
  );

  // ── Viewer events
  document.getElementById('viewerClose').addEventListener('click', closeViewer);
  document.getElementById('viewerOverlay').addEventListener('click', e => {
    if (e.target.id === 'viewerOverlay') closeViewer();
  });

  // ── Khởi động
  setStatus('connecting');
  loadNotes();
  subscribeRealtime();
});