// Alex Recruitment Agent — shared per-company tile styling.
// Border/text colors are kept in the indigo/violet/blue family so tiles visually match
// the dark indigo-accented sidebar. `logo` is the real company logo (cropped from each
// company's job-ad poster template) shown on the tile instead of a generic icon.
const COMPANY_STYLES = {
  'Silk Food Ceylon (Pvt) Ltd': { bg: '#eef2ff', border: '#4f46e5', text: '#3730a3', logo: 'assets/logos/SFC-logo.png' },
  'Silk Route Ventures (Pvt) Ltd': { bg: '#f5f3ff', border: '#7c3aed', text: '#5b21b6', logo: 'assets/logos/SRV-logo.png' },
  'Ancient Nutraceuticals (Pvt) Ltd': { bg: '#eff6ff', border: '#2563eb', text: '#1e40af', logo: 'assets/logos/AN-logo.png' },
  'Unassigned': { bg: '#f1f5f9', border: '#64748b', text: '#334155', logo: null },
};

function companyStyleFor(name) {
  return COMPANY_STYLES[name] || COMPANY_STYLES['Unassigned'];
}
