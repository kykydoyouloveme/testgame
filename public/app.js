const form = document.querySelector('#auth-form');
const tabs = [...document.querySelectorAll('.tab')];
const usernameField = document.querySelector('#username-field');
const verifyRow = document.querySelector('#verify-row');
const verifyHint = document.querySelector('#verify-hint');
const message = document.querySelector('#message');
const submitButton = document.querySelector('#submit-button');
const submitLabel = document.querySelector('#submit-label');
const loggedIn = document.querySelector('#logged-in');
let mode = 'register';

function setMessage(text = '', error = false) {
  message.textContent = text;
  message.classList.toggle('error', error);
}
function setMode(nextMode) {
  mode = nextMode;
  tabs.forEach(tab => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  const registering = mode === 'register';
  usernameField.classList.toggle('hidden', !registering);
  usernameField.querySelector('input').required = registering;
  verifyRow.classList.toggle('hidden', !registering);
  verifyHint.classList.toggle('hidden', !registering);
  document.querySelector('#step-label').textContent = registering ? '01 / NEW RECRUIT' : '02 / RETURNING PLAYER';
  document.querySelector('#form-title').innerHTML = registering ? 'Join the<br>battle.' : 'Back in<br>action.';
  document.querySelector('#form-subtitle').textContent = registering ? 'Create your account and claim your callsign.' : 'Sign in and get back to your squad.';
  document.querySelector('#password').autocomplete = registering ? 'new-password' : 'current-password';
  submitLabel.textContent = registering ? 'CREATE MY ACCOUNT' : 'LOG IN TO YOUR ACCOUNT';
  setMessage();
}
async function api(path, data) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'May nangyaring error.');
  return result;
}
function showWelcome(user) {
  form.classList.add('hidden');
  document.querySelector('.tabs').classList.add('hidden');
  document.querySelector('.heading').classList.add('hidden');
  document.querySelector('#auth-content').classList.add('hidden');
  loggedIn.classList.remove('hidden');
  document.querySelector('#welcome-name').textContent = user.username;
}
tabs.forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
document.querySelector('#send-code').addEventListener('click', async event => {
  const button = event.currentTarget;
  const email = document.querySelector('#email').value.trim();
  setMessage();
  if (!/^[a-z0-9._%+-]+@gmail\.com$/i.test(email)) return setMessage('Maglagay muna ng valid na @gmail.com address.', true);
  button.disabled = true;
  button.innerHTML = 'SENDING…';
  try {
    const result = await api('/api/auth/send-code', { email });
    setMessage(result.message);
    document.querySelector('#code').focus();
  } catch (error) { setMessage(error.message, true); }
  finally { button.disabled = false; button.innerHTML = 'SEND CODE <span>↗</span>'; }
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  setMessage();
  const data = Object.fromEntries(new FormData(form));
  submitButton.disabled = true;
  submitLabel.textContent = mode === 'register' ? 'CREATING ACCOUNT…' : 'LOGGING IN…';
  try {
    const result = mode === 'register'
      ? await api('/api/auth/register', { username: data.username, email: data.email, password: data.password, code: data.code })
      : await api('/api/auth/login', { email: data.email, password: data.password });
    localStorage.setItem('bg_token', result.token);
    showWelcome(result.user);
  } catch (error) { setMessage(error.message, true); }
  finally { submitButton.disabled = false; submitLabel.textContent = mode === 'register' ? 'CREATE MY ACCOUNT' : 'LOG IN TO YOUR ACCOUNT'; }
});
document.querySelector('.reveal').addEventListener('click', event => {
  const input = document.querySelector('#password');
  const showing = input.type === 'password';
  input.type = showing ? 'text' : 'password';
  event.currentTarget.textContent = showing ? 'HIDE' : 'SHOW';
});
document.querySelector('#logout').addEventListener('click', () => {
  localStorage.removeItem('bg_token');
  loggedIn.classList.add('hidden');
  document.querySelector('#auth-content').classList.remove('hidden');
  document.querySelector('.heading').classList.remove('hidden');
  document.querySelector('.tabs').classList.remove('hidden');
  form.classList.remove('hidden');
  setMode('register');
});
(async function restoreSession() {
  const token = localStorage.getItem('bg_token');
  if (!token) return;
  try {
    const response = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Expired session');
    const result = await response.json();
    showWelcome(result.user);
  } catch { localStorage.removeItem('bg_token'); }
})();
