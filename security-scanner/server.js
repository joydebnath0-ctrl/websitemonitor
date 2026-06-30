require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const dns = require('dns').promises;
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
const tls = require('tls');
const multer = require('multer');

// Load environment variables from .env file if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    const key = parts[0].trim();
    let value = parts.slice(1).join('=').trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    process.env[key] = value;
  });
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const SQLITE_FILE = path.join(DATA_DIR, 'scans.sqlite');
const JSON_FALLBACK_FILE = path.join(DATA_DIR, 'scans.json');
const COMMON_PORTS = [21, 22, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995, 1433, 1521, 2049, 2082, 2083, 2086, 2087, 2375, 2376, 3000, 3306, 3389, 5000, 5432, 5601, 5900, 6379, 8000, 8080, 8081, 8443, 9200, 9300, 11211, 27017];
const SENSITIVE_PATHS = ['/robots.txt', '/.env', '/.git/config', '/backup.zip', '/backup.tar.gz', '/db.sql', '/admin/', '/wp-admin/', '/phpmyadmin/'];
const DKIM_SELECTORS = ['default', 'google', 'selector1', 'selector2', 'mail', 'smtp', 'k1'];
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 12;
const jobs = new Map();
const rateLimit = new Map();

const upload = multer({ limits: { fileSize: 32 * 1024 * 1024 } });
const vtQueue = [];

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const sqlite = initSqlite();

