// Alex Recruitment Agent — per-company poster templates.
// Each entry's `image` is the company's branded "We Are Hiring" template (a flattened
// design asset, not something we recompose from parts) — the designation/location get
// overlaid as text into the blank band the design already leaves for that purpose.
// `overlayTop`/`overlayHeight` are % of the image's height, tuned to that blank band.
//
// SRV and AN are null until their template images are provided — see module-pending
// fallback in advertisement.html.
const POSTER_TEMPLATES = {
  SFC: {
    companyName: 'Silk Food Ceylon (Pvt) Ltd',
    image: 'assets/templates/SFC.png',
    imageWidth: 992,
    imageHeight: 1586,
    overlayTop: 42,
    overlayHeight: 24,
    textColor: '#1a4d2e',
  },
  SRV: null,
  AN: null,
};
