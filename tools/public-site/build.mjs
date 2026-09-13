import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const dist = resolve(process.argv[2] ?? "apps/web/dist");
const origin = "https://openitr.vasu-kandagatla.workers.dev";
const repo = "https://github.com/vasu2912/OpenITR";
const preview = Boolean(
	process.env.WORKERS_CI_BRANCH && process.env.WORKERS_CI_BRANCH !== "main",
);
const escape = (text) =>
	text
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
const pages = [
	{
		path: "/",
		title: "OpenITR | Free, open-source Indian income-tax analysis",
		description:
			"Understand your Indian income tax with OpenITR. Free, open-source, browser-local analysis for ITR-1, AY 2026-27. No account. No return submission.",
	},
	{
		path: "/how-it-works/",
		title: "How OpenITR works",
		description:
			"Check your scope, select supported local documents, review evidence, and explore educational tax calculations in OpenITR.",
	},
	{
		path: "/supported-documents/",
		title: "Supported tax documents | OpenITR",
		description:
			"Document families in OpenITR, including Form 16, Form 16A, AIS, Form 26AS, prefilled ITR-1 JSON, and e-Pay Tax receipts. Exact revision support matters.",
	},
	{
		path: "/scope/",
		title: "ITR-1 analysis scope, AY 2026-27 | OpenITR",
		description:
			"What OpenITR can analyze, which assessment year it covers, and why its educational results are not a tax return or filing guarantee.",
	},
	{
		path: "/faq/",
		title: "Privacy, cost, and ITR filing questions | OpenITR",
		description:
			"Is OpenITR free? Can it file an ITR? Where do documents go? Read direct answers about this independent, open-source tax analysis tool.",
	},
];
const nav = pages
	.slice(1)
	.map(
		(p) =>
			`<a href="${p.path}">${{ "/how-it-works/": "How it works", "/supported-documents/": "Documents", "/scope/": "Scope", "/faq/": "FAQ" }[p.path]}</a>`,
	)
	.join("");
const limitation =
	"OpenITR provides educational analysis, not tax, legal, or professional advice. It does not prepare or submit a filing artifact. Review your evidence and seek qualified advice where needed.";
