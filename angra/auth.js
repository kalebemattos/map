window.API_URL = 'https://map-backend-j88s.onrender.com/api';

function iniciarLogin() {
  const btn = document.getElementById('login-btn');
  const error = document.getElementById('login-error');

  btn.onclick = async () => {
    error.style.display = 'none';

    const usuario = document.getElementById('login-user').value.trim();
    const senha = document.getElementById('login-pass').value.trim();

    if (!usuario || !senha) {
      error.textContent = 'Preencha usuário e senha';
      error.style.display = 'block';
      return;
    }

    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha })
      });

      const data = await res.json();
      if (!res.ok) throw new Error();

      localStorage.setItem('token', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));

      liberarInterface();

      if (typeof window.iniciarAplicacao === 'function') {
        window.iniciarAplicacao();
      }

    } catch {
      error.textContent = 'Usuário ou senha inválidos';
      error.style.display = 'block';
    }
  };
}

function liberarInterface() {
  const loginModal = document.getElementById('login-modal');
  const blocker = document.getElementById('blocker');
  const content = document.getElementById('content-wrapper');

  if (loginModal) loginModal.style.display = 'none';
  if (blocker) blocker.style.display = 'none';
  if (content) content.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');

  if (!token) {
    iniciarLogin();
    return;
  }

  try {
    const res = await fetch(`${API_URL}/validar-token`, {
      headers: {
        Authorization: 'Bearer ' + token
      }
    });

    if (!res.ok) throw new Error();

    liberarInterface();

    if (typeof window.iniciarAplicacao === 'function') {
      await window.iniciarAplicacao();
    }

  } catch {
    localStorage.clear();
    iniciarLogin();
  }
});