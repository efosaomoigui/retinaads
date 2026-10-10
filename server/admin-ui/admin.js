const byId = id => document.getElementById(id);
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && !url.endsWith('/login')) { window.location.assign('/admin/login'); throw new Error('Please sign in again.'); }
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
const login = byId('login-form');
if (login) login.addEventListener('submit', async event => {
  event.preventDefault();
  const button = login.querySelector('button');
  button.disabled = true;
  byId('login-message').textContent = '';
  try {
    await api('/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: byId('username').value, password: byId('password').value }) });
    byId('password').value = '';
    window.location.assign('/admin');
  } catch (error) { byId('login-message').textContent = error.message; byId('password').value = ''; }
  finally { button.disabled = false; }
});

if (byId('submissions')) {
  let category = 'all', page = 1, csrf = '', sequence = 0;
  const labels = { contact: 'Contact', about: 'Contact / About', demo: 'Demo', careers: 'Career', request: 'Request', website_entry: 'Website Entry' };
  const date = value => Number.isNaN(Date.parse(value)) ? String(value) : new Date(value).toLocaleString();
  function cell(row, value) { const td = document.createElement('td'); td.textContent = value; row.appendChild(td); return td; }
  async function details(id) {
    byId('admin-message').textContent = '';
    try {
      const record = await api(`/admin/api/submissions/${encodeURIComponent(id)}`);
      const list = byId('detail-fields'); list.replaceChildren();
      const metadata = { 'Submission ID': record.id, 'Received': date(record.receivedAt), 'Type': labels[record.form] || record.form, 'Status': record.status };
      const fields = [...Object.entries(metadata), ...Object.entries(record.fields).map(([key, value]) => [`Form field: ${key}`, value])];
      for (const [key, value] of fields) {
        const dt = document.createElement('dt'); dt.textContent = key.replace(/([a-z])([A-Z])/g, '$1 $2');
        const dd = document.createElement('dd'); dd.textContent = String(value);
        list.append(dt, dd);
      }
      const resume = byId('resume'); resume.hidden = !record.resume;
      if (record.resume) { resume.href = `/admin/api/submissions/${encodeURIComponent(id)}/resume`; resume.textContent = `Download CV (${record.resume.name})`; }
      byId('details').showModal();
    } catch (error) { byId('admin-message').textContent = error.message; }
  }
  async function load() {
    const request = ++sequence;
    byId('admin-message').textContent = '';
    byId('summary').textContent = 'Loading submissions…';
    try {
      const result = await api(`/admin/api/submissions?category=${category}&page=${page}`);
      if (request !== sequence) return;
      byId('submissions').replaceChildren();
      for (const item of result.items) {
        const row = document.createElement('tr');
        cell(row, date(item.receivedAt)); cell(row, item.fullName); cell(row, item.email); cell(row, labels[item.form] || item.form); cell(row, item.status);
        const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.textContent = 'View'; button.setAttribute('aria-label', `View submission from ${item.fullName}`);
        button.addEventListener('click', () => details(item.id)); cell(row, '').appendChild(button); byId('submissions').appendChild(row);
      }
      byId('summary').textContent = result.total ? `${result.total} submission${result.total === 1 ? '' : 's'}` : 'No submissions yet.';
      byId('page-number').textContent = `Page ${page}`;
      byId('previous').disabled = page <= 1;
      byId('next').disabled = page * result.pageSize >= result.total;
      byId('export').href = `/admin/api/export?category=${category}`;
    } catch (error) { if (request === sequence) { byId('summary').textContent = 'Unable to load submissions.'; byId('admin-message').textContent = error.message; } }
  }
  for (const button of document.querySelectorAll('[data-category]')) button.addEventListener('click', () => {
    category = button.dataset.category; page = 1;
    for (const tab of document.querySelectorAll('[data-category]')) tab.setAttribute('aria-pressed', String(tab === button));
    load();
  });
  byId('previous').addEventListener('click', () => { if (page > 1) { page--; load(); } });
  byId('next').addEventListener('click', () => { page++; load(); });
  byId('close-details').addEventListener('click', () => byId('details').close());
  byId('logout').addEventListener('click', async () => {
    try { await api('/admin/api/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrf } }); window.location.assign('/admin/login'); }
    catch (error) { byId('admin-message').textContent = error.message; }
  });
  api('/admin/api/session').then(session => { csrf = session.csrf; byId('admin-name').textContent = session.username; return load(); })
    .catch(error => { byId('admin-message').textContent = error.message; });
}
