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
  el.style.justifyContent = zone.justify || 'center';
  el.style.textAlign = zone.align === 'left' ? 'left' : 'center';
  el.style.fontFamily = "'Sora', Arial, sans-serif";
  el.style.color = zone.color;
  el.innerHTML = html;
  container.appendChild(el);
}

function badgeHtml(text, color) {
  return `<span style="display:inline-block;background:${color};color:#fff;padding:10px 24px;border-radius:999px;font-size:21px;font-weight:600;white-space:nowrap">${text}</span>`;
}

function badgeRowHtml(items, color, justify) {
  return `<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:${justify}">${items.map((i) => badgeHtml(i, color)).join('')}</div>`;
}

function locationRowHtml(workLocation, color, justify) {
  return `
    <div style="display:flex;align-items:center;gap:10px;justify-content:${justify};margin-top:20px">
      <span style="font-size:26px;line-height:1">📍</span>
      <span style="font-size:23px;font-weight:600;color:${color}">${workLocation}</span>
    </div>
  `;
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
      ${badgeRowHtml([employmentType, vacancyLabel], template.body.color, 'flex-start')}
      ${locationRowHtml(workLocation, template.body.color, 'flex-start')}
    `);
  } else {
    addPosterZone(container, template.body, `
      <div style="font-size:44px;font-weight:700;line-height:1.2;margin-bottom:22px">${designation}</div>
      ${badgeRowHtml([employmentType, vacancyLabel], template.body.color, 'center')}
      ${locationRowHtml(workLocation, template.body.color, 'center')}
    `);
  }

  document.body.appendChild(container);
  await new Promise((resolve) => (bg.complete ? resolve() : bg.addEventListener('load', resolve, { once: true })));

  const canvas = await html2canvas(container, { width: template.imageWidth, height: template.imageHeight, scale: 1 });
  document.body.removeChild(container);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
