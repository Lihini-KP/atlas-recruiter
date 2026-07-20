// Alex Recruitment Agent — renders a company's poster template + request details into a
// PNG. Requires html2canvas to already be loaded (CDN <script>) on the page.
// Returns a Blob, or null if the company has no template image yet.

async function generatePosterImage({ companyCode, designation, workLocation, employmentType, vacancies }) {
  const template = POSTER_TEMPLATES[companyCode];
  if (!template) return null;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = `${template.imageWidth}px`;
  container.style.height = `${template.imageHeight}px`;

  const bg = document.createElement('img');
  bg.src = template.image;
  bg.style.width = '100%';
  bg.style.height = '100%';
  bg.style.display = 'block';
  container.appendChild(bg);

  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.left = '6%';
  overlay.style.right = '6%';
  overlay.style.top = `${template.overlayTop}%`;
  overlay.style.height = `${template.overlayHeight}%`;
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.textAlign = 'center';
  overlay.style.fontFamily = "'Sora', Arial, sans-serif";
  overlay.style.color = template.textColor;
  overlay.innerHTML = `
    <div style="font-size:42px;font-weight:700;line-height:1.2">${designation}</div>
    <div style="font-size:22px;font-weight:600;margin-top:14px">${employmentType} · ${vacancies} ${vacancies > 1 ? 'Vacancies' : 'Vacancy'}</div>
    <div style="font-size:20px;margin-top:10px">${workLocation}</div>
  `;
  container.appendChild(overlay);

  document.body.appendChild(container);
  await new Promise((resolve) => (bg.complete ? resolve() : bg.addEventListener('load', resolve, { once: true })));

  const canvas = await html2canvas(container, { width: template.imageWidth, height: template.imageHeight, scale: 1 });
  document.body.removeChild(container);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
