// Alex Recruitment Agent — shared per-company tile styling.
// Kept in the indigo/violet/blue family so it visually matches the dark indigo-accented
// sidebar, instead of clashing with unrelated brand colors (that's what the individual
// job-ad poster templates use — this is just for internal navigation tiles).
const COMPANY_STYLES = {
  'Silk Food Ceylon (Pvt) Ltd': { bg: '#eef2ff', border: '#4f46e5', text: '#3730a3', icon: '🌾' },
  'Silk Route Ventures (Pvt) Ltd': { bg: '#f5f3ff', border: '#7c3aed', text: '#5b21b6', icon: '🧵' },
  'Ancient Nutraceuticals (Pvt) Ltd': { bg: '#eff6ff', border: '#2563eb', text: '#1e40af', icon: '🌿' },
  'Unassigned': { bg: '#f1f5f9', border: '#64748b', text: '#334155', icon: '📋' },
};

function companyStyleFor(name) {
  return COMPANY_STYLES[name] || COMPANY_STYLES['Unassigned'];
}
