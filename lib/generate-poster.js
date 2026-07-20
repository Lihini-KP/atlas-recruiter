// Alex Recruitment Agent — renders a company's poster template + request details into a
// PNG. Requires html2canvas to already be loaded (CDN <script>) on the page.
// Returns a Blob, or null if the company has no template image yet.

function addPosterZone(container, zone, html) {
  if (!zone) return;
  const el = document.createElement('div');
  el.style.position = 'absolute';
  el.style.left = '8%';
  el.style.right = '8%';
  el.style.top = `${zone.top}%`;
  el.style.height = `${zone.height}%`;
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.alignItems = zone.align === 'left' ? 'flex-start' : 'center';
  el.style.justifyContent = 'center';
  el.style.textAlign = zone.align === 'left' ? 'left' : 'center';
  el.style.fontFamily = "'Sora', Arial, sans-serif";
  el.style.color = zone.color;
  el.innerHTML = html;
  container.appendChild(el);
}

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

  const vacancyLabel = `${vacancies} ${vacancies > 1 ? 'Vacancies' : 'Vacancy'}`;

  if (template.title) {
    addPosterZone(container, template.title, `<div style="font-size:30px;font-weight:700">${designation}</div>`);
    addPosterZone(container, template.body, `
      <div style="font-size:20px;font-weight:600">${employmentType} · ${vacancyLabel}</div>
      <div style="font-size:18px;margin-top:8px">${workLocation}</div>
    `);
  } else {
    addPosterZone(container, template.body, `
      <div style="font-size:42px;font-weight:700;line-height:1.2">${designation}</div>
      <div style="font-size:22px;font-weight:600;margin-top:14px">${employmentType} · ${vacancyLabel}</div>
      <div style="font-size:20px;margin-top:10px">${workLocation}</div>
    `);
  }

  document.body.appendChild(container);
  await new Promise((resolve) => (bg.complete ? resolve() : bg.addEventListener('load', resolve, { once: true })));

  const canvas = await html2canvas(container, { width: template.imageWidth, height: template.imageHeight, scale: 1 });
  document.body.removeChild(container);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
