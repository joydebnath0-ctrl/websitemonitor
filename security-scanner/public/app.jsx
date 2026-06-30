const { useEffect, useMemo, useState } = React;

const steps = [
  ['ssl', 'SSL/TLS'],
  ['headers', 'Headers'],
  ['dns', 'DNS & Email'],
  ['ports', 'Ports'],
  ['cves', 'Software/CVEs'],
  ['blocklist', 'Blocklists'],
  ['exposure', 'Exposed Files']
];

function App() {
  const [tab, setTab] = useState('domain');
  const [domain, setDomain] = useState('');
  const [consent, setConsent] = useState(false);
  const [url, setUrl] = useState('');
  const [urlConsent, setUrlConsent] = useState(false);
  const [file, setFile] = useState(null);
  const [fileConsent, setFileConsent] = useState(false);
  const [unified, setUnified] = useState({ domainScanId: '', urlScanId: '', fileScanId: '', preparedFor: '' });

  const [job, setJob] = useState(null);
  const [history, setHistory] = useState([]);
  const [recentScans, setRecentScans] = useState({ domains: [], urls: [], files: [] });
  const [error, setError] = useState('');
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    if (!job || !['queued', 'running', 'scanning'].includes(job.status)) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/scans/${job.id}`);
      const data = await res.json();
      setJob(data);
      if (data.status === 'complete' && data.domain) loadHistory(data.domain);
    }, 1600);
    return () => clearInterval(timer);
  }, [job?.id, job?.status]);

  async function loadHistory(target) {
    const res = await fetch(`/api/history/${encodeURIComponent(target)}`);
    if (res.ok) setHistory(await res.json());
  }

  async function loadRecentScans() {
    const res = await fetch('/api/scans/recent');
    if (res.ok) setRecentScans(await res.json());
  }

  useEffect(() => {
    if (tab === 'unified') {
      loadRecentScans();
    }
  }, [tab]);

  async function startScan(e) {
    e.preventDefault();
    setError('');
    setJob(null);
    try {
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, consent })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan could not start.');
      setJob(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function startUrlScan(e) {
    e.preventDefault();
    setError('');
    setJob(null);
    try {
      if (!urlConsent) throw new Error('You must confirm you have permission to scan this URL.');
      const res = await fetch('/api/scans/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'URL scan could not start.');
      setJob(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function startFileScan(e) {
    e.preventDefault();
    setError('');
    setJob(null);
    try {
      if (!fileConsent) throw new Error('You must provide consent for file sharing and analysis.');
      if (!file) throw new Error('Please select a file to upload.');
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/scans/file', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'File upload scan could not start.');
      setJob(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function startUnifiedScan(e) {
    e.preventDefault();
    setError('');
    setJob(null);
    try {
      const res = await fetch('/api/scans/unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unified)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not compile unified report.');
      setJob(data);
    } catch (err) {
      setError(err.message);
    }
  }

  const complete = job?.status === 'complete';
  const running = job && ['queued', 'running', 'scanning'].includes(job.status);

  return (
    <main className="app-shell">
      <header className="no-print max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-sky-600 text-white grid place-items-center font-bold">S</div>
          <div>
            <h1 className="text-lg font-semibold">Website Security Scanner</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Multi-input virus scans and infrastructure reports.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setDark(!dark)} className="rounded-md border px-3 py-2 text-sm border-slate-300 dark:border-slate-700">
            {dark ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </header>

      <nav className="no-print max-w-7xl mx-auto px-4 sm:px-6 mb-6 flex gap-2 border-b border-slate-200 dark:border-slate-800">
        {[
          ['domain', 'Domain Scan'],
          ['url', 'URL Reputation'],
          ['file', 'File Security'],
          ['unified', 'Unified Report']
        ].map(([t, label]) => (
          <button
            key={t}
            onClick={() => { setTab(t); setJob(null); setError(''); }}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all -mb-[2px] ${tab === t ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-10">
        {!running && tab === 'domain' && (
          <div className="panel p-5 sm:p-7 mb-6">
            <form onSubmit={startScan} className="grid lg:grid-cols-[1fr_auto] gap-4 items-end">
              <div>
                <label className="block text-sm font-semibold mb-2" htmlFor="domain">Domain to scan</label>
                <input id="domain" value={domain} onChange={e => setDomain(e.target.value)} placeholder="example.com" className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-sky-500" />
                <label className="mt-3 flex gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 h-4 w-4" />
                  <span>I confirm I own this domain or have permission to run a non-intrusive security scan.</span>
                </label>
              </div>
              <button disabled={running} className="rounded-md bg-sky-600 px-5 py-3 font-semibold text-white disabled:opacity-50">
                Start scan
              </button>
            </form>
            {error && <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</div>}
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Informational only. Passive DNS, SSL/TLS checks and header scanning are run.</p>
          </div>
        )}

        {!running && tab === 'url' && (
          <div className="panel p-5 sm:p-7 mb-6">
            <form onSubmit={startUrlScan} className="grid lg:grid-cols-[1fr_auto] gap-4 items-end">
              <div>
                <label className="block text-sm font-semibold mb-2" htmlFor="url">Specific URL to scan</label>
                <input id="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/path/to/page" className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-sky-500" />
                <label className="mt-3 flex gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={urlConsent} onChange={e => setUrlConsent(e.target.checked)} className="mt-1 h-4 w-4" />
                  <span>I confirm I have authorization to scan this URL for malicious links and reputation flags.</span>
                </label>
              </div>
              <button disabled={running} className="rounded-md bg-sky-600 px-5 py-3 font-semibold text-white disabled:opacity-50">
                Scan URL
              </button>
            </form>
            {error && <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</div>}
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Sends the link to VirusTotal URL scan registry and checks Safe Browsing.</p>
          </div>
        )}

        {!running && tab === 'file' && (
          <div className="panel p-5 sm:p-7 mb-6">
            <form onSubmit={startFileScan} className="grid gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Upload File for Antivirus Analysis</label>
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-md p-6 text-center cursor-pointer hover:border-sky-500 transition-all bg-slate-50 dark:bg-slate-900 relative">
                  <input
                    type="file"
                    onChange={e => setFile(e.target.files[0])}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="text-slate-600 dark:text-slate-300">
                    {file ? (
                      <p className="font-semibold text-sky-600">Selected file: {file.name} ({Math.round(file.size / 1024)} KB)</p>
                    ) : (
                      <p>Drag and drop a file here, or click to browse (Max 2GB)</p>
                    )}
                  </div>
                </div>
                <label className="mt-3 flex gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={fileConsent} onChange={e => setFileConsent(e.target.checked)} className="mt-1 h-4 w-4" />
                  <span>I consent to upload this file to VirusTotal and confirm it does not contain private or sensitive data.</span>
                </label>
              </div>
              <button disabled={running || !file} className="w-full rounded-md bg-sky-600 px-5 py-3 font-semibold text-white disabled:opacity-50">
                Upload & Scan File
              </button>
            </form>
            {error && <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</div>}
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Files are hashed first. If a report is cached, it returns instantly. Otherwise, the file is uploaded to the analysis sandbox.</p>
          </div>
        )}

        {!running && tab === 'unified' && (
          <div className="panel p-5 sm:p-7 mb-6">
            <h3 className="text-lg font-bold mb-4">Unified Security Report Generator</h3>
            <form onSubmit={startUnifiedScan} className="grid gap-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Prepared For (Company / Target Name)</label>
                  <input
                    type="text"
                    value={unified.preparedFor}
                    onChange={e => setUnified({ ...unified, preparedFor: e.target.value })}
                    placeholder="e.g. Acme Corp"
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-base outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Select Domain Scan</label>
                  <select
                    value={unified.domainScanId}
                    onChange={e => setUnified({ ...unified, domainScanId: e.target.value })}
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-base outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">-- None Selected --</option>
                    {(recentScans.domains || []).map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Select URL Reputation Scan</label>
                  <select
                    value={unified.urlScanId}
                    onChange={e => setUnified({ ...unified, urlScanId: e.target.value })}
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-base outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">-- None Selected --</option>
                    {(recentScans.urls || []).map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Select File Scan</label>
                  <select
                    value={unified.fileScanId}
                    onChange={e => setUnified({ ...unified, fileScanId: e.target.value })}
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-base outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">-- None Selected --</option>
                    {(recentScans.files || []).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
              </div>
              <button disabled={running} className="w-full rounded-md bg-sky-600 px-5 py-3 font-semibold text-white disabled:opacity-50">
                Compile & Generate Unified Report
              </button>
            </form>
            {error && <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</div>}
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Combines recent scanner runs into a branded, multi-section executive deliverable.</p>
          </div>
        )}

        {running && <Progress job={job} />}
        {job?.status === 'failed' && <div className="panel p-5 text-red-600">{job.error}</div>}

        {complete && job.domain && !job.domainScanId && (
          <>
            <Hero job={job} />
            <div className="grid xl:grid-cols-[1.1fr_.9fr] gap-6 mb-6">
              <Radar categories={job.categories} />
              <Timeline history={history} current={job} />
            </div>
            <IssueList issues={job.issues} />
            <CategoryGrid categories={job.categories} />
          </>
        )}

        {complete && job.url && !job.domainScanId && (
          <UrlScanResults job={job} />
        )}

        {complete && job.sha256 && !job.domainScanId && (
          <FileScanResults job={job} />
        )}

        {complete && job.domainScanId && (
          <UnifiedScanResults job={job} />
        )}
      </section>
    </main>
  );
}

function Progress({ job }) {
  return (
    <div className="panel p-5 mb-6">
      <div className="flex justify-between text-sm mb-3">
        <span className="font-semibold">Scan in progress</span>
        <span>{job.progress || 0}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div className="h-full bg-sky-600 transition-all" style={{ width: `${job.progress || 5}%` }} />
      </div>
      <div className="mt-4 grid sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {steps.map(([id, label]) => <div key={id} className={`rounded-md border px-3 py-2 text-xs ${job.activeStep === id ? 'border-sky-500 text-sky-600' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>{label}</div>)}
      </div>
    </div>
  );
}