const sourceLinks = `<a href="${repo}/tree/main/packages/tax-analysis-modules/itr1-ay2026-27/src/revisions">Versioned rule packs and citations</a> · <a href="https://www.incometax.gov.in/iec/foportal/">Income Tax Department portal</a>`;
const bodies = {
	"/": `<section class="hero"><div><p class="eyebrow">OPEN SOURCE. YOUR BROWSER. YOUR DATA.</p><h1>Understand your tax.<br><span>Keep your data.</span></h1><p class="intro">Free, open-source Indian income-tax analysis. Review your documents, understand the calculations, and see where the numbers come from.</p><div class="actions"><a class="button" href="/app/">Start your analysis <span aria-hidden="true">↗</span></a><a class="secondary" href="${repo}">Explore the source code <span aria-hidden="true">↗</span></a></div><p class="small">No account required. Educational analysis, not return filing.</p></div><aside class="analysis-card" aria-label="The analysis workflow"><div class="card-top"><span class="mark">O/</span><span>YOUR ANALYSIS WORKSPACE</span></div><div class="card-body"><p class="eyebrow">ITR-1 · AY 2026-27</p><h2>Evidence first.<br>Answers you can inspect.</h2><ol class="steps"><li><span>01</span><div><strong>Check your scope</strong><p>Find out whether this analysis covers your situation.</p></div></li><li><span>02</span><div><strong>Review local evidence</strong><p>See extracted facts and resolve conflicts.</p></div></li><li><span>03</span><div><strong>Understand the result</strong><p>Follow calculations back to facts and cited rules.</p></div></li></ol><div class="local-note">Document processing stays in your browser.</div></div></aside></section><section class="facts" aria-label="Project facts"><div><strong>₹0</strong><span>Free to use</span></div><div><strong>MIT</strong><span>Open-source license</span></div><div><strong>2026-27</strong><span>Assessment year</span></div><div><strong>Local</strong><span>Document processing</span></div></section><section class="section"><div class="section-heading"><p class="eyebrow">A CLEARER VIEW OF YOUR TAX</p><h2>More context.<br>Less guesswork.</h2><p>Documents can disagree. Important facts can be missing. OpenITR makes those gaps visible before you rely on a result.</p></div><div class="features"><article><span class="number">01 / EVIDENCE</span><h3>See the source behind a fact</h3><p>Review observations from supported documents, with their provenance preserved when you resolve a conflict.</p><a href="/supported-documents/">Check document support →</a></article><article><span class="number">02 / EXPLANATION</span><h3>Follow the calculation</h3><p>Explore educational tax computations with cited rules, inputs, and limitations.</p><a href="/scope/">Understand the scope →</a></article><article><span class="number">03 / CONTROL</span><h3>Keep your documents local</h3><p>Select files for your current browser session. No account is needed to begin.</p><a href="/faq/">Read the privacy answers →</a></article></div></section><section class="closing"><div><p class="eyebrow">BUILT IN THE OPEN</p><h2>Your tax deserves<br>a clear explanation.</h2><p>Read the code. Check the scope. Then start with your own evidence.</p></div><a class="button" href="/app/">Open the analysis tool ↗</a></section>`,
	"/how-it-works/": `<p class="eyebrow">A GUIDE TO YOUR FIRST SESSION</p><h1>From documents<br>to understanding.</h1><p class="intro">OpenITR analyzes supported evidence in your browser. Start by checking whether your situation is covered.</p><ol class="guide"><li><h2>Check the analysis scope</h2><p>Open the tool and answer the scope questions. The current analysis targets ITR-1 for assessment year 2026-27, financial year 2025-26. Stop if your situation falls outside the supported scope.</p></li><li><h2>Select supported documents</h2><p>Choose local files for the current session. Check <a href="/supported-documents/">document support</a> first. A familiar file name does not mean its template revision is supported.</p></li><li><h2>Review the evidence</h2><p>Check extracted observations against your originals. Resolve conflicts explicitly and answer permitted questions about missing facts. OpenITR preserves the source evidence.</p></li><li><h2>Read the calculations and limitations</h2><p>Review the available computations, explanations, and outstanding issues. An analysis result is not a return and does not guarantee correctness or eligibility to file.</p></li></ol><aside class="notice"><h2>Filing is a separate step</h2><p>OpenITR does not submit returns or generate a government-shaped filing file. Use the official Income Tax Department portal or an appropriate filing service for submission.</p></aside>`,
	"/supported-documents/": `<p class="eyebrow">REFERENCE / LOCAL EVIDENCE</p><h1>Bring the documents.<br>Check the revision.</h1><p class="intro">Support is specific to a document family and a reviewed template revision. OpenITR is not a general-purpose PDF reader.</p><div class="table-wrap"><table><caption>Document families with adapters in the repository</caption><thead><tr><th scope="col">Document family</th><th scope="col">Format</th></tr></thead><tbody><tr><td>Form 16</td><td>PDF</td></tr><tr><td>Form 16A</td><td>PDF</td></tr><tr><td>Annual Information Statement, AIS</td><td>JSON, CSV</td></tr><tr><td>Form 26AS</td><td>Text, Excel</td></tr><tr><td>Prefilled ITR-1</td><td>JSON</td></tr><tr><td>e-Pay Tax receipt</td><td>PDF</td></tr></tbody></table></div><h2>What support means</h2><p>An adapter must recognize the exact revision and have reviewed fixtures. The tool reports unsupported documents rather than treating arbitrary files as valid evidence. Not every field in an accepted document necessarily contributes to a calculation.</p><p>The <a href="${repo}/tree/main/packages/document-adapters/src">document adapter source and tests</a> record the implemented revisions. Check the tool's acceptance result for your file and review every extracted fact.</p><h2>What to do with an unsupported file</h2><p>Do not rename or alter a document to bypass recognition. You can report its document family and template revision in a repository issue. Never post your PAN, tax documents, or other personal information in a public issue.</p>`,
	"/scope/": `<p class="eyebrow">REFERENCE / CURRENT COVERAGE</p><h1>Know what the<br>analysis covers.</h1><p class="intro">The current rule pack targets ITR-1 for AY 2026-27, covering FY 2025-26. The tool's scope questions determine whether your situation is supported.</p><h2>Educational analysis</h2><p>OpenITR extracts observations from supported evidence, reconciles facts, asks for missing information, and provides available tax computations with explanations. Calculations depend on complete evidence and supported cases.</p><p>The repository includes old-regime and new-regime computations, regime comparison, deductions, and tax-credit analysis. These are conditional capabilities, not a promise that every income type or deduction is covered.</p><h2>Outside the product's scope</h2><ul><li>Preparing or submitting an income-tax return.</li><li>Generating a filing artifact for portal upload.</li><li>Guaranteeing tax correctness, a refund, or filing eligibility.</li><li>Replacing a tax professional or official guidance.</li></ul><h2>Sources and revisions</h2><p>Rule packs are versioned by assessment year, form, and revision. Their manifests record official source URLs and rule references. The version in the running tool is authoritative for that session.</p><p>${sourceLinks}</p><p>OpenITR is an independent project, not an Income Tax Department service. This page describes product capabilities, not individual tax advice.</p>`,
	"/faq/": `<p class="eyebrow">QUESTIONS, ANSWERED</p><h1>Before you begin.</h1><div class="faq"><section><h2>Is OpenITR free and open source?</h2><p>Yes. OpenITR is free to use and its source code is available under the MIT license. You do not need an account to use the analysis tool.</p></section><section><h2>Can I file my ITR with OpenITR?</h2><p>No. OpenITR provides educational Indian income-tax analysis. It does not prepare or submit a filing artifact. For return submission, use the <a href="https://www.incometax.gov.in/iec/foportal/">official Income Tax Department portal</a> or a suitable filing service.</p></section><section><h2>Are my tax documents sent to a server?</h2><p>The application processes selected tax documents locally in your browser for the current session. It does not upload those documents to an OpenITR backend. The hosting provider still receives ordinary website requests, such as requests for HTML and JavaScript.</p></section><section><h2>Will my analysis survive a refresh?</h2><p>The analysis runs in memory for the current session. Do not rely on the browser to save your work across a refresh or closed tab. Keep your original documents.</p></section><section><h2>Which year and return type does it cover?</h2><p>The current analysis targets ITR-1 for AY 2026-27, FY 2025-26. Read the <a href="/scope/">scope reference</a> and complete the tool's scope questions before selecting documents.</p></section><section><h2>Who maintains OpenITR?</h2><p>OpenITR is maintained by Vasu Kandagatla and contributors through the <a href="${repo}">OpenITR repository</a>. The code, license, and issue tracker are public. It is not an official government application.</p></section><section><h2>How can I report a problem?</h2><p>Use the <a href="${repo}/issues">repository issue tracker</a>. Describe the behavior and version without sharing real tax documents, PANs, names, or other personal data.</p></section></div>`,
};

