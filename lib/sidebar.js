// Alex Recruitment Agent — shared sidebar nav.
// Call renderSidebar(activeHref) after window.authReady resolves so currentProfile exists.
// Items with a `roles` array are hidden unless currentProfile.role is in that list.

const SIDEBAR_ITEMS = [
  { label: 'Dashboard', href: 'dashboard.html' },
  { label: 'New Recruitment Request', href: 'index.html', roles: ['department_manager', 'admin'] },
  { label: 'HR Review', href: 'hr-review.html', roles: ['hr', 'admin'] },
  { label: 'Advertisement', href: 'advertisement.html', roles: ['hr', 'admin'] },
  { label: 'CV Folder', href: 'cv-folder.html', roles: ['hr', 'admin'] },
  { label: 'Candidate Assessment', href: 'module-pending.html?name=Candidate+Assessment&phase=2' },
  { label: 'Candidate Pipeline', href: 'module-pending.html?name=Candidate+Pipeline&phase=3' },
  { label: 'Interview', href: 'module-pending.html?name=Interview&phase=4' },
  { label: 'Offer Letter', href: 'module-pending.html?name=Offer+Letter&phase=5' },
  { label: 'Hiring', href: 'module-pending.html?name=Hiring&phase=5' },
  { label: 'Onboarding', href: 'module-pending.html?name=Onboarding&phase=5' },
  { label: 'Reports', href: 'module-pending.html?name=Reports&phase=6' },
];

function renderSidebar(activeHref) {
  const root = document.getElementById('sidebar-root');
  if (!root) return;
  const profile = window.currentProfile;

  const items = SIDEBAR_ITEMS.filter((item) => !item.roles || (profile && item.roles.includes(profile.role)));

  root.innerHTML = `
    <div class="sidebar-head">
      <div class="sidebar-title">ATLAS Recruitment</div>
      ${profile ? `<div class="sidebar-user">${profile.full_name} · ${profile.role.replace('_', ' ')}</div>` : ''}
    </div>
    <nav class="sidebar-nav">
      ${items.map((item) => `<a href="${item.href}" class="${item.href.split('?')[0] === activeHref ? 'active' : ''}">${item.label}</a>`).join('')}
    </nav>
    <button class="btn-secondary sidebar-signout" id="sidebar-signout">Sign Out</button>
  `;

  document.getElementById('sidebar-signout').addEventListener('click', atlasSignOut);
}
