/**
 * Captures the landing-page product screenshots from the LIVE app using the
 * demo fixtures created by seed-demo.ts. Writes over frontend/public/landing/.
 *
 * Run:  node scripts/shoot-landing.mjs <sunitaSubjectId>
 */
import puppeteer from 'puppeteer-core';

const FRONTEND = 'http://localhost:3000';
const API = 'http://localhost:3001';
const OUT = '/Users/nishant/bg_check/frontend/public/landing';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PASSWORD = 'assurio-demo';

const subjectId = process.argv[2];
if (!subjectId) {
  console.error('usage: node scripts/shoot-landing.mjs <subjectId>');
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--hide-scrollbars'],
});

async function loginAs(page, email) {
  await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle0' });
  const user = await page.evaluate(
    async (api, email, pw) => {
      const r = await fetch(`${api}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pw }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(d));
      return d.user;
    },
    API,
    email,
    PASSWORD,
  );
  await page.evaluate((u) => localStorage.setItem('user', JSON.stringify(u)), user);
}

async function shoot(page, path, out, { fullPage = false, settle = 2200 } = {}) {
  await page.goto(`${FRONTEND}${path}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, settle)); // fonts, SSE fill, transitions
  await page.screenshot({ path: `${OUT}/${out}`, fullPage });
  console.log(`captured ${out}`);
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  // Owner shots
  await loginAs(page, 'demo@assurio.test');
  await shoot(page, '/home', 'client-dashboard.png');
  await page.setViewport({ width: 1368, height: 900, deviceScaleFactor: 2 });
  await shoot(page, `/subject/${subjectId}`, 'candidate-report.png', { fullPage: true });

  // Candidate shot
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await loginAs(page, 'sunita+demo@assurio.test');
  await shoot(page, '/candidate', 'candidate-page.png');
} finally {
  await browser.close();
}
console.log('done');
