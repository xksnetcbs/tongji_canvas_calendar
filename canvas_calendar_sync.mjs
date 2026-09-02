import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const configPath = path.resolve(root, process.env.CONFIG_PATH || 'config.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

const required = {
  'canvas.baseUrl': config.canvas?.baseUrl,
  'canvas.username': config.canvas?.username,
  'canvas.password': config.canvas?.password,
  'caldav.collectionUrl': config.caldav?.collectionUrl,
  'caldav.username': config.caldav?.username,
  'caldav.password': config.caldav?.password,
};
const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length) throw new Error(`Missing required configuration: ${missing.join(', ')}`);

const collectionUrl = config.caldav.collectionUrl.replace(/\/?$/, '/');
const statePath = path.join(root, 'browser-state.json');
const syncStatePath = path.join(root, 'sync-state.json');
const syncState = await fs.readFile(syncStatePath, 'utf8')
  .then(JSON.parse)
  .catch(() => ({ firstSeen: {}, completedSeen: {} }));
syncState.firstSeen ??= {};
syncState.completedSeen ??= {};

const basicAuth = 'Basic ' + Buffer.from(
  `${config.caldav.username}:${config.caldav.password}`,
).toString('base64');
const browser = await chromium.launch({ headless: true });
const storageState = await fs.access(statePath).then(() => statePath).catch(() => undefined);
const context = await browser.newContext({ storageState });

try {
  const page = await context.newPage();
  await page.goto(config.canvas.baseUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });

  const loginUrlPattern = new RegExp(config.canvas.loginUrlPattern || 'login', 'i');
  if (loginUrlPattern.test(page.url())) {
    await page.locator('input:visible').first().fill(config.canvas.username);
    await page.locator('input[type=password]:visible').first().fill(config.canvas.password);
    await page.locator('button[type=submit]:visible, input[type=submit]:visible, button')
      .first()
      .click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await context.storageState({ path: statePath });
  }

  const items = await page.evaluate(async () => {
    const output = [];
    for (const url of ['/api/v1/users/self/todo', '/api/v1/users/self/upcoming_events']) {
      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) output.push(...await response.json());
    }
    return output;
  });

  for (const item of items) {
    const assignment = item.assignment || item;
    if (!assignment.id || !assignment.course_id) continue;
    const details = await page.evaluate(async ({ courseId, assignmentId }) => {
      const response = await fetch(
        `/api/v1/courses/${courseId}/assignments/${assignmentId}?include[]=submission`,
        { credentials: 'include' },
      );
      return response.ok ? response.json() : null;
    }, {
      courseId: assignment.course_id,
      assignmentId: assignment.id,
    }).catch(() => null);
    if (details) item.assignment = { ...assignment, ...details };
  }

  await fetch(collectionUrl, {
    method: 'MKCALENDAR',
    headers: { Authorization: basicAuth },
  }).catch(() => {});

  for (const item of items.filter((entry) => entry.type === 'assignment' || entry.assignment)) {
    const assignment = item.assignment || item;
    const dueAt = assignment.due_at || item.due_at;
    if (!dueAt) continue;

    const key = String(assignment.id || item.id);
    const firstSeen = syncState.firstSeen[key] || new Date().toISOString();
    syncState.firstSeen[key] = firstSeen;
    const uidDomain = config.calendar?.uidDomain || 'canvas-sync.local';
    const uid = `canvas-${assignment.id || item.id}@${uidDomain}`;
    const escapeIcs = (value) => String(value || '')
      .replace(/[\\;,]/g, (character) => `\\${character}`)
      .replace(/\r?\n/g, '\\n');
    const submission = assignment.submission || item.submission || {};
    const completed = ['submitted', 'graded', 'completed'].includes(
      String(submission.workflow_state || '').toLowerCase(),
    ) || Boolean(submission.submitted_at) || Boolean(item.submitted);
    const completedAt = completed
      ? (syncState.completedSeen[key] || new Date().toISOString())
      : null;
    if (completed) syncState.completedSeen[key] = completedAt;

    const end = new Date(completed ? completedAt : dueAt);
    const formatIcsDate = (date) => new Date(date)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
    const hoursLeft = (end.getTime() - Date.now()) / 3600000;
    const urgent = !completed && hoursLeft >= 0 && hoursLeft < 4;
    const summary = (completed ? '[已完成] ' : urgent ? '[!!!] ' : '')
      + (assignment.name || item.title || 'Canvas 作业');
    const priority = completed ? '9' : urgent ? '1' : '5';
    const importance = completed ? '0' : urgent ? '2' : '1';
    const alarms = completed ? '' : [2, 1].map((hours) => (
      'BEGIN:VALARM\r\n'
      + 'ACTION:DISPLAY\r\n'
      + `DESCRIPTION:${escapeIcs(summary)}\r\n`
      + `TRIGGER:-PT${hours}H\r\n`
      + 'END:VALARM\r\n'
    )).join('');

    const ics = 'BEGIN:VCALENDAR\r\n'
      + 'VERSION:2.0\r\n'
      + `PRODID:${config.calendar?.productId || '-//Canvas CalDAV Sync//EN'}\r\n`
      + 'BEGIN:VEVENT\r\n'
      + `UID:${uid}\r\n`
      + `DTSTAMP:${formatIcsDate(new Date())}\r\n`
      + `DTSTART:${formatIcsDate(firstSeen)}\r\n`
      + `DTEND:${formatIcsDate(end)}\r\n`
      + `PRIORITY:${priority}\r\n`
      + `X-MICROSOFT-CDO-IMPORTANCE:${importance}\r\n`
      + `SUMMARY:${escapeIcs(summary)}\r\n`
      + `DESCRIPTION:${escapeIcs(assignment.description || item.description || '')}\r\n`
      + alarms
      + 'END:VEVENT\r\n'
      + 'END:VCALENDAR\r\n';

    const response = await fetch(collectionUrl + encodeURIComponent(uid) + '.ics', {
      method: 'PUT',
      headers: {
        Authorization: basicAuth,
        'Content-Type': 'text/calendar; charset=utf-8',
      },
      body: ics,
    });
    if (!response.ok) throw new Error(`CalDAV PUT failed for ${uid}: HTTP ${response.status}`);
  }

  await fs.writeFile(syncStatePath, JSON.stringify(syncState, null, 2));
} finally {
  await browser.close();
}
