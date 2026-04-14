/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  AUTOCOMPLETE DE LIDERANÇAS — Snippet para liderancas.html
 *  Cole este CSS e JS no modal de cadastro/edição.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────────────
//  CSS — adicione dentro do <style> do liderancas.html
// ─────────────────────────────────────────────────────────────────────────────
const CSS_AUTOCOMPLETE = `
/* ── Autocomplete ── */
.ac-wrap {
  position: relative;
}

.ac-dropdown {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  left: 0; right: 0;
  background: white;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.12);
  z-index: 1000;
  max-height: 280px;
  overflow-y: auto;
  animation: fadeUp 0.15s ease;
}
.ac-dropdown.open { display: block; }

.ac-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.1s;
}
.ac-item:last-child { border-bottom: none; }
.ac-item:hover, .ac-item.selected { background: #eff6ff; }

.ac-avatar {
  width: 36px; height: 36px;
  border-radius: 50%;
  object-fit: cover;
  background: #e2e8f0;
  flex-shrink: 0;
  font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  color: #64748b; font-weight: 700;
}
.ac-avatar img { width:100%; height:100%; border-radius:50%; object-fit:cover; }

.ac-info { flex: 1; min-width: 0; }
.ac-nome  { font-size: 13px; font-weight: 600; color: #0f172a; }
.ac-cidades {
  font-size: 11px; color: #64748b; margin-top: 1px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.ac-badge-novo {
  font-size: 10px; font-weight: 700;
  background: #dcfce7; color: #166534;
  border-radius: 20px; padding: 2px 8px;
  flex-shrink: 0;
}
.ac-badge-existente {
  font-size: 10px; font-weight: 700;
  background: #dbeafe; color: #1d4ed8;
  border-radius: 20px; padding: 2px 8px;
  flex-shrink: 0;
}

/* Campo selecionado — destacado em azul */
.ac-selected-info {
  display: none;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 8px 12px;
  background: #eff6ff;
  border: 1.5px solid #bfdbfe;
  border-radius: 9px;
  font-size: 12px;
  color: #1d4ed8;
  font-weight: 600;
}
.ac-selected-info.show { display: flex; }
.ac-clear {
  margin-left: auto;
  border: none; background: none;
  color: #94a3b8; cursor: pointer; font-size: 14px;
  padding: 0 2px;
  line-height: 1;
}
.ac-clear:hover { color: #ef4444; }
`;

// ─────────────────────────────────────────────────────────────────────────────
//  HTML — campo nome com autocomplete (substitui o <input> de nome no modal)
// ─────────────────────────────────────────────────────────────────────────────
const HTML_CAMPO_NOME = `
<div class="form-group">
  <label>Nome da liderança</label>
  <div class="ac-wrap">
    <input
      type="text"
      id="input-nome"
      placeholder="Digite o nome..."
      autocomplete="off"
    >
    <div class="ac-dropdown" id="ac-dropdown"></div>
  </div>
  <!-- Aparece quando uma pessoa existente é selecionada -->
  <div class="ac-selected-info" id="ac-selected-info">
    <span id="ac-selected-label"></span>
    <button class="ac-clear" onclick="limparSelecaoPessoa()" title="Usar outro nome">✕</button>
  </div>
</div>
`;

// ─────────────────────────────────────────────────────────────────────────────
//  JAVASCRIPT — cole dentro do <script> do liderancas.html
// ─────────────────────────────────────────────────────────────────────────────