app.use(cors());
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function addHistory(scan) {
  if (sqlite) {
    sqlite.prepare(`
      INSERT INTO scans (id, domain, score, grade, summary, payload, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(scan.id, scan.domain, scan.score, scan.grade, scan.summary, JSON.stringify(scan), scan.createdAt, scan.completedAt);
    return;
  }
  const db = readJsonFallback();
  db.scans = [scan, ...(db.scans || [])].slice(0, 500);
  fs.writeFileSync(JSON_FALLBACK_FILE, JSON.stringify(db, null, 2));
}

function getHistory(domain) {
  if (sqlite) {
    return sqlite.prepare('SELECT payload FROM scans WHERE domain = ? ORDER BY completed_at DESC LIMIT 20')
      .all(domain)
      .map(row => JSON.parse(row.payload));
  }
  return (readJsonFallback().scans || []).filter(s => s.domain === domain).slice(0, 20);
}

function readJsonFallback() {
  try {
    const data = JSON.parse(fs.readFileSync(JSON_FALLBACK_FILE, 'utf8'));
    if (!data.scans) data.scans = [];
    if (!data.fileScans) data.fileScans = [];
    if (!data.urlScans) data.urlScans = [];
    if (!data.unifiedScans) data.unifiedScans = [];
    return data;
  } catch (_) {
    return { scans: [], fileScans: [], urlScans: [], unifiedScans: [] };
  }
}

function initSqlite() {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(SQLITE_FILE);
    db.exec(`
      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        score INTEGER NOT NULL,
        grade TEXT NOT NULL,
        summary TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_scans_domain_completed ON scans(domain, completed_at DESC);

      CREATE TABLE IF NOT EXISTS file_scans (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        status TEXT NOT NULL,
        score INTEGER NOT NULL,
        grade TEXT NOT NULL,
        summary TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_file_scans_sha256 ON file_scans(sha256);

      CREATE TABLE IF NOT EXISTS url_scans (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        status TEXT NOT NULL,
        score INTEGER NOT NULL,
        grade TEXT NOT NULL,
        summary TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_url_scans_url ON url_scans(url);

      CREATE TABLE IF NOT EXISTS unified_scans (
        id TEXT PRIMARY KEY,
        domain_scan_id TEXT,
        url_scan_id TEXT,
        file_scan_id TEXT,
        overall_score INTEGER NOT NULL,
        overall_grade TEXT NOT NULL,
        summary TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT NOT NULL
      );
    `);
    return db;
  } catch (_) {
    if (!fs.existsSync(JSON_FALLBACK_FILE)) fs.writeFileSync(JSON_FALLBACK_FILE, JSON.stringify({ scans: [], fileScans: [], urlScans: [], unifiedScans: [] }, null, 2));
    return null;
  }
}

function normalizeDomain(input) {
  const raw = String(input || '').trim().toLowerCase();
  const stripped = raw.replace(/^https?:\/\//, '').split('/')[0].replace(/\.$/, '');
  if (!/^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(stripped)) {
    throw new Error('Enter a valid public domain name, like example.com.');
  }
  return stripped;
}

function isPrivateAddress(address) {
  if (!address) return true;
  if (net.isIPv4(address)) {
    const parts = address.split('.').map(Number);
    return parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0;
  }
  if (net.isIPv6(address)) {
    const v = address.toLowerCase();
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80:');
  }
  return true;
}

async function validatePublicDomain(domain) {
  const records = await withTimeout(dns.lookup(domain, { all: true, verbatim: true }), 5000, 'Domain lookup timed out.');
  if (!records.length) throw new Error('Domain did not resolve.');
  const blocked = records.filter(r => isPrivateAddress(r.address));
  if (blocked.length) throw new Error('This scanner blocks local, private, loopback, and link-local targets.');
  return records;
}

function withTimeout(promise, timeoutMs, message = 'Operation timed out.') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function statusFromScore(score) {
  if (score >= 85) return 'pass';
  if (score >= 60) return 'warning';
  return 'fail';
}

function gradeFromScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function issue(severity, title, plain, fix, technical = {}) {
  return { severity, title, plain, fix, technical };
}

function requestUrl(url, timeout = 6000) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.request(url, {
      method: 'GET',
      timeout,
      headers: { 'User-Agent': 'InformationalSecurityScanner/1.0' },
      rejectUnauthorized: false
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 500000) req.destroy();
      });
      res.on('end', () => resolve({ ok: true, statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', err => resolve({ ok: false, error: err.message, headers: {}, body: '' }));
    req.end();
  });
}

function connectPort(domain, port, timeout = 1300) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: domain, port, timeout });
    let banner = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => {
      socket.write(port === 80 || port === 8080 || port === 8000 ? `HEAD / HTTP/1.0\r\nHost: ${domain}\r\n\r\n` : '\r\n');
      setTimeout(() => socket.end(), 350);
    });
    socket.on('data', chunk => { banner += chunk.slice(0, 160); });
    socket.on('timeout', () => socket.destroy());
    socket.on('error', () => resolve(null));
    socket.on('close', () => resolve({ port, service: serviceName(port), banner: banner.trim().split('\n')[0] || null }));
  });
}

function serviceName(port) {
  return {
    21: 'FTP', 22: 'SSH', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3', 143: 'IMAP', 443: 'HTTPS',
    465: 'SMTPS', 587: 'SMTP submission', 993: 'IMAPS', 995: 'POP3S', 1433: 'MSSQL', 1521: 'Oracle',
    2049: 'NFS', 2082: 'cPanel', 2083: 'cPanel SSL', 2086: 'WHM', 2087: 'WHM SSL', 2375: 'Docker API',
    2376: 'Docker TLS', 3000: 'Node/dev app', 3306: 'MySQL', 3389: 'RDP', 5000: 'Dev app',
    5432: 'PostgreSQL', 5601: 'Kibana', 5900: 'VNC', 6379: 'Redis', 8000: 'HTTP alt', 8080: 'HTTP proxy',
    8081: 'HTTP alt', 8443: 'HTTPS alt', 9200: 'Elasticsearch', 9300: 'Elasticsearch transport',
    11211: 'Memcached', 27017: 'MongoDB'
  }[port] || 'TCP';
}

async function scanTls(domain) {
  const issues = [];
  const details = {};
  await new Promise(resolve => {
    const socket = tls.connect({ host: domain, servername: domain, port: 443, timeout: 6000, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate(true);
      details.authorized = socket.authorized;
      details.authorizationError = socket.authorizationError || null;
      details.protocol = socket.getProtocol();
      details.cipher = socket.getCipher();
      details.certificate = cert && cert.subject ? {
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        fingerprint256: cert.fingerprint256
      } : null;
      socket.end();
      resolve();
    });
    socket.on('timeout', () => { socket.destroy(); resolve(); });
    socket.on('error', err => { details.error = err.message; resolve(); });
  });
  if (details.error) issues.push(issue('high', 'HTTPS connection could not be checked', 'Visitors may not be able to establish a secure connection to your site.', 'Confirm that HTTPS is enabled on port 443 and the certificate chain is valid.', details));
  if (details.authorized === false) issues.push(issue('critical', 'Certificate is not trusted', 'Browsers may warn visitors that the site is unsafe.', 'Install a valid certificate from a trusted certificate authority and include the full chain.', { authorizationError: details.authorizationError }));
  if (details.certificate && details.certificate.validTo) {
    const days = Math.ceil((new Date(details.certificate.validTo) - Date.now()) / 86400000);
    details.daysUntilExpiry = days;
    if (days < 0) issues.push(issue('critical', 'Certificate has expired', 'Visitors may see browser warnings and leave the site.', 'Renew the TLS certificate immediately.', { daysUntilExpiry: days }));
    else if (days < 30) issues.push(issue('medium', 'Certificate expires soon', 'Your secure connection may break soon if the certificate is not renewed.', 'Renew or automate certificate renewal before expiry.', { daysUntilExpiry: days }));
  }
  if (details.protocol && ['TLSv1', 'TLSv1.1'].includes(details.protocol)) {
    issues.push(issue('high', 'Old TLS protocol is in use', 'Older encryption protocols are easier to attack and are blocked by many modern clients.', 'Disable TLS 1.0/1.1 and allow TLS 1.2 or TLS 1.3 only.', { protocol: details.protocol }));
  }
  const score = Math.max(20, 100 - issues.reduce((sum, i) => sum + severityWeight(i.severity), 0));
  return category('ssl', 'SSL/TLS', score, issues, details, 'Your encrypted connection settings were reviewed.');
}

async function scanHeaders(domain) {
  const res = await requestUrl(`https://${domain}/`);
  const headers = lowerHeaders(res.headers || {});
  const required = [
    ['strict-transport-security', 'HSTS', 'Your site does not tell browsers to always use secure connections.', 'Add Strict-Transport-Security with a long max-age after confirming HTTPS works everywhere.'],
    ['content-security-policy', 'Content Security Policy', 'Your site does not clearly limit which scripts and content can run.', 'Add a Content-Security-Policy tailored to trusted sources.'],
    ['x-frame-options', 'Clickjacking protection', 'Other sites may be able to embed your pages in invisible frames.', 'Set X-Frame-Options: DENY or SAMEORIGIN, or use CSP frame-ancestors.'],
    ['x-content-type-options', 'Content sniffing protection', 'Browsers may guess file types in a way attackers can abuse.', 'Set X-Content-Type-Options: nosniff.'],
    ['referrer-policy', 'Referrer privacy', 'Visitors may leak full page URLs when clicking links to other sites.', 'Set Referrer-Policy: strict-origin-when-cross-origin or stricter.'],
    ['permissions-policy', 'Browser feature limits', 'Pages do not explicitly restrict powerful browser features.', 'Set Permissions-Policy for camera, microphone, geolocation, payment, and other sensitive features.']
  ];
  const issues = [];
  required.forEach(([key, title, plain, fix]) => {
    if (!headers[key]) issues.push(issue(key === 'strict-transport-security' ? 'high' : 'medium', `Missing ${title}`, plain, fix));
  });
  if (headers['strict-transport-security'] && !/max-age=(\d+)/i.test(headers['strict-transport-security'])) {
    issues.push(issue('medium', 'HSTS is incomplete', 'The secure-connection rule is present but may not be strong enough.', 'Use a valid max-age value, and consider includeSubDomains after testing.'));
  }
  const score = Math.max(10, 100 - issues.reduce((sum, i) => sum + severityWeight(i.severity), 0));
  return category('headers', 'Security Headers', score, issues, { statusCode: res.statusCode, headers }, 'Your browser-facing safety headers were reviewed.');
}

async function scanDns(domain) {
  const details = { spf: [], dmarc: [], dkim: [], caa: [], zoneTransfer: [] };
  const issues = [];
  try {
    const txt = await withTimeout(dns.resolveTxt(domain), 4000);
    details.spf = txt.map(r => r.join('')).filter(v => /^v=spf1/i.test(v));
  } catch (_) {}
  try {
    const txt = await withTimeout(dns.resolveTxt(`_dmarc.${domain}`), 4000);
    details.dmarc = txt.map(r => r.join('')).filter(v => /^v=dmarc1/i.test(v));
  } catch (_) {}
  for (const selector of DKIM_SELECTORS) {
    try {
      const txt = await withTimeout(dns.resolveTxt(`${selector}._domainkey.${domain}`), 2500);
      const found = txt.map(r => r.join('')).find(v => /v=dkim1|k=rsa|p=/i.test(v));
      if (found) details.dkim.push({ selector, record: found.slice(0, 160) });
    } catch (_) {}
  }
  try { details.caa = await withTimeout(dns.resolveCaa(domain), 4000); } catch (_) {}
  let nsRecords = [];
  try { nsRecords = await withTimeout(dns.resolveNs(domain), 4000); } catch (_) {}
  await Promise.all(nsRecords.slice(0, 4).map(ns => new Promise(resolve => {
    const child = require('child_process').execFile('nslookup', ['-type=AXFR', domain, ns], { timeout: 3000 }, (err, stdout) => {
      if (!err && stdout && /internet address|canonical name|text =|nameserver|mail exchanger/i.test(stdout) && !/failed|refused|not implemented|can't list|query refused/i.test(stdout)) {
        details.zoneTransfer.push({ nameserver: ns, possible: true });
      }
      resolve();
    });
    child.on('error', resolve);
  })));
  if (!details.spf.length) issues.push(issue('medium', 'SPF record missing', 'Email providers have less proof that mail from your domain is legitimate.', 'Publish an SPF TXT record that lists approved mail senders.'));
  if (!details.dmarc.length) issues.push(issue('high', 'DMARC record missing', 'Attackers can more easily spoof email that appears to come from your domain.', 'Publish a DMARC record, starting with p=none for monitoring and moving toward quarantine or reject.'));
  if (!details.dkim.length) issues.push(issue('low', 'DKIM not found with common selectors', 'Signed email helps recipients trust that messages were not altered.', 'Enable DKIM in your email provider. If you use a custom selector, document it for manual verification.'));
  if (!details.caa.length) issues.push(issue('low', 'CAA records missing', 'Any certificate authority may be able to issue certificates for your domain.', 'Add CAA records limiting certificate issuance to your chosen provider.'));
  if (details.zoneTransfer.length) issues.push(issue('critical', 'DNS zone transfer may be open', 'A nameserver may reveal a full map of your DNS records.', 'Disable AXFR zone transfers except to trusted secondary nameservers.', details.zoneTransfer));
  const score = Math.max(10, 100 - issues.reduce((sum, i) => sum + severityWeight(i.severity), 0));
  return category('dns', 'DNS & Email', score, issues, details, 'Your DNS and email anti-spoofing records were reviewed.');
}

async function scanPorts(domain) {
  const results = (await Promise.all(COMMON_PORTS.map(port => connectPort(domain, port)))).filter(Boolean);
  const issues = [];
  const risky = results.filter(r => [21, 23, 2375, 3306, 3389, 5432, 5900, 6379, 9200, 11211, 27017].includes(r.port));
  risky.forEach(r => issues.push(issue(r.port === 2375 ? 'critical' : 'high', `${r.service} appears publicly reachable`, `A sensitive service is reachable from the internet on port ${r.port}.`, 'Restrict this port with a firewall, VPN, allowlist, or private network exposure only.', r)));
  const score = Math.max(10, 100 - risky.length * 18 - Math.max(0, results.length - 4) * 4);
  return category('ports', 'Open Ports', score, issues, { openPorts: results, scannedPorts: COMMON_PORTS }, 'Common public ports were checked with simple connection attempts only.');
}

async function scanFingerprint(domain) {
  const res = await requestUrl(`https://${domain}/`);
  const headers = lowerHeaders(res.headers || {});
  const body = res.body || '';
  const findings = [];
  const issues = [];
  if (headers.server) findings.push({ name: 'Server', version: headers.server, source: 'server header' });
  const generator = body.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
  if (generator) findings.push({ name: 'Generator', version: generator[1], source: 'meta generator' });
  const libs = [
    ['jQuery', /jquery[-.]([0-9.]+)(?:\.min)?\.js/i],
    ['React', /react@([0-9.]+)|react[-.]([0-9.]+)(?:\.min)?\.js/i],
    ['Vue', /vue@([0-9.]+)|vue[-.]([0-9.]+)(?:\.min)?\.js/i],
    ['Angular', /angular(?:\.min)?\.js\?ver=([0-9.]+)|angular[-.]([0-9.]+)(?:\.min)?\.js/i],
    ['Bootstrap', /bootstrap[-.]([0-9.]+)(?:\.min)?\.(?:js|css)/i]
  ];
  libs.forEach(([name, rx]) => {
    const match = body.match(rx);
    if (match) findings.push({ name, version: match[1] || match[2] || 'detected', source: 'page assets' });
  });
  if (/wp-content|wp-includes/i.test(body)) findings.push({ name: 'WordPress', version: 'detected', source: 'page paths' });
  if (/jquery[-.]1\.|jquery[-.]2\./i.test(body)) {
    issues.push(issue('high', 'Old jQuery version detected', 'An older JavaScript library may contain known security bugs.', 'Upgrade jQuery and test affected UI behavior.', { evidence: 'jQuery 1.x/2.x pattern' }));
  }
  const cves = await lookupNvd(findings);
  cves.forEach(cve => issues.push(issue(cve.cvss >= 9 ? 'critical' : 'high', `Possible known vulnerability: ${cve.id}`, 'One detected technology may match a public vulnerability listing.', 'Confirm the exact product/version and patch or mitigate if affected.', cve)));
  const score = Math.max(10, 100 - issues.reduce((sum, i) => sum + severityWeight(i.severity), 0));
  return category('cves', 'Software & CVEs', score, issues, { findings, nvd: cves }, 'Visible software clues were fingerprinted and optionally checked against NVD.');
}

async function lookupNvd(findings) {
  if (!process.env.NVD_API_KEY || typeof fetch !== 'function') return [];
  const results = [];
  for (const finding of findings.slice(0, 3)) {
    const keyword = encodeURIComponent(`${finding.name} ${finding.version}`.slice(0, 80));
    try {
      const res = await fetch(`https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${keyword}&pubStartDate=2023-01-01T00:00:00.000&resultsPerPage=2`, {
        headers: { apiKey: process.env.NVD_API_KEY }
      });
      if (!res.ok) continue;
      const data = await res.json();
      (data.vulnerabilities || []).forEach(v => {
        const metrics = v.cve.metrics || {};
        const cvss = metrics.cvssMetricV31?.[0]?.cvssData?.baseScore || metrics.cvssMetricV30?.[0]?.cvssData?.baseScore || metrics.cvssMetricV2?.[0]?.cvssData?.baseScore || 0;
        results.push({ id: v.cve.id, cvss, summary: (v.cve.descriptions || [])[0]?.value || '', matched: finding });
      });
    } catch (_) {}
  }
  return results.slice(0, 6);
}

async function scanBlocklists(domain) {
  const issues = [];
  const details = { googleSafeBrowsing: 'not configured', virusTotal: 'not configured' };
  if (process.env.GOOGLE_SAFE_BROWSING_API_KEY && typeof fetch === 'function') {
    try {
      const body = {
        client: { clientId: 'website-security-scanner', clientVersion: '1.0.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url: `https://${domain}/` }]
        }
      };
      const res = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${process.env.GOOGLE_SAFE_BROWSING_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      details.googleSafeBrowsing = data;
      if (data.matches?.length) issues.push(issue('critical', 'Google Safe Browsing flag found', 'Browsers may warn visitors that the site is dangerous.', 'Investigate compromise, remove malicious content, and request review after cleanup.', data.matches));
    } catch (err) { details.googleSafeBrowsing = { error: err.message }; }
  }
  if (process.env.VIRUSTOTAL_API_KEY && typeof fetch === 'function') {
    try {
      const res = await fetch(`https://www.virustotal.com/api/v3/domains/${domain}`, { headers: { 'x-apikey': process.env.VIRUSTOTAL_API_KEY } });
      const data = await res.json();
      details.virusTotal = data?.data?.attributes?.last_analysis_stats || data;
      if (details.virusTotal.malicious > 0 || details.virusTotal.suspicious > 0) {
        issues.push(issue('critical', 'VirusTotal detections found', 'Threat-intelligence engines have reported this domain as malicious or suspicious.', 'Review the detections, clean any compromise, and work through vendor reclassification.', details.virusTotal));
      }
    } catch (err) { details.virusTotal = { error: err.message }; }
  }
  const score = issues.length ? 20 : 92;
  return category('blocklist', 'Blocklist Checks', score, issues, details, 'Public threat-intelligence checks were run when API keys were available.');
}

async function scanExposure(domain) {
  const checks = await Promise.all(SENSITIVE_PATHS.map(async p => {
    const res = await requestUrl(`https://${domain}${p}`, 4500);
    return { path: p, statusCode: res.statusCode || null, accessible: !!res.statusCode && res.statusCode < 400, sample: (res.body || '').slice(0, 120) };
  }));
  const issues = [];
  checks.filter(c => c.accessible && c.path !== '/robots.txt').forEach(c => {
    const severity = c.path.includes('.env') || c.path.includes('.git') || c.path.includes('.sql') ? 'critical' : 'medium';
    issues.push(issue(severity, `${c.path} appears accessible`, 'A file or admin area that is often sensitive responded publicly.', 'Remove the file, block direct web access, and rotate any exposed secrets if needed.', c));
  });
  const robots = checks.find(c => c.path === '/robots.txt');
  if (robots?.accessible && /admin|backup|private|secret/i.test(robots.sample)) {
    issues.push(issue('low', 'robots.txt hints at sensitive paths', 'The robots file may reveal locations attackers will try first.', 'Keep robots.txt minimal and protect sensitive paths with authentication, not obscurity.', robots));
  }
  const score = Math.max(10, 100 - issues.reduce((sum, i) => sum + severityWeight(i.severity), 0));
  return category('exposure', 'Exposed Files', score, issues, { checks }, 'A short list of commonly leaked paths was checked without crawling or brute force.');
}

function lowerHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(', ') : String(v)]));
}

function severityWeight(severity) {
  return { critical: 35, high: 24, medium: 14, low: 7 }[severity] || 5;
}

function category(id, name, score, issues, technicalDetails, summary) {
  return { id, name, score: Math.round(score), status: statusFromScore(score), issues, technicalDetails, summary };
}

function aggregate(categories) {
  const score = Math.round(categories.reduce((sum, c) => sum + c.score, 0) / categories.length);
  const issues = categories.flatMap(c => c.issues.map(i => ({ ...i, category: c.name })));
  const critical = issues.filter(i => i.severity === 'critical').length;
  const high = issues.filter(i => i.severity === 'high').length;
  const summary = critical
    ? `Your site has ${critical} critical issue${critical === 1 ? '' : 's'} that need immediate attention.`
    : high
      ? `Your site has ${high} high-priority issue${high === 1 ? '' : 's'} to fix soon.`
      : issues.length
        ? `Your site has ${issues.length} improvement${issues.length === 1 ? '' : 's'} to reduce security risk.`
        : 'Your site looks healthy across the checks this scanner can safely run.';
  return { score, grade: gradeFromScore(score), summary, issues };
}

function setJob(job, patch) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
}

