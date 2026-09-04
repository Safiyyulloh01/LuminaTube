// Custom SVG Captcha matching UzLider style
function generateCaptcha() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let text = '';
  for (let i = 0; i < 5; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const colors = ['#d7b4ff', '#8fc7ff', '#f1f1f1', '#ffd24d', '#ff9a9a'];
  let textElements = '';
  const startX = 18;
  const stepX = 28;

  for (let i = 0; i < text.length; i++) {
    const x = startX + i * stepX + (Math.random() * 4 - 2);
    const y = 36 + (Math.random() * 8 - 4);
    const rot = Math.floor(Math.random() * 30 - 15);
    const color = colors[i % colors.length];
    const char = text[i];
    textElements += `<text x="${x}" y="${y}" font-size="${26 + Math.floor(Math.random() * 4)}" font-family="Georgia,'Times New Roman',serif" font-weight="700" fill="${color}" transform="rotate(${rot} ${x} ${y})">${char}</text>`;
  }

  // Add random circles/noise
  let noise = '';
  for (let i = 0; i < 25; i++) {
    const cx = Math.floor(Math.random() * 168);
    const cy = Math.floor(Math.random() * 56);
    const r = Math.random() > 0.6 ? 2 : 1;
    const op = (0.4 + Math.random() * 0.5).toFixed(2);
    noise += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" opacity="${op}"/>`;
  }

  // Wavy lines
  const lines = `
    <path d="M0 ${Math.floor(Math.random()*20)} Q 84 ${Math.floor(Math.random()*40)} 168 ${Math.floor(Math.random()*50)}" stroke="#ffd24d" stroke-width="1.4" fill="none" opacity="0.35"/>
    <path d="M0 ${Math.floor(Math.random()*35)} Q 84 ${Math.floor(Math.random()*50)} 168 ${Math.floor(Math.random()*55)}" stroke="#f1f1f1" stroke-width="1.4" fill="none" opacity="0.35"/>
  `;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="168" height="56" viewBox="0 0 168 56" role="img" aria-label="captcha"><rect width="168" height="56" rx="8" fill="#121212"/><rect width="168" height="56" rx="8" fill="none" stroke="#303030"/>${noise}${lines}${textElements}</svg>`;

  return { text, svg };
}

module.exports = { generateCaptcha };