function Hero({ job }) {
  const color = job.score >= 80 ? '#10b981' : job.score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <section className="panel p-6 sm:p-8 mb-6 grid lg:grid-cols-[auto_1fr_auto] gap-6 items-center">
      <div className="gauge" style={{ background: `conic-gradient(${color} ${job.score * 3.6}deg, #dbe3ef 0deg)` }}>
        <div className="gauge-content text-center">
          <div className="text-6xl font-black" style={{ color }}>{job.grade}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">{job.score}/100</div>
        </div>
      </div>
      <div>
        <p className="text-sm uppercase tracking-wide text-sky-600 font-semibold mb-2">Overall security grade</p>
        <h2 className="text-2xl sm:text-4xl font-bold leading-tight mb-3">{job.summary}</h2>
        <p className="text-slate-600 dark:text-slate-300 max-w-3xl">Scanned {job.domain} across encryption, browser safety headers, DNS/email protection, common ports, visible software, blocklists, and sensitive file exposure.</p>
      </div>
      <a href={`/api/scans/${job.id}/report.pdf`} className="no-print rounded-md bg-slate-900 dark:bg-white dark:text-slate-950 text-white px-4 py-3 text-center font-semibold">Download PDF</a>
    </section>
  );
}

function Radar({ categories }) {
  return (
    <div className="panel p-5 flex flex-col justify-between">
      <div>
        <h3 className="font-semibold mb-4">Category scores</h3>
        <div className="space-y-4">
          {categories.map(c => {
            const colorClass = c.status === 'pass' ? 'bg-emerald-500' : c.status === 'warning' ? 'bg-amber-500' : 'bg-rose-500';
            return (
              <div key={c.id} className="grid grid-cols-[120px_1fr_45px] gap-4 items-center">
                <span className="text-xs font-semibold truncate" title={c.name}>{c.name}</span>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className={`h-full rounded-full ${colorClass} transition-all duration-500`} style={{ width: `${c.score}%` }} />
                </div>
                <span className="text-xs font-bold text-right">{c.score}/100</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Scores are weighted based on the severity of issues found.</p>
    </div>
  );
}


function Timeline({ history, current }) {
  const rows = history.length ? history : [current];
  return (
    <div className="panel p-5">
      <h3 className="font-semibold mb-4">Scan history trend</h3>
      <div className="h-56 flex items-end gap-3 border-b border-slate-200 dark:border-slate-700 pb-2">
        {rows.slice().reverse().map(item => (
          <div key={item.id} className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full rounded-t bg-sky-500" style={{ height: `${Math.max(8, item.score * 1.8)}px` }} title={`${item.score}/100`} />
            <span className="text-xs text-slate-500">{item.grade}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Stored locally per domain for repeat-scan comparison.</p>
    </div>
  );
}

function IssueList({ issues }) {
  return (
    <div className="panel p-5 mb-6">
      <h3 className="font-semibold mb-4">Priority issue list</h3>
      {issues.length === 0 ? <p className="text-sm text-slate-500">No issues were found by this scanner.</p> : (
        <div className="grid gap-3">
          {issues.map((item, i) => <div key={i} className="rounded-md border border-slate-200 dark:border-slate-700 p-4 flex flex-col md:flex-row md:items-start gap-3">
            <span className={`severity-${item.severity} rounded px-2 py-1 text-xs font-bold uppercase w-fit`}>{item.severity}</span>
            <div>
              <p className="font-semibold">{item.category}: {item.title}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{item.plain}</p>
              <p className="text-sm mt-2"><strong>Fix:</strong> {item.fix}</p>
            </div>
          </div>)}
        </div>
      )}
    </div>
  );
}

function CategoryGrid({ categories }) {
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      {categories.map(c => <CategoryCard key={c.id} category={c} />)}
    </div>
  );
}

function CategoryCard({ category }) {
  const icon = category.status === 'pass' ? 'Check' : category.status === 'warning' ? 'Warn' : 'Fail';
  const first = category.issues[0];
  return (
    <article className="panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className={`status-${category.status} border rounded px-2 py-1 text-xs font-bold`}>{icon}</span>
            <h3 className="font-semibold text-lg">{category.name}</h3>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{first ? first.plain : category.summary}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{category.score}</div>
          <div className="text-xs text-slate-500">score</div>
        </div>
      </div>
      <div className="mt-4 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4">
        <p className="text-sm"><strong>Recommended action:</strong> {first ? first.fix : 'Keep monitoring this area and rescan after major changes.'}</p>
      </div>
      {category.issues.length > 1 && <p className="mt-3 text-sm text-slate-500">{category.issues.length - 1} more issue{category.issues.length - 1 === 1 ? '' : 's'} in this category.</p>}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-sky-600">Technical details</summary>
        <pre className="mt-3 overflow-auto rounded-md bg-slate-950 text-slate-100 p-4 text-xs">{JSON.stringify(category.technicalDetails, null, 2)}</pre>
      </details>
    </article>
  );
}

function VerdictBanner({ score, summary }) {
  const isClean = score >= 90;
  const isSuspicious = score >= 60 && score < 90;
  const bgClass = isClean ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300' : isSuspicious ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300' : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/20 dark:border-rose-800 dark:text-rose-300';
  const label = isClean ? 'Clean' : isSuspicious ? 'Suspicious' : 'Threat Flagged';

  return (
    <div className={`panel p-6 border ${bgClass} mb-6 flex flex-col sm:flex-row gap-4 items-center justify-between`}>
      <div>
        <span className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded bg-current/10 mr-2">{label}</span>
        <h2 className="text-xl sm:text-2xl font-black mt-2">{summary}</h2>
      </div>
      <div className="text-center sm:text-right shrink-0">
        <div className="text-4xl font-extrabold">{score}/100</div>
        <div className="text-xs uppercase tracking-wide opacity-75">Trust Score</div>
      </div>
    </div>
  );
}

function UrlScanResults({ job }) {
  const flaggedEngines = Object.entries(job.results || {}).filter(([_, res]) => res.category === 'malicious' || res.category === 'suspicious');
  
  return (
    <div>
      <VerdictBanner score={job.score} summary={job.summary} />
      
      <div className="grid md:grid-cols-[1fr_280px] gap-6 mb-6">
        <div className="panel p-5">
          <h3 className="font-semibold mb-4 text-base">URL Scan Metadata</h3>
          <div className="grid gap-3 text-sm">
            <div>
              <span className="text-slate-500 block">Target URL</span>
              <span className="font-mono break-all">{job.url}</span>
            </div>
            {job.stats && (
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <span className="text-slate-500 block">Detections</span>
                  <span className="font-semibold text-rose-500">{job.stats.malicious} engine(s)</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Checked Engines</span>
                  <span>{job.stats.malicious + job.stats.suspicious + job.stats.harmless + job.stats.undetected}</span>
                </div>
              </div>
            )}
          </div>
          
          <div className="no-print mt-6">
            <a href={`/api/scans/${job.id}/report.pdf`} className="inline-block rounded-md bg-slate-900 dark:bg-white dark:text-slate-950 text-white px-4 py-3 font-semibold">
              Download PDF Report
            </a>
          </div>
        </div>

        <div className="panel p-5 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold mb-3">Threat Breakdown</h3>
            {job.safeBrowsing && job.safeBrowsing.matches ? (
              <div className="rounded-md bg-rose-50 border border-rose-200 text-rose-800 p-3 text-xs mb-4">
                <strong>Google Safe Browsing Flag:</strong> Phishing, social engineering, or malware was detected on this path.
              </div>
            ) : (
              <div className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 text-xs mb-4 dark:bg-emerald-950/20 dark:text-emerald-300">
                Google Safe Browsing reports this path is currently clean.
              </div>
            )}
            <p className="text-xs text-slate-500 leading-relaxed">
              Detection ratio indicates how many security vendors flagged this specific URL. Most engines consider it safe if the ratio is 0.
            </p>
          </div>
        </div>
      </div>

      <div className="panel p-5">
        <h3 className="font-semibold mb-4">Security Vendor Engine Detections</h3>
        {flaggedEngines.length === 0 ? (
          <p className="text-sm text-slate-500">No malicious or suspicious flags were reported by any security vendors.</p>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {flaggedEngines.map(([engine, res]) => (
              <div key={engine} className="border border-slate-200 dark:border-slate-800 rounded p-3 text-xs flex justify-between items-center">
                <div>
                  <span className="font-semibold block">{engine}</span>
                  <span className="text-slate-500">{res.result || 'Flagged'}</span>
                </div>
                <span className="rounded bg-rose-100 text-rose-800 px-2 py-0.5 font-bold uppercase">{res.category}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FileScanResults({ job }) {
  const flaggedEngines = Object.entries(job.results || {}).filter(([_, res]) => res.category === 'malicious' || res.category === 'suspicious');
  
  return (
    <div>
      <VerdictBanner score={job.score} summary={job.summary} />

      <div className="grid md:grid-cols-[1fr_280px] gap-6 mb-6">
        <div className="panel p-5">
          <h3 className="font-semibold mb-4 text-base">File Metadata & Hashes</h3>
          <div className="grid sm:grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <span className="text-slate-500 block">File Name</span>
              <span className="font-semibold break-all">{job.filename}</span>
            </div>
            <div>
              <span className="text-slate-500 block">File Size</span>
              <span>{Math.round(job.fileSize / 1024)} KB</span>
            </div>
          </div>
          <div className="grid gap-3 text-sm">
            <div>
              <span className="text-slate-500 block">SHA-256 Hash</span>
              <span className="font-mono text-xs break-all bg-slate-50 dark:bg-slate-900 border p-2 rounded block mt-1">{job.sha256}</span>
            </div>
            {job.metadata?.type_description && (
              <div>
                <span className="text-slate-500 block">Type Description</span>
                <span>{job.metadata.type_description}</span>
              </div>
            )}
          </div>
          <div className="no-print mt-6">
            <a href={`/api/scans/${job.id}/report.pdf`} className="inline-block rounded-md bg-slate-900 dark:bg-white dark:text-slate-950 text-white px-4 py-3 font-semibold">
              Download PDF Report
            </a>
          </div>
        </div>

        <div className="panel p-5">
          <h3 className="font-semibold mb-3">Antivirus Verdict</h3>
          {job.stats && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-1">
                <span>Malicious:</span>
                <span className="font-bold text-rose-500">{job.stats.malicious}</span>
              </div>
              <div className="flex justify-between border-b pb-1">
                <span>Suspicious:</span>
                <span className="font-bold text-amber-500">{job.stats.suspicious}</span>
              </div>
              <div className="flex justify-between border-b pb-1">
                <span>Harmless:</span>
                <span className="font-bold text-emerald-500">{job.stats.harmless}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Checked:</span>
                <span>{job.stats.malicious + job.stats.suspicious + job.stats.harmless + job.stats.undetected}</span>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500 mt-4 leading-relaxed">
            Multi-engine sandbox scans test the binary against dozens of commercial antivirus signatures.
          </p>
        </div>
      </div>

      <div className="panel p-5">
        <h3 className="font-semibold mb-4">Antivirus Engine Detections</h3>
        {flaggedEngines.length === 0 ? (
          <p className="text-sm text-slate-500">No security vendors flagged this file signature as malicious.</p>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {flaggedEngines.map(([engine, res]) => (
              <div key={engine} className="border border-slate-200 dark:border-slate-800 rounded p-3 text-xs flex justify-between items-center">
                <div>
                  <span className="font-semibold block">{engine}</span>
                  <span className="text-slate-500">{res.result || 'Threat detected'}</span>
                </div>
                <span className="rounded bg-rose-100 text-rose-800 px-2 py-0.5 font-bold uppercase">{res.category}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UnifiedScanResults({ job }) {
  return (
    <div>
      <div className="panel p-6 border border-slate-200 dark:border-slate-800 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded bg-sky-100 text-sky-800 mr-2 dark:bg-sky-950/20 dark:text-sky-300">Unified Report</span>
          <h2 className="text-2xl font-black mt-2">Combined Security Audit</h2>
          <p className="text-slate-500 text-sm mt-1">Prepared for: <strong className="text-slate-700 dark:text-slate-300">{job.preparedFor}</strong> | Date: {job.createdAt.slice(0,10)}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-4xl font-extrabold text-sky-600">{job.overallScore}/100</div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Overall Grade: {job.overallGrade}</div>
          </div>
          <a href={`/api/scans/${job.id}/report.pdf`} className="rounded-md bg-slate-900 dark:bg-white dark:text-slate-950 text-white px-4 py-3 font-semibold">
            Download Unified PDF
          </a>
        </div>
      </div>

      <div className="grid gap-6 mb-6">
        {job.domainScan && (
          <div className="panel p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">1. Domain Infrastructure Scan ({job.domainScan.domain})</h3>
              <span className="font-bold text-sky-600">{job.domainScan.grade} ({job.domainScan.score}/100)</span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{job.domainScan.summary}</p>
            <div className="border-t pt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {job.domainScan.categories.map(c => (
                <div key={c.id} className="border border-slate-200 dark:border-slate-800 rounded p-2 text-xs text-center">
                  <span className="block text-slate-500">{c.name}</span>
                  <span className="font-bold">{c.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {job.urlScan && (
          <div className="panel p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">2. URL Reputation Scan ({job.urlScan.url})</h3>
              <span className="font-bold text-sky-600">{job.urlScan.grade} ({job.urlScan.score}/100)</span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">{job.urlScan.summary}</p>
            {job.urlScan.stats && (
              <p className="text-xs text-slate-500 mt-2">Detections: {job.urlScan.stats.malicious} of {job.urlScan.stats.malicious + job.urlScan.stats.harmless} engines flagged this URL.</p>
            )}
          </div>
        )}

        {job.fileScan && (
          <div className="panel p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">3. File Security Scan ({job.fileScan.filename})</h3>
              <span className="font-bold text-sky-600">{job.fileScan.grade} ({job.fileScan.score}/100)</span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{job.fileScan.summary}</p>
            <p className="text-xs font-mono text-slate-500">SHA-256: {job.fileScan.sha256}</p>
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