async function runJob(job) {
  const steps = [
    ['ssl', scanTls], ['headers', scanHeaders], ['dns', scanDns], ['ports', scanPorts],
    ['cves', scanFingerprint], ['blocklist', scanBlocklists], ['exposure', scanExposure]
  ];
  try {
    await validatePublicDomain(job.domain);
    const categories = [];
    for (let index = 0; index < steps.length; index += 1) {
      const [key, fn] = steps[index];
      setJob(job, { status: 'running', activeStep: key, progress: Math.round((index / steps.length) * 100) });
      try {
        categories.push(await fn(job.domain));
      } catch (err) {
        categories.push(category(key, key, 45, [issue('medium', `${key} check could not complete`, 'This part of the scan did not finish, so the result is incomplete.', 'Retry later or check server network/DNS access.', { error: err.message })], { error: err.message }, 'This check did not complete.'));
      }
      setJob(job, { categories, progress: Math.round(((index + 1) / steps.length) * 100) });
    }
    const totals = aggregate(categories);
    const completed = { ...job, status: 'complete', progress: 100, activeStep: null, categories, ...totals, completedAt: new Date().toISOString() };
    setJob(job, completed);
    addHistory({
      id: job.id,
      domain: job.domain,
      score: job.score,
      grade: job.grade,
      summary: job.summary,
      categories: job.categories.map(c => ({ id: c.id, name: c.name, score: c.score, status: c.status, issueCount: c.issues.length })),
      issues: job.issues,
      createdAt: job.createdAt,
      completedAt: job.completedAt
    });
  } catch (err) {
    setJob(job, { status: 'failed', error: err.message, progress: 100 });
  }
}

function requireRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'local';
  const now = Date.now();
  const bucket = (rateLimit.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_MAX) return res.status(429).json({ error: 'Too many scan requests. Please wait a minute and try again.' });
  bucket.push(now);
  rateLimit.set(ip, bucket);
  next();
}

// Database and queue helper functions
function saveFileScanToDb(scan) {
  if (sqlite) {
    sqlite.prepare(`
      INSERT OR REPLACE INTO file_scans (id, filename, file_size, sha256, status, score, grade, summary, payload, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(scan.id, scan.filename, scan.fileSize, scan.sha256, scan.status, scan.score, scan.grade, scan.summary, JSON.stringify(scan), scan.createdAt, scan.completedAt || '');
    return;
  }
  const db = readJsonFallback();
  db.fileScans = [scan, ...(db.fileScans || []).filter(s => s.id !== scan.id)].slice(0, 500);
  fs.writeFileSync(JSON_FALLBACK_FILE, JSON.stringify(db, null, 2));
}

function getFileScanFromDb(id) {
  if (sqlite) {
    const row = sqlite.prepare('SELECT payload FROM file_scans WHERE id = ?').get(id);
    return row ? JSON.parse(row.payload) : null;
  }
  return (readJsonFallback().fileScans || []).find(s => s.id === id);
}

function getFileScanByHash(sha256) {
  if (sqlite) {
    const row = sqlite.prepare('SELECT payload FROM file_scans WHERE sha256 = ? AND status = "complete" ORDER BY completed_at DESC LIMIT 1').get(sha256);
    return row ? JSON.parse(row.payload) : null;
  }
  return (readJsonFallback().fileScans || []).find(s => s.sha256 === sha256 && s.status === 'complete');
}

function saveUrlScanToDb(scan) {
  if (sqlite) {
    sqlite.prepare(`
      INSERT OR REPLACE INTO url_scans (id, url, status, score, grade, summary, payload, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(scan.id, scan.url, scan.status, scan.score, scan.grade, scan.summary, JSON.stringify(scan), scan.createdAt, scan.completedAt || '');
    return;
  }
  const db = readJsonFallback();
  db.urlScans = [scan, ...(db.urlScans || []).filter(s => s.id !== scan.id)].slice(0, 500);
  fs.writeFileSync(JSON_FALLBACK_FILE, JSON.stringify(db, null, 2));
}

function getUrlScanFromDb(id) {
  if (sqlite) {
    const row = sqlite.prepare('SELECT payload FROM url_scans WHERE id = ?').get(id);
    return row ? JSON.parse(row.payload) : null;
  }
  return (readJsonFallback().urlScans || []).find(s => s.id === id);
}

function saveUnifiedScanToDb(scan) {
  if (sqlite) {
    sqlite.prepare(`
      INSERT OR REPLACE INTO unified_scans (id, domain_scan_id, url_scan_id, file_scan_id, overall_score, overall_grade, summary, payload, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(scan.id, scan.domainScanId, scan.urlScanId, scan.fileScanId, scan.overallScore, scan.overallGrade, scan.summary, JSON.stringify(scan), scan.createdAt, scan.completedAt || '');
    return;
  }
  const db = readJsonFallback();
  db.unifiedScans = [scan, ...(db.unifiedScans || []).filter(s => s.id !== scan.id)].slice(0, 500);
  fs.writeFileSync(JSON_FALLBACK_FILE, JSON.stringify(db, null, 2));
}

function getUnifiedScanFromDb(id) {
  if (sqlite) {
    const row = sqlite.prepare('SELECT payload FROM unified_scans WHERE id = ?').get(id);
    return row ? JSON.parse(row.payload) : null;
  }
  return (readJsonFallback().unifiedScans || []).find(s => s.id === id);
}

function updateFileScanStatus(id, status, summary) {
  const scan = jobs.get(id);
  if (scan) {
    scan.status = status;
    scan.summary = summary;
    scan.updatedAt = new Date().toISOString();
    saveFileScanToDb(scan);
  }
}

function completeFileScan(id, stats, results, fileMeta) {
  const scan = jobs.get(id);
  if (scan) {
    scan.status = 'complete';
    scan.stats = stats;
    scan.results = results;
    scan.metadata = fileMeta;
    
    // Calculate score
    let score = 100;
    if (stats) {
      score -= (stats.malicious || 0) * 8;
      score -= (stats.suspicious || 0) * 4;
      if (score < 20) score = 20;
    }
    scan.score = score;
    scan.grade = gradeFromScore(score);
    
    // Summary verdict
    const maliciousCount = stats?.malicious || 0;
    if (maliciousCount > 3) {
      scan.summary = `Malicious file - flagged by ${maliciousCount} antivirus engines`;
    } else if (maliciousCount > 0) {
      scan.summary = `Suspicious file - flagged by ${maliciousCount} antivirus engines`;
    } else {
      scan.summary = `Clean file - no security vendors flagged this file`;
    }
    
    scan.completedAt = new Date().toISOString();
    scan.updatedAt = scan.completedAt;
    saveFileScanToDb(scan);
  }
}

function updateUrlScanStatus(id, status, summary) {
  const scan = jobs.get(id);
  if (scan) {
    scan.status = status;
    scan.summary = summary;
    scan.updatedAt = new Date().toISOString();
    saveUrlScanToDb(scan);
  }
}

function completeUrlScan(id, stats, results, safeBrowsing) {
  const scan = jobs.get(id);
  if (scan) {
    scan.status = 'complete';
    scan.stats = stats;
    scan.results = results;
    scan.safeBrowsing = safeBrowsing;
    
    // Calculate score
    let score = 100;
    if (stats) {
      score -= (stats.malicious || 0) * 10;
      score -= (stats.suspicious || 0) * 5;
    }
    if (safeBrowsing && safeBrowsing.matches && safeBrowsing.matches.length > 0) {
      score -= 50;
    }
    if (score < 20) score = 20;
    
    scan.score = score;
    scan.grade = gradeFromScore(score);
    
    // Summary verdict
    const maliciousCount = (stats?.malicious || 0) + (safeBrowsing?.matches?.length ? 1 : 0);
    if (maliciousCount > 3) {
      scan.summary = `Malicious URL - high threat detection`;
    } else if (maliciousCount > 0) {
      scan.summary = `Suspicious URL - flagged by security vendors`;
    } else {
      scan.summary = `Clean URL - no safety issues detected`;
    }
    
    scan.completedAt = new Date().toISOString();
    scan.updatedAt = scan.completedAt;
    saveUrlScanToDb(scan);
  }
}

function failVtJob(job, errorMsg) {
  const scan = jobs.get(job.scanId);
  if (scan) {
    scan.status = 'failed';
    scan.error = errorMsg;
    scan.completedAt = new Date().toISOString();
    scan.updatedAt = scan.completedAt;
    if (job.type && job.type.startsWith('file')) {
      saveFileScanToDb(scan);
    } else {
      saveUrlScanToDb(scan);
    }
  }
}

// Background queue worker functions
async function processFileUploadJob(job) {
  const formData = new FormData();
  const blob = new Blob([job.fileBuffer]);
  formData.append('file', blob, job.filename);

  const res = await fetch('https://www.virustotal.com/api/v3/files', {
    method: 'POST',
    headers: { 'x-apikey': process.env.VIRUSTOTAL_API_KEY },
    body: formData
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`VirusTotal upload failed: ${res.statusText} - ${errText}`);
  }

  const data = await res.json();
  const analysisId = data.data.id;

  job.type = 'file_poll';
  job.analysisId = analysisId;
  job.attempts = 0;
  vtQueue.push(job);
  updateFileScanStatus(job.scanId, 'scanning', 'File uploaded. Running antivirus scans...');
}

async function processFilePollJob(job) {
  const res = await fetch(`https://www.virustotal.com/api/v3/analyses/${job.analysisId}`, {
    headers: { 'x-apikey': process.env.VIRUSTOTAL_API_KEY }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`VirusTotal analysis poll failed: ${res.statusText} - ${errText}`);
  }

  const data = await res.json();
  const status = data.data.attributes.status;

  if (status === 'completed') {
    const stats = data.data.attributes.stats;
    const results = data.data.attributes.results;
    
    // Get file metadata using hash
    let fileMeta = {};
    try {
      const fileHash = data.meta.file_info.sha256;
      const fileRes = await fetch(`https://www.virustotal.com/api/v3/files/${fileHash}`, {
        headers: { 'x-apikey': process.env.VIRUSTOTAL_API_KEY }
      });
      if (fileRes.ok) {
        const fileData = await fileRes.json();
        fileMeta = fileData.data.attributes;
      }
    } catch (_) {}

    completeFileScan(job.scanId, stats, results, fileMeta);
  } else {
    job.attempts = (job.attempts || 0) + 1;
    if (job.attempts > 24) { // 6 minutes timeout
      throw new Error('VirusTotal scan timed out.');
    }
    vtQueue.push(job);
  }
}

async function processUrlSubmitJob(job) {
  const params = new URLSearchParams();
  params.append('url', job.url);

  const res = await fetch('https://www.virustotal.com/api/v3/urls', {
    method: 'POST',
    headers: {
      'x-apikey': process.env.VIRUSTOTAL_API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`VirusTotal URL submission failed: ${res.statusText} - ${errText}`);
  }

  const data = await res.json();
  const analysisId = data.data.id;

  job.type = 'url_poll';
  job.analysisId = analysisId;
  job.attempts = 0;
  vtQueue.push(job);
  updateUrlScanStatus(job.scanId, 'scanning', 'URL submitted. Querying reputation vendors...');
}

async function processUrlPollJob(job) {
  const res = await fetch(`https://www.virustotal.com/api/v3/analyses/${job.analysisId}`, {
    headers: { 'x-apikey': process.env.VIRUSTOTAL_API_KEY }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`VirusTotal URL poll failed: ${res.statusText} - ${errText}`);
  }

  const data = await res.json();
  const status = data.data.attributes.status;

  if (status === 'completed') {
    const stats = data.data.attributes.stats;
    const results = data.data.attributes.results;

    // Run Google Safe Browsing
    let safeBrowsing = null;
    if (process.env.GOOGLE_SAFE_BROWSING_API_KEY) {
      try {
        const body = {
          client: { clientId: 'website-security-scanner', clientVersion: '1.0.0' },
          threatInfo: {
            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url: job.url }]
          }
        };
        const sbRes = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${process.env.GOOGLE_SAFE_BROWSING_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (sbRes.ok) {
          safeBrowsing = await sbRes.json();
        }
      } catch (_) {}
    }

    completeUrlScan(job.scanId, stats, results, safeBrowsing);
  } else {
    job.attempts = (job.attempts || 0) + 1;
    if (job.attempts > 24) {
      throw new Error('VirusTotal URL scan timed out.');
    }
    vtQueue.push(job);
  }
}

async function processVtQueue() {
  if (vtQueue.length === 0) return;
  const job = vtQueue.shift();
  try {
    if (job.type === 'file_upload') {
      await processFileUploadJob(job);
    } else if (job.type === 'file_poll') {
      await processFilePollJob(job);
    } else if (job.type === 'url_submit') {
      await processUrlSubmitJob(job);
    } else if (job.type === 'url_poll') {
      await processUrlPollJob(job);
    }
  } catch (err) {
    console.error('Error processing VT job:', err);
    failVtJob(job, err.message);
  }
}

setInterval(processVtQueue, 15000);

// API Routes
app.post('/api/scans', requireRateLimit, async (req, res) => {
  try {
    const domain = normalizeDomain(req.body.domain);
    if (req.body.consent !== true) return res.status(400).json({ error: 'You must confirm you own or have permission to scan this domain.' });
    await validatePublicDomain(domain);
    const job = {
      id: crypto.randomUUID(),
      domain,
      status: 'queued',
      progress: 0,
      activeStep: null,
      categories: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    jobs.set(job.id, job);
    res.status(202).json({ id: job.id, status: job.status, pollUrl: `/api/scans/${job.id}` });
    setImmediate(() => runJob(job));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/scans/file', upload.single('file'), async (req, res) => {
  try {
    if (!process.env.VIRUSTOTAL_API_KEY) {
      return res.status(400).json({ error: 'VirusTotal API key not configured on this server.' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    
    // Check local database cache first
    const cached = getFileScanByHash(sha256);
    if (cached) {
      const liveJob = { ...cached, id: crypto.randomUUID(), createdAt: new Date().toISOString(), completedAt: new Date().toISOString() };
      jobs.set(liveJob.id, liveJob);
      saveFileScanToDb(liveJob);
      return res.status(202).json({ id: liveJob.id, status: 'complete', pollUrl: `/api/scans/${liveJob.id}` });
    }

    const scanId = crypto.randomUUID();
    const scan = {
      id: scanId,
      type: 'file',
      filename: req.file.originalname,
      fileSize: req.file.size,
      sha256,
      status: 'queued',
      score: 100,
      grade: 'A',
      summary: 'Checking VirusTotal registry for cached scan...',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    jobs.set(scanId, scan);
    saveFileScanToDb(scan);

    res.status(202).json({ id: scanId, status: scan.status, pollUrl: `/api/scans/${scanId}` });

    // Perform non-blocking direct hash lookup first (doesn't count against queue, is instant)
    setImmediate(async () => {
      try {
        const vtRes = await fetch(`https://www.virustotal.com/api/v3/files/${sha256}`, {
          headers: { 'x-apikey': process.env.VIRUSTOTAL_API_KEY }
        });
        if (vtRes.ok) {
          const vtData = await vtRes.json();
          completeFileScan(scanId, vtData.data.attributes.last_analysis_stats, vtData.data.attributes.last_analysis_results, vtData.data.attributes);
        } else {
          // File is not in VT registry, we must schedule a queue upload
          vtQueue.push({
            type: 'file_upload',
            scanId,
            filename: req.file.originalname,
            fileBuffer: req.file.buffer
          });
          updateFileScanStatus(scanId, 'queued', 'File hash not found in registry. Queued for VirusTotal submission...');
        }
      } catch (err) {
        failVtJob({ scanId, type: 'file_upload' }, err.message);
      }
    });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/scans/url', async (req, res) => {
  try {
    if (!process.env.VIRUSTOTAL_API_KEY) {
      return res.status(400).json({ error: 'VirusTotal API key not configured on this server.' });
    }
    const targetUrl = String(req.body.url || '').trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      return res.status(400).json({ error: 'Please enter a valid URL starting with http:// or https://' });
    }

    const scanId = crypto.randomUUID();
    const scan = {
      id: scanId,
      type: 'url',
      url: targetUrl,
      status: 'queued',
      score: 100,
      grade: 'A',
      summary: 'Queued for VirusTotal submission...',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    jobs.set(scanId, scan);
    saveUrlScanToDb(scan);

    res.status(202).json({ id: scanId, status: scan.status, pollUrl: `/api/scans/${scanId}` });

    vtQueue.push({
      type: 'url_submit',
      scanId,
      url: targetUrl
    });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/scans/unified', async (req, res) => {
  try {
    const { domainScanId, urlScanId, fileScanId, preparedFor } = req.body;
    let domainScan = null;
    let urlScan = null;
    let fileScan = null;

    if (domainScanId) {
      if (sqlite) {
        const row = sqlite.prepare('SELECT payload FROM scans WHERE id = ?').get(domainScanId);
        if (row) domainScan = JSON.parse(row.payload);
      } else {
        domainScan = (readJsonFallback().scans || []).find(s => s.id === domainScanId);
      }
    }
    if (urlScanId) {
      urlScan = getUrlScanFromDb(urlScanId);
    }
    if (fileScanId) {
      fileScan = getFileScanFromDb(fileScanId);
    }

    if (!domainScan && !urlScan && !fileScan) {
      return res.status(400).json({ error: 'Please select at least one completed scan to generate a unified report.' });
    }

    const activeScores = [];
    if (domainScan) activeScores.push(domainScan.score);
    if (urlScan) activeScores.push(urlScan.score);
    if (fileScan) activeScores.push(fileScan.score);

    const overallScore = Math.min(...activeScores);
    const overallGrade = gradeFromScore(overallScore);

    const scanTypes = [];
    if (domainScan) scanTypes.push('Domain Infrastructure');
    if (urlScan) scanTypes.push('URL Reputation');
    if (fileScan) scanTypes.push('File Security');
    const summary = `Unified Security Audit covering: ${scanTypes.join(', ')}`;

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const unifiedScan = {
      id,
      domainScanId,
      urlScanId,
      fileScanId,
      overallScore,
      overallGrade,
      summary,
      preparedFor: preparedFor || 'Internal Audit',
      createdAt,
      completedAt: createdAt,
      domainScan,
      urlScan,
      fileScan
    };

    saveUnifiedScanToDb(unifiedScan);
    jobs.set(id, unifiedScan);
    res.status(201).json(unifiedScan);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/scans/recent', (req, res) => {
  let domains = [];
  let urls = [];
  let files = [];
  
  if (sqlite) {
    try {
      domains = sqlite.prepare('SELECT id, domain, score, grade, completed_at FROM scans ORDER BY completed_at DESC LIMIT 20')
        .all()
        .map(row => ({ id: row.id, label: `${row.domain} (${row.grade} - ${row.score})` }));
      urls = sqlite.prepare('SELECT id, url, score, grade, completed_at FROM url_scans WHERE status = "complete" ORDER BY completed_at DESC LIMIT 20')
        .all()
        .map(row => ({ id: row.id, label: `${row.url} (${row.grade} - ${row.score})` }));
      files = sqlite.prepare('SELECT id, filename, score, grade, completed_at FROM file_scans WHERE status = "complete" ORDER BY completed_at DESC LIMIT 20')
        .all()
        .map(row => ({ id: row.id, label: `${row.filename} (${row.grade} - ${row.score})` }));
    } catch (_) {}
  } else {
    const db = readJsonFallback();
    domains = (db.scans || []).slice(0, 20).map(row => ({ id: row.id, label: `${row.domain} (${row.grade} - ${row.score})` }));
    urls = (db.urlScans || []).filter(s => s.status === 'complete').slice(0, 20).map(row => ({ id: row.id, label: `${row.url} (${row.grade} - ${row.score})` }));
    files = (db.fileScans || []).filter(s => s.status === 'complete').slice(0, 20).map(row => ({ id: row.id, label: `${row.filename} (${row.grade} - ${row.score})` }));
  }
  
  res.json({ domains, urls, files });
});

app.get('/api/scans/:id', (req, res) => {
  const id = req.params.id;
  let job = jobs.get(id);
  if (!job) job = getFileScanFromDb(id);
  if (!job) job = getUrlScanFromDb(id);
  if (!job) job = getUnifiedScanFromDb(id);
  if (!job) return res.status(404).json({ error: 'Scan not found.' });
  res.json(job);
});

app.get('/api/history/:domain', (req, res) => {
  try {
    const domain = normalizeDomain(req.params.domain);
    res.json(getHistory(domain));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/scans/:id/report.pdf', (req, res) => {
  const id = req.params.id;
  let job = jobs.get(id);
  if (!job) job = getFileScanFromDb(id);
  if (!job) job = getUrlScanFromDb(id);
  if (!job) job = getUnifiedScanFromDb(id);

  if (!job || (job.status && job.status !== 'complete' && job.status !== 'failed' && job.status !== 'scanning')) {
    return res.status(404).json({ error: 'Completed report not found.' });
  }
  const pdf = buildPdf(job);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${job.domain || job.filename || (job.url ? 'url' : 'unified')}-security-report.pdf"`);
  res.send(pdf);
});

app.get('/api/docs', (req, res) => {
  res.type('text/markdown').send(fs.readFileSync(path.join(__dirname, 'API.md'), 'utf8'));
});


function buildPdf(job) {
  const pages = [];
  let currentPage = [];
  const linesPerPage = 45;

  function addLine(text) {
    const wrapped = wrapPdfLine(text, 90);
    wrapped.forEach(part => {
      if (currentPage.length >= linesPerPage) {
        pages.push(currentPage);
        currentPage = [];
      }
      currentPage.push(part);
    });
  }

  // Check if this is a Unified Scan Job
  const isUnified = !!(job.domainScanId || job.urlScanId || job.fileScanId);

  if (isUnified) {
    // Page 1: Cover / Executive Summary
    addLine('------------------------------------------------------------------------------------------');
    addLine('                           SECURITY AUDIT REPORT');
    addLine('------------------------------------------------------------------------------------------');
    addLine('');
    addLine(`Prepared For: ${job.preparedFor || 'Internal Audit'}`);
    addLine(`Audit Date:   ${job.createdAt.slice(0, 10)}`);
    addLine(`Prepared By:  Website Security Scanner`);
    addLine('');
    addLine('EXECUTIVE SUMMARY:');
    addLine('This report compiles the security audit findings across domain infrastructure, specific');
    addLine('URL reputations, and uploaded file analysis where selected.');
    addLine('');
    addLine(`Overall Risk Grade: ${job.overallGrade}   Combined Score: ${job.overallScore}/100`);
    addLine(`Summary: ${job.summary}`);
    addLine('');
    addLine('Scan Components Evaluated:');
    if (job.domainScan) addLine(`  - Domain Infrastructure (${job.domainScan.domain}): Score ${job.domainScan.score}/100 (${job.domainScan.grade})`);
    if (job.urlScan) addLine(`  - URL Reputation (${job.urlScan.url}): Score ${job.urlScan.score}/100 (${job.urlScan.grade})`);
    if (job.fileScan) addLine(`  - File Security (${job.fileScan.filename}): Score ${job.fileScan.score}/100 (${job.fileScan.grade})`);
    addLine('');
    addLine('Please review the subsequent sections of this report for findings and recommended actions.');
    
    // Page Break for Section 1
    if (currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = [];
    }

    // Section: Domain Scan
    if (job.domainScan) {
      addLine('SECTION 1: DOMAIN INFRASTRUCTURE FINDINGS');
      addLine(`Target: ${job.domainScan.domain}`);
      addLine(`Grade:  ${job.domainScan.grade}   Score: ${job.domainScan.score}/100`);
      addLine('');
      addLine('Category Scores:');
      job.domainScan.categories.forEach(c => {
        addLine(`  - ${c.name}: ${c.score}/100 (${c.status})`);
      });
      addLine('');
      addLine('Domain Infrastructure Issues:');
      if (job.domainScan.issues && job.domainScan.issues.length > 0) {
        job.domainScan.issues.forEach(i => {
          addLine(`[${i.severity.toUpperCase()}] ${i.category}: ${i.title}`);
          addLine(`  Fix: ${i.fix}`);
          addLine('');
        });
      } else {
        addLine('No domain infrastructure issues found.');
      }
      
      if (currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
      }
    }

    // Section: URL Scan
    if (job.urlScan) {
      addLine('SECTION 2: URL REPUTATION FINDINGS');
      addLine(`Target URL: ${job.urlScan.url}`);
      addLine(`Grade:      ${job.urlScan.grade}   Score: ${job.urlScan.score}/100`);
      addLine(`Summary:    ${job.urlScan.summary}`);
      addLine('');
      
      const payload = job.urlScan;
      if (payload.stats) {
        addLine('VirusTotal Analysis:');
        addLine(`  - Malicious vendors:  ${payload.stats.malicious}`);
        addLine(`  - Suspicious vendors: ${payload.stats.suspicious}`);
        addLine(`  - Safe/Undetected:    ${payload.stats.harmless + payload.stats.undetected}`);
      }
      if (payload.safeBrowsing && payload.safeBrowsing.matches) {
        addLine('Google Safe Browsing:');
        addLine(`  - Threat Flagged: MALWARE / PHISHING detected`);
      }
      addLine('');
      addLine('URL Reputation Detections:');
      let flaggedEngines = 0;
      if (payload.results) {
        Object.entries(payload.results).forEach(([engine, res]) => {
          if (res.category === 'malicious' || res.category === 'suspicious') {
            flaggedEngines++;
            addLine(`  - [${res.category.toUpperCase()}] ${engine}: ${res.result || 'No threat info'}`);
          }
        });
      }
      if (flaggedEngines === 0) {
        addLine('  - No threat flags from major security engines.');
      }
      
      if (currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
      }
    }

    // Section: File Scan
    if (job.fileScan) {
      addLine('SECTION 3: FILE SECURITY FINDINGS');
      addLine(`File Name: ${job.fileScan.filename}`);
      addLine(`File Size: ${(job.fileScan.fileSize / 1024).toFixed(2)} KB`);
      addLine(`SHA-256:   ${job.fileScan.sha256}`);
      addLine(`Grade:     ${job.fileScan.grade}   Score: ${job.fileScan.score}/100`);
      addLine(`Verdict:   ${job.fileScan.summary}`);
      addLine('');
      
      const payload = job.fileScan;
      if (payload.metadata) {
        addLine('File Metadata:');
        if (payload.metadata.type_description) addLine(`  - Type:        ${payload.metadata.type_description}`);
        if (payload.metadata.first_submission_date) addLine(`  - First Seen:  ${new Date(payload.metadata.first_submission_date * 1000).toISOString()}`);
      }
      
      if (payload.stats) {
        addLine('VirusTotal Antivirus Scan:');
        addLine(`  - Malicious engines:  ${payload.stats.malicious}`);
        addLine(`  - Suspicious engines: ${payload.stats.suspicious}`);
        addLine(`  - Clean/Undetected:   ${payload.stats.harmless + payload.stats.undetected}`);
      }
      addLine('');
      addLine('Detections:');
      let flaggedEngines = 0;
      if (payload.results) {
        Object.entries(payload.results).forEach(([engine, res]) => {
          if (res.category === 'malicious' || res.category === 'suspicious') {
            flaggedEngines++;
            addLine(`  - [${res.category.toUpperCase()}] ${engine}: ${res.result || 'No threat info'}`);
          }
        });
      }
      if (flaggedEngines === 0) {
        addLine('  - No engine flags found. File is considered safe.');
      }
      
      if (currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
      }
    }

  } else if (job.sha256) {
    // This is a standalone File Scan Report
    addLine('Website Security - File Scan Report');
    addLine('----------------------------------------------------');
    addLine(`File Name: ${job.filename}`);
    addLine(`File Size: ${(job.fileSize / 1024).toFixed(2)} KB`);
    addLine(`SHA-256:   ${job.sha256}`);
    addLine(`Grade:     ${job.grade}   Score: ${job.score}/100`);
    addLine(`Verdict:   ${job.summary}`);
    addLine('');
    if (job.metadata) {
      addLine('File Metadata:');
      if (job.metadata.type_description) addLine(`  - Type:        ${job.metadata.type_description}`);
      if (job.metadata.first_submission_date) addLine(`  - First Seen:  ${new Date(job.metadata.first_submission_date * 1000).toISOString()}`);
    }
    if (job.stats) {
      addLine('VirusTotal Antivirus Scan:');
      addLine(`  - Flagged malicious:  ${job.stats.malicious}`);
      addLine(`  - Flagged suspicious: ${job.stats.suspicious}`);
      addLine(`  - Harmless/Undetected: ${job.stats.harmless + job.stats.undetected}`);
    }
    addLine('');
    addLine('Antivirus Engine Detections:');
    let flaggedEngines = 0;
    if (job.results) {
      Object.entries(job.results).forEach(([engine, res]) => {
        if (res.category === 'malicious' || res.category === 'suspicious') {
          flaggedEngines++;
          addLine(`  - [${res.category.toUpperCase()}] ${engine}: ${res.result || 'No threat info'}`);
        }
      });
    }
    if (flaggedEngines === 0) {
      addLine('  - No engine flags found. File is considered safe.');
    }

  } else if (job.url) {
    // This is a standalone URL Scan Report
    addLine('Website Security - URL Scan Report');
    addLine('----------------------------------------------------');
    addLine(`URL:       ${job.url}`);
    addLine(`Grade:     ${job.grade}   Score: ${job.score}/100`);
    addLine(`Verdict:   ${job.summary}`);
    addLine('');
    if (job.stats) {
      addLine('VirusTotal URL Reputation Scan:');
      addLine(`  - Flagged malicious:  ${job.stats.malicious}`);
      addLine(`  - Flagged suspicious: ${job.stats.suspicious}`);
      addLine(`  - Harmless/Undetected: ${job.stats.harmless + job.stats.undetected}`);
    }
    if (job.safeBrowsing && job.safeBrowsing.matches) {
      addLine('Google Safe Browsing:');
      addLine('  - Threat Flagged: MALWARE / PHISHING detected');
    }
    addLine('');
    addLine('Security Engine Detections:');
    let flaggedEngines = 0;
    if (job.results) {
      Object.entries(job.results).forEach(([engine, res]) => {
        if (res.category === 'malicious' || res.category === 'suspicious') {
          flaggedEngines++;
          addLine(`  - [${res.category.toUpperCase()}] ${engine}: ${res.result || 'No threat info'}`);
        }
      });
    }
    if (flaggedEngines === 0) {
      addLine('  - No engine flags found.');
    }

  } else {
    // Existing Domain Scan Report
    addLine('Website Security Report');
    addLine(`Domain: ${job.domain}`);
    addLine(`Grade: ${job.grade}   Score: ${job.score}/100`);
    addLine(job.summary || '');
    addLine(`Completed: ${job.completedAt}`);
    addLine('');
    addLine('Category Scores:');
    job.categories.forEach(c => {
      addLine(`  - ${c.name}: ${c.score}/100 (${c.status})`);
    });
    addLine('');
    addLine('Issues:');
    if (job.issues && job.issues.length > 0) {
      job.issues.forEach(i => {
        addLine(`[${i.severity.toUpperCase()}] ${i.category}: ${i.title}`);
        addLine(`  Fix: ${i.fix}`);
        addLine('');
      });
    } else {
      addLine('No issues found by this scanner.');
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  // Ensure we have at least one page
  if (pages.length === 0) {
    pages.push(['No report content generated.']);
  }

  const objects = [];
  const pageIds = [];
  const contentIds = [];

  // Object IDs start at 1. We have:
  // 1: Catalog
  // 2: Pages
  // 3: Font
  // 4 + 2k: Page object
  // 5 + 2k: Content object
  for (let k = 0; k < pages.length; k++) {
    pageIds.push(4 + 2 * k);
    contentIds.push(5 + 2 * k);
  }

  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push(`2 0 obj << /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >> endobj`);
  objects.push('3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');

  for (let k = 0; k < pages.length; k++) {
    const pageId = pageIds[k];
    const contentId = contentIds[k];

    // Page object
    objects.push(`${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >> endobj`);

    // Build content stream
    const pageLines = pages[k];
    let content = pageLines.map((part, index) => {
      const y = 740 - (index * 15);
      return `BT /F1 10 Tf 50 ${y} Td (${pdfEscape(part)}) Tj ET`;
    }).join('\n');

    // Add page footer with page number
    const footerY = 40;
    content += `\nBT /F1 8 Tf 270 ${footerY} Td (Page ${k + 1} of ${pages.length}) Tj ET`;

    objects.push(`${contentId} 0 obj << /Length ${Buffer.byteLength(content)} >> stream\n${content}\nendstream endobj`);
  }

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach(obj => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += obj + '\n';
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(o => {
    pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

function wrapPdfLine(line, width) {
  const parts = [];
  let rest = String(line || '');
  while (rest.length > width) {
    parts.push(rest.slice(0, width));
    rest = rest.slice(width);
  }
  parts.push(rest);
  return parts;
}

function pdfEscape(value) {
  return String(value).replace(/[\\()]/g, '\\$&');
}

app.listen(PORT, () => {
  console.log(`Website Security Scanner running at http://localhost:${PORT}`);
});