// Normaliza texto (mesma lógica do backend)
function normalizarNome(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Estado do autocomplete
const acState = {
  pessoaId:    null,   // ID da pessoa selecionada (null = nova)
  pessoaNome:  null,   // nome da pessoa selecionada
  timer:       null,
  selectedIdx: -1,
};

function limparSelecaoPessoa() {
  acState.pessoaId   = null;
  acState.pessoaNome = null;
  document.getElementById('input-nome').value = '';
  document.getElementById('ac-selected-info').classList.remove('show');
  document.getElementById('ac-dropdown').classList.remove('open');
  document.getElementById('input-nome').focus();
}

function selecionarPessoa(pessoa) {
  acState.pessoaId   = pessoa.id;
  acState.pessoaNome = pessoa.nome;

  const input  = document.getElementById('input-nome');
  const info   = document.getElementById('ac-selected-info');
  const label  = document.getElementById('ac-selected-label');
  const drop   = document.getElementById('ac-dropdown');

  input.value = pessoa.nome;
  input.blur();

  const cidades = Array.isArray(pessoa.cidades) && pessoa.cidades.length > 0
    ? pessoa.cidades.join(', ')
    : 'sem vínculos ainda';

  label.textContent = `✔ Pessoa já cadastrada · ${cidades}`;
  info.classList.add('show');
  drop.classList.remove('open');
}

function renderizarDropdown(pessoas, termoBuscado) {
  const drop = document.getElementById('ac-dropdown');
  const norm = normalizarNome(termoBuscado);
  drop.innerHTML = '';
  acState.selectedIdx = -1;

  // Item "Criar nova pessoa"
  const itemNovo = document.createElement('div');
  itemNovo.className = 'ac-item';
  itemNovo.innerHTML = `
    <div class="ac-avatar">+</div>
    <div class="ac-info">
      <div class="ac-nome">"${termoBuscado}"</div>
      <div class="ac-cidades">Criar como nova liderança</div>
    </div>
    <span class="ac-badge-novo">Novo</span>
  `;
  itemNovo.addEventListener('click', () => {
    acState.pessoaId = null;
    document.getElementById('input-nome').value = termoBuscado;
    drop.classList.remove('open');
    document.getElementById('ac-selected-info').classList.remove('show');
  });
  drop.appendChild(itemNovo);

  // Itens de pessoas existentes
  pessoas.forEach(p => {
    const cidades = Array.isArray(p.cidades) && p.cidades.length > 0
      ? p.cidades.join(', ')
      : 'nenhuma cidade ainda';

    const item = document.createElement('div');
    item.className = 'ac-item';

    // Avatar: foto ou inicial
    const avatarHtml = p.foto
      ? `<div class="ac-avatar"><img src="${p.foto}" onerror="this.parentElement.textContent='${p.nome[0]}'"></div>`
      : `<div class="ac-avatar">${p.nome[0].toUpperCase()}</div>`;

    item.innerHTML = `
      ${avatarHtml}
      <div class="ac-info">
        <div class="ac-nome">${p.nome}</div>
        <div class="ac-cidades">📍 ${cidades}</div>
      </div>
      <span class="ac-badge-existente">Existente</span>
    `;
    item.addEventListener('click', () => selecionarPessoa(p));
    drop.appendChild(item);
  });

  drop.classList.add('open');
}

// Inicializa os listeners do campo de nome
function inicializarAutocompleteLideranca() {
  const input = document.getElementById('input-nome');
  if (!input) return;

  input.addEventListener('input', () => {
    const val = input.value.trim();

    // Limpa seleção se o usuário digitou algo diferente
    if (acState.pessoaId && normalizarNome(val) !== normalizarNome(acState.pessoaNome)) {
      acState.pessoaId   = null;
      acState.pessoaNome = null;
      document.getElementById('ac-selected-info').classList.remove('show');
    }

    clearTimeout(acState.timer);

    if (val.length < 2) {
      document.getElementById('ac-dropdown').classList.remove('open');
      return;
    }

    // Debounce de 300ms para não disparar a cada tecla
    acState.timer = setTimeout(async () => {
      try {
        const resp = await apiFetch(`/pessoas/buscar?q=${encodeURIComponent(val)}`);
        // apiFetch já lida com o token — adapte conforme sua implementação
        renderizarDropdown(resp, val);
      } catch (e) {
        console.warn('[autocomplete]', e);
      }
    }, 300);
  });

  // Navegação por teclado (↑ ↓ Enter Esc)
  input.addEventListener('keydown', e => {
    const drop  = document.getElementById('ac-dropdown');
    const items = drop.querySelectorAll('.ac-item');
    if (!drop.classList.contains('open') || !items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      acState.selectedIdx = Math.min(acState.selectedIdx + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      acState.selectedIdx = Math.max(acState.selectedIdx - 1, 0);
    } else if (e.key === 'Enter' && acState.selectedIdx >= 0) {
      e.preventDefault();
      items[acState.selectedIdx].click();
      return;
    } else if (e.key === 'Escape') {
      drop.classList.remove('open');
      return;
    }

    items.forEach((el, i) => el.classList.toggle('selected', i === acState.selectedIdx));
    if (acState.selectedIdx >= 0) items[acState.selectedIdx].scrollIntoView({ block: 'nearest' });
  });

  // Fecha dropdown ao clicar fora
  document.addEventListener('click', e => {
    if (!e.target.closest('.ac-wrap')) {
      document.getElementById('ac-dropdown').classList.remove('open');
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  ENVIO DO FORMULÁRIO — adapte o seu salvarLideranca()
// ─────────────────────────────────────────────────────────────────────────────
async function salvarLideranca(event) {
  event.preventDefault();
  const formData = new FormData(document.getElementById('form-lideranca'));

  // Se uma pessoa existente foi selecionada, envia pessoa_id em vez de nome
  if (acState.pessoaId) {
    formData.delete('nome');
    formData.set('pessoa_id', acState.pessoaId);
  }
  // Se não selecionou ninguém, deixa o nome no FormData → backend cria pessoa nova

  try {
    const res = await apiFetch('/liderancas', { method: 'POST', body: formData });
    console.log('[salvar]', res);
    // ... fechar modal, recarregar lista, etc.
  } catch (e) {
    console.error('[salvar]', e);
  }
}

// Chame inicializarAutocompleteLideranca() ao abrir o modal de cadastro:
// Ex: function abrirModalCadastro() { ... inicializarAutocompleteLideranca(); }
