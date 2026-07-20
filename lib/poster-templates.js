// Alex Recruitment Agent — per-company poster templates.
// Each entry's `image` is the company's branded "We Are Hiring"/"We Are Looking For"
// template (a flattened design asset, not something we recompose from parts) — request
// details get overlaid as text into the blank zone(s) the design already leaves for that.
//
// `title` (optional): a zone meant specifically for the position name (e.g. SRV/AN's
// dark-green pill). When present, `body` holds the remaining details below it.
// `body`: the main text zone — for SFC (no title pill) this includes the designation too.
// All zone `top`/`height` are % of the image's height.
const POSTER_TEMPLATES = {
  SFC: {
    companyName: 'Silk Food Ceylon (Pvt) Ltd',
    image: 'assets/templates/SFC.png',
    imageWidth: 992,
    imageHeight: 1586,
    body: { top: 42, height: 24, color: '#1a4d2e', align: 'center' },
  },
  SRV: {
    companyName: 'Silk Route Ventures (Pvt) Ltd',
    image: 'assets/templates/SRV.jpg',
    imageWidth: 790,
    imageHeight: 1280,
    title: { top: 28, height: 7, color: '#ffffff' },
    body: { top: 36, height: 42, color: '#1a4d2e', align: 'left' },
  },
  AN: {
    companyName: 'Ancient Nutraceuticals (Pvt) Ltd',
    image: 'assets/templates/AN.jpg',
    imageWidth: 1066,
    imageHeight: 1280,
    title: { top: 31.5, height: 6, color: '#ffffff' },
    body: { top: 39, height: 40, color: '#1a4d2e', align: 'left' },
  },
};
