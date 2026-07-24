// Alex Recruitment Agent — shared sidebar nav.
// Call renderSidebar(activeHref) after window.authReady resolves so currentProfile exists.
// Items with a `roles` array are hidden unless currentProfile.role is in that list.

const SIDEBAR_ITEMS = [
  { label: 'Dashboard', href: 'dashboard.html', icon: '📊' },
  { label: 'New Recruitment Request', href: 'index.html', icon: '📝', roles: ['department_manager', 'admin'] },
  { label: 'HR Review', href: 'hr-review.html', icon: '✅', roles: ['hr', 'admin'] },
  { label: 'Advertisement', href: 'advertisement.html', icon: '📣', roles: ['hr', 'admin'] },
  { label: 'CV Folder', href: 'cv-folder.html', icon: '📁', roles: ['hr', 'admin'] },
  { label: 'Candidate Assessment', href: 'candidate-assessment.html', icon: '🧾', roles: ['hr', 'admin'] },
  { label: 'Self Assessment', href: 'self-assessment-results.html', icon: '🗒️', roles: ['hr', 'admin'] },
  { label: 'Candidate Pipeline', href: 'candidate-pipeline.html', icon: '🚀', roles: ['hr', 'admin'] },
  { label: 'Interview', href: 'interview.html', icon: '🎤', roles: ['hr', 'admin'] },
  { label: 'Offer Letter', href: 'offer-letter.html', icon: '📄', roles: ['hr', 'admin'] },
  { label: 'Hiring', href: 'hiring.html', icon: '🤝', roles: ['hr', 'admin'] },
  { label: 'Onboarding', href: 'module-pending.html?name=Onboarding&phase=5', icon: '🚪' },
  { label: 'Reports', href: 'module-pending.html?name=Reports&phase=6', icon: '📈' },
];

function renderSidebar(activeHref) {
  const root = document.getElementById('sidebar-root');
  if (!root) return;
  const profile = window.currentProfile;

  const items = SIDEBAR_ITEMS.filter((item) => !item.roles || (profile && item.roles.includes(profile.role)));

  root.innerHTML = `
    <div class="sidebar-head">
      <div class="sidebar-title">✨ ATLAS Recruitment</div>
      ${profile ? `<div class="sidebar-user">${profile.full_name} · ${profile.role.replace('_', ' ')}</div>` : ''}
    </div>
    <nav class="sidebar-nav">
      ${items.map((item) => `<a href="${item.href}" class="${item.href.split('?')[0] === activeHref ? 'active' : ''}"><span class="sidebar-icon">${item.icon}</span>${item.label}</a>`).join('')}
    </nav>
    <div class="sidebar-foot">
      <button class="sidebar-signout" id="sidebar-signout">↪ Sign Out</button>
      <button class="theme-toggle" id="theme-toggle" title="Toggle light/dark"></button>
    </div>
  `;

  document.getElementById('sidebar-signout').addEventListener('click', atlasSignOut);

  const themeBtn = document.getElementById('theme-toggle');
  const setToggleIcon = () => {
    const isDark = document.documentElement.dataset.theme === 'dark';
    themeBtn.textContent = isDark ? '☀' : '🌙';
  };
  setToggleIcon();
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('atlas-theme', next);
    setToggleIcon();
  });
}