function render(page, body, noindex = preview) {
	const structured =
		page.path === "/"
			? `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "OpenITR", url: origin + "/", description: page.description, applicationCategory: "FinanceApplication", operatingSystem: "Web browser", isAccessibleForFree: true, license: repo + "/blob/main/LICENSE", sameAs: repo, offers: { "@type": "Offer", price: "0", priceCurrency: "INR" } })}</script>`
			: "";
	return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(page.title)}</title><meta name="description" content="${escape(page.description)}"><meta name="robots" content="${noindex ? "noindex, follow" : "index, follow"}"><link rel="canonical" href="${origin}${page.path}"><meta property="og:type" content="website"><meta property="og:site_name" content="OpenITR"><meta property="og:title" content="${escape(page.title)}"><meta property="og:description" content="${escape(page.description)}"><meta property="og:url" content="${origin}${page.path}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escape(page.title)}"><meta name="twitter:description" content="${escape(page.description)}"><meta name="theme-color" content="#14232c"><link rel="stylesheet" href="/public-site.css">${structured}</head><body><a class="skip" href="#main">Skip to content</a><header><div class="nav"><a class="brand" href="/" aria-label="OpenITR home"><span class="mark">O/</span> OpenITR</a><nav aria-label="Main navigation">${nav}</nav><a class="nav-cta" href="/app/">Open app ↗</a></div></header><main id="main" class="${page.path === "/" ? "home" : "reference"}">${body}</main><footer><div class="footer-inner"><div><a class="brand" href="/">OpenITR</a><p>Independent. Open source. Educational.</p></div><div><p>${limitation}</p><p><a href="${repo}">GitHub</a> · <a href="${repo}/blob/main/LICENSE">MIT license</a> · <a href="/faq/">Privacy and FAQ</a></p></div></div></footer></body></html>`;
}

mkdirSync(join(dist, "app"), { recursive: true });
const app = readFileSync(join(dist, "index.html"), "utf8");
writeFileSync(
	join(dist, "app/index.html"),
	app.replace(
		"</head>",
		'<meta name="robots" content="noindex, follow"></head>',
	),
);
for (const page of pages) {
	const directory = join(dist, page.path);
	mkdirSync(directory, { recursive: true });
	writeFileSync(join(directory, "index.html"), render(page, bodies[page.path]));
}
writeFileSync(
	join(dist, "404.html"),
	render(
		{
			path: "/404.html",
			title: "Page not found | OpenITR",
			description: "This OpenITR page does not exist.",
		},
		'<p class="eyebrow">404 / PAGE NOT FOUND</p><h1>This page is missing.</h1><p><a href="/">Return to the homepage</a> or <a href="/app/">open the analysis tool</a>.</p>',
		true,
	),
);
copyFileSync(
	new URL("./public-site.css", import.meta.url),
	join(dist, "public-site.css"),
);
writeFileSync(
	join(dist, "sitemap.xml"),
	`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((p) => `<url><loc>${origin}${p.path}</loc></url>`).join("")}</urlset>\n`,
);
writeFileSync(
	join(dist, "robots.txt"),
	`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`,
);
writeFileSync(
	join(dist, "_headers"),
	`/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n/app/*\n  X-Robots-Tag: noindex, follow\nhttps://:version-openitr.vasu-kandagatla.workers.dev/*\n  X-Robots-Tag: noindex, follow\n${preview ? "/*\n  X-Robots-Tag: noindex, follow\n" : ""}`,
);
console.log(
	`public-site: generated ${pages.length} public pages, app entry, crawler files, and 404 page`,
);
