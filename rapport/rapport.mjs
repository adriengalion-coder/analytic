/* Rapport mensuel d'un site client, à partir de l'API de statistiques de Plausible
   (POST /api/v2/query). Produit une page HTML (deux pages A4 à l'impression) : on l'ouvre dans le
   navigateur, on complète les passages surlignés, puis Ctrl+P → « Enregistrer en PDF ».

       node rapport/rapport.mjs <domaine> [AAAA-MM]     # mois précédent par défaut
       node rapport/rapport.mjs --demo                  # données fictives, sans Plausible

   Réglages (variables d'environnement) :
       PLAUSIBLE_URL      adresse de l'instance (défaut http://localhost:8000)
       PLAUSIBLE_API_KEY  clé créée dans Plausible : Settings → API keys
       AGENCE             nom affiché en en-tête (défaut « Ton agence »)

   Aucune dépendance : Node 18 ou plus suffit. Sans Node installé, passer par
   Docker (voir rapport.ps1). */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const demo = args.includes('--demo');
const [domaine = 'boutique-exemple.fr', moisArg] = args.filter((a) => !a.startsWith('--'));
const URL_PLAUSIBLE = (process.env.PLAUSIBLE_URL || 'http://localhost:8000').replace(/\/$/, '');
const CLE = process.env.PLAUSIBLE_API_KEY || '';
const AGENCE = process.env.AGENCE || 'Ton agence';

/* ---------- Dates ---------- */

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];

function moisParDefaut() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function bornes(aaaamm) {
  const [a, m] = aaaamm.split('-').map(Number);
  const dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { a, m, jours: dernier, plage: [`${a}-${mm}-01`, `${a}-${mm}-${dernier}`] };
}

function moisPrecedent(aaaamm) {
  const [a, m] = aaaamm.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

const mois = moisArg || moisParDefaut();
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) {
  console.error(`Mois invalide : « ${mois} ». Format attendu : AAAA-MM, par exemple 2026-09.`);
  process.exit(1);
}
const cur = bornes(mois);
const prev = bornes(moisPrecedent(mois));

/* ---------- Données ---------- */

const AGREGATS = ['visitors', 'visits', 'pageviews', 'views_per_visit', 'bounce_rate', 'visit_duration'];

async function requete(corps) {
  const rep = await fetch(`${URL_PLAUSIBLE}/api/v2/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CLE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ site_id: domaine, ...corps }),
  });
  const texte = await rep.text();
  if (!rep.ok) {
    let detail = texte;
    try { detail = JSON.parse(texte).error || texte; } catch {}
    throw new Error(`Plausible a répondu ${rep.status} : ${detail}`);
  }
  return JSON.parse(texte).results;
}

const enObjet = (noms, valeurs) => Object.fromEntries(noms.map((n, i) => [n, valeurs[i] ?? 0]));

async function donneesReelles() {
  if (!CLE) {
    throw new Error('PLAUSIBLE_API_KEY manquante. Crée une clé dans Plausible : Settings → API keys.');
  }
  const top = (dimension, metrics, limit) => requete({
    metrics, date_range: cur.plage, dimensions: [dimension],
    order_by: [[metrics[0], 'desc']], pagination: { limit },
  }).then((r) => r.map((l) => ({ nom: l.dimensions[0], ...enObjet(metrics, l.metrics) })));

  const [agg, aggPrev, jours, sources, pages, pays, appareils, objectifs] = await Promise.all([
    requete({ metrics: AGREGATS, date_range: cur.plage }),
    requete({ metrics: AGREGATS, date_range: prev.plage }),
    requete({ metrics: ['visitors'], date_range: cur.plage, dimensions: ['time:day'] }),
    top('visit:source', ['visitors'], 6),
    top('event:page', ['visitors', 'pageviews'], 6),
    top('visit:country_name', ['visitors'], 5),
    top('visit:device', ['visitors'], 5),
    top('event:goal', ['visitors', 'events', 'conversion_rate'], 6),
  ]);

  const parJour = new Map(jours.map((l) => [l.dimensions[0].slice(0, 10), l.metrics[0]]));
  const mm = String(cur.m).padStart(2, '0');
  const serie = Array.from({ length: cur.jours }, (_, i) => {
    const date = `${cur.a}-${mm}-${String(i + 1).padStart(2, '0')}`;
    return { date, visiteurs: parJour.get(date) || 0 };
  });

  return {
    total: enObjet(AGREGATS, agg[0]?.metrics || []),
    avant: enObjet(AGREGATS, aggPrev[0]?.metrics || []),
    serie, sources, pages, pays, appareils, objectifs,
  };
}

function donneesDemo() {
  let graine = 7;
  const alea = () => ((graine = (graine * 16807) % 2147483647) / 2147483647);
  const mm = String(cur.m).padStart(2, '0');
  const serie = Array.from({ length: cur.jours }, (_, i) => {
    const jour = new Date(Date.UTC(cur.a, cur.m - 1, i + 1)).getUTCDay();
    const base = jour === 0 || jour === 6 ? 70 : 110;
    return { date: `${cur.a}-${mm}-${String(i + 1).padStart(2, '0')}`,
      visiteurs: Math.round(base + i * 1.6 + alea() * 45 + (i === 17 ? 160 : 0)) };
  });
  const visiteurs = Math.round(serie.reduce((s, j) => s + j.visiteurs, 0) * 0.82);
  return {
    total: { visitors: visiteurs, visits: Math.round(visiteurs * 1.31), pageviews: Math.round(visiteurs * 3.4),
      views_per_visit: 2.6, bounce_rate: 48, visit_duration: 134 },
    avant: { visitors: Math.round(visiteurs / 1.18), visits: Math.round(visiteurs * 1.24 / 1.18),
      pageviews: Math.round(visiteurs * 3.1 / 1.18), views_per_visit: 2.5, bounce_rate: 52, visit_duration: 121 },
    serie,
    sources: [['Google', 0.41], ['Direct / None', 0.22], ['Instagram', 0.17], ['Facebook', 0.08],
      ['TikTok', 0.06], ['Bing', 0.03]].map(([nom, p]) => ({ nom, visitors: Math.round(visiteurs * p) })),
    pages: [['/', 0.62, 1.2], ['/boutique', 0.38, 1.6], ['/produit/bougie-figue', 0.21, 1.3],
      ['/produit/coffret-hiver', 0.16, 1.2], ['/panier', 0.11, 1.5], ['/a-propos', 0.07, 1.0]]
      .map(([nom, p, r]) => ({ nom, visitors: Math.round(visiteurs * p), pageviews: Math.round(visiteurs * p * r) })),
    pays: [['France', 0.81], ['Belgique', 0.07], ['Suisse', 0.05], ['Canada', 0.03], ['Luxembourg', 0.01]]
      .map(([nom, p]) => ({ nom, visitors: Math.round(visiteurs * p) })),
    appareils: [['Mobile', 0.68], ['Desktop', 0.29], ['Tablet', 0.03]]
      .map(([nom, p]) => ({ nom, visitors: Math.round(visiteurs * p) })),
    objectifs: [['Ajout au panier', 0.112, 1.3], ['Paiement', 0.059, 1.0], ['Achat', 0.037, 1.0]]
      .map(([nom, p, e]) => ({ nom, visitors: Math.round(visiteurs * p), events: Math.round(visiteurs * p * e), conversion_rate: p * 100 })),
  };
}

/* ---------- Mise en forme ---------- */

const nf = new Intl.NumberFormat('fr-FR');
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const ent = (n) => nf.format(Math.round(n || 0));
const pct = (n) => `${nf1.format(n || 0)} %`;
const duree = (s) => { s = Math.round(s || 0); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`; };
const echap = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const NOMS = { 'Direct / None': 'Accès direct', Mobile: 'Téléphone', Desktop: 'Ordinateur', Tablet: 'Tablette', Laptop: 'Ordinateur portable' };
const nom = (n) => (n === '/' ? 'Accueil ( / )' : NOMS[n] || n);

function evolution(actuel, avant, unite = '%') {
  if (!avant) return '<span class="evo">premier mois mesuré</span>';
  const d = unite === 'pts' ? actuel - avant : ((actuel - avant) / avant) * 100;
  if (Math.abs(d) < 0.5) return `<span class="evo">stable vs ${MOIS_FR[prev.m - 1]}</span>`;
  const signe = d > 0 ? '+' : '−';
  return `<span class="evo">${d > 0 ? '▲' : '▼'} ${signe}${nf1.format(Math.abs(d))} ${unite === 'pts' ? 'pts' : '%'} vs ${MOIS_FR[prev.m - 1]}</span>`;
}

function tuile(libelle, valeur, evo, aide) {
  return `<div class="tuile"><div class="lib">${libelle}</div><div class="val">${valeur}</div>${evo}${aide ? `<div class="aide">${aide}</div>` : ''}</div>`;
}

function graphiqueJours(serie) {
  const L = 680, H = 150, G = 34, B = 22, max = Math.max(1, ...serie.map((j) => j.visiteurs));
  const pas = Math.pow(10, Math.floor(Math.log10(max)));
  const haut = Math.ceil(max / pas) * pas;
  const larg = (L - G) / serie.length;
  const y = (v) => H - B - (v / haut) * (H - B - 8);
  const grilles = [0, haut / 2, haut].map((v) =>
    `<line x1="${G}" x2="${L}" y1="${y(v)}" y2="${y(v)}" class="grille"/><text x="${G - 6}" y="${y(v) + 4}" class="axe" text-anchor="end">${ent(v)}</text>`).join('');
  const barres = serie.map((j, i) => {
    const x = G + i * larg + 1, w = Math.max(2, larg - 2), h = Math.max(0, H - B - y(j.visiteurs));
    const jour = Number(j.date.slice(8));
    const r = Math.min(4, w / 2, h);
    const d = h <= 0 ? '' : `M${x},${H - B} V${H - B - h + r} Q${x},${H - B - h} ${x + r},${H - B - h} H${x + w - r} Q${x + w},${H - B - h} ${x + w},${H - B - h + r} V${H - B} Z`;
    const etiquette = (jour === 1 || jour % 5 === 0) ? `<text x="${x + w / 2}" y="${H - 6}" class="axe" text-anchor="middle">${jour}</text>` : '';
    return `<g class="jour" data-info="${jour} ${MOIS_FR[cur.m - 1]} : ${ent(j.visiteurs)} visiteurs"><rect x="${G + i * larg}" y="0" width="${larg}" height="${H - B}" fill="transparent"/>${d ? `<path d="${d}" class="barre"/>` : ''}${etiquette}</g>`;
  }).join('');
  return `<svg viewBox="0 0 ${L} ${H}" class="graph" role="img" aria-label="Visiteurs par jour en ${MOIS_FR[cur.m - 1]}">${grilles}${barres}</svg>`;
}

function liste(titre, lignes, total, colonnes = []) {
  if (!lignes.length) return `<section class="bloc"><h3>${titre}</h3><p class="vide">Pas encore de données ce mois-ci.</p></section>`;
  const max = Math.max(1, ...lignes.map((l) => l.visitors));
  return `<section class="bloc"><h3>${titre}</h3><table>
    <thead><tr><th></th><th class="num">Visiteurs</th>${colonnes.map((c) => `<th class="num">${c.titre}</th>`).join('')}</tr></thead><tbody>
    ${lignes.map((l) => `<tr><td><div class="nom">${echap(nom(l.nom))}</div><div class="piste"><span style="width:${(l.visitors / max) * 100}%"></span></div></td>
      <td class="num">${ent(l.visitors)}${total ? `<span class="part"> · ${pct((l.visitors / total) * 100)}</span>` : ''}</td>
      ${colonnes.map((c) => `<td class="num">${c.f(l)}</td>`).join('')}</tr>`).join('')}
  </tbody></table></section>`;
}

function constats(d) {
  const t = d.total, out = [];
  if (d.avant.visitors) {
    const e = ((t.visitors - d.avant.visitors) / d.avant.visitors) * 100;
    out.push(Math.abs(e) < 0.5 ? `La fréquentation est stable par rapport à ${MOIS_FR[prev.m - 1]}.`
      : `Le site a ${e > 0 ? 'gagné' : 'perdu'} ${nf1.format(Math.abs(e))} % de visiteurs par rapport à ${MOIS_FR[prev.m - 1]}.`);
  }
  if (d.sources[0] && t.visitors) {
    out.push(`Première source de visites : <b>${echap(nom(d.sources[0].nom))}</b>, avec ${pct((d.sources[0].visitors / t.visitors) * 100)} des visiteurs.`);
  }
  const mobile = d.appareils.find((a) => a.nom === 'Mobile');
  if (mobile && t.visitors) out.push(`${pct((mobile.visitors / t.visitors) * 100)} des visiteurs viennent d'un téléphone.`);
  const pic = d.serie.reduce((a, b) => (b.visiteurs > a.visiteurs ? b : a), d.serie[0]);
  if (pic?.visiteurs) out.push(`Meilleur jour : le ${Number(pic.date.slice(8))} ${MOIS_FR[cur.m - 1]}, avec ${ent(pic.visiteurs)} visiteurs.`);
  const achat = d.objectifs[d.objectifs.length - 1];
  if (achat && d.objectifs.length > 1) out.push(`${pct(achat.conversion_rate)} des visiteurs vont jusqu'à « ${echap(achat.nom)} ».`);
  return out;
}

function page(d) {
  const t = d.total;
  const titreMois = `${MOIS_FR[cur.m - 1]} ${cur.a}`;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rapport ${echap(domaine)} — ${titreMois}</title>
<style>
:root{color-scheme:light;--fond:#ffffff;--surface:#f6f6f4;--texte:#0b0b0b;--texte-2:#52514e;--texte-3:#7a7974;--trait:#e4e3df;--serie:#2a78d6;--piste:#e9eef6;--note:#fff6d6}
@media screen and (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--fond:#121212;--surface:#1a1a19;--texte:#ffffff;--texte-2:#c3c2b7;--texte-3:#97968f;--trait:#2e2e2c;--serie:#3987e5;--piste:#24303f;--note:#3a3320}}
:root[data-theme="dark"]{color-scheme:dark;--fond:#121212;--surface:#1a1a19;--texte:#ffffff;--texte-2:#c3c2b7;--texte-3:#97968f;--trait:#2e2e2c;--serie:#3987e5;--piste:#24303f;--note:#3a3320}
*{box-sizing:border-box}
body{margin:0;background:var(--fond);color:var(--texte);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.feuille{max-width:820px;margin:0 auto;padding:32px 16px 48px}
header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:2px solid var(--texte);padding-bottom:12px;margin-bottom:20px;flex-wrap:wrap}
header h1{margin:0;font-size:24px;letter-spacing:-.01em}
header .site{color:var(--texte-2);font-size:15px}
header .agence{text-align:right;color:var(--texte-2);font-size:13px}
.tuiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}
.tuile{background:var(--surface);border-radius:10px;padding:12px 14px}
.tuile .lib{color:var(--texte-2);font-size:12.5px}
.tuile .val{font-size:24px;font-weight:650;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.evo{display:block;color:var(--texte-2);font-size:12px}
.aide{color:var(--texte-3);font-size:11.5px}
h2{font-size:15px;margin:22px 0 8px}
h3{font-size:13.5px;margin:0 0 6px}
.graph{width:100%;height:auto;display:block}
.grille{stroke:var(--trait);stroke-width:1}
.axe{fill:var(--texte-3);font-size:10px;font-variant-numeric:tabular-nums}
.barre{fill:var(--serie)}
.jour:hover .barre{opacity:.75}
.bulle{position:fixed;pointer-events:none;background:var(--texte);color:var(--fond);font-size:12px;padding:4px 8px;border-radius:6px;opacity:0;transition:opacity .1s}
.grille2{display:grid;grid-template-columns:1fr 1fr;gap:18px 22px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{color:var(--texte-3);font-weight:500;font-size:11.5px;text-align:left;padding:0 0 4px}
td{padding:4px 0;border-top:1px solid var(--trait);vertical-align:top}
.num{text-align:right;white-space:nowrap;padding-left:10px}
.nom{overflow-wrap:anywhere}
.part{color:var(--texte-3)}
.piste{height:4px;background:var(--piste);border-radius:2px;margin-top:3px}
.piste span{display:block;height:4px;background:var(--serie);border-radius:2px}
.vide{color:var(--texte-3);margin:0}
ul{margin:0;padding-left:18px}
li{margin:3px 0}
.a-remplir{background:var(--note);border-radius:6px;padding:8px 10px;outline:none;min-height:1.5em}
.a-remplir:focus{box-shadow:0 0 0 2px var(--serie)}
.consigne{color:var(--texte-3);font-size:12px;margin:4px 0 0}
footer{margin-top:28px;padding-top:10px;border-top:1px solid var(--trait);color:var(--texte-3);font-size:11.5px}
@media (max-width:640px){.tuiles{grid-template-columns:1fr 1fr}.grille2{grid-template-columns:1fr}}
@page{size:A4;margin:12mm}
@media print{.feuille{padding:0;max-width:none}.consigne,.bulle{display:none}.a-remplir{background:none;padding:0}body{font-size:12.5px}.tuile{break-inside:avoid}.bloc{break-inside:avoid}}
</style></head>
<body><div class="feuille">
<header>
  <div><h1>Rapport de ${titreMois}</h1><div class="site">${echap(domaine)}</div></div>
  <div class="agence"><b>${echap(AGENCE)}</b><br>Mesure d'audience sans cookie</div>
</header>

<div class="tuiles">
  ${tuile('Visiteurs', ent(t.visitors), evolution(t.visitors, d.avant.visitors), 'personnes différentes')}
  ${tuile('Visites', ent(t.visits), evolution(t.visits, d.avant.visits))}
  ${tuile('Pages vues', ent(t.pageviews), evolution(t.pageviews, d.avant.pageviews), `${nf1.format(t.views_per_visit)} par visite`)}
  ${tuile('Temps passé', duree(t.visit_duration), evolution(t.visit_duration, d.avant.visit_duration), 'par visite, en moyenne')}
  ${tuile('Repartis aussitôt', pct(t.bounce_rate), evolution(t.bounce_rate, d.avant.bounce_rate, 'pts'), 'visites d\'une seule page')}
  ${tuile('Conversions', d.objectifs.length ? ent(d.objectifs[d.objectifs.length - 1].events) : '—', d.objectifs.length ? `<span class="evo">${echap(d.objectifs[d.objectifs.length - 1].nom)}</span>` : '<span class="evo">aucun objectif défini</span>')}
</div>

<h2>Visiteurs par jour</h2>
${graphiqueJours(d.serie)}

<h2>Ce qu'il faut retenir</h2>
<ul>${constats(d).map((c) => `<li>${c}</li>`).join('')}</ul>

<h2>D'où viennent les visiteurs, et ce qu'ils regardent</h2>
<div class="grille2">
  ${liste('Sources', d.sources, t.visitors)}
  ${liste('Pages les plus vues', d.pages, 0, [{ titre: 'Vues', f: (l) => ent(l.pageviews) }])}
  ${liste('Pays', d.pays, t.visitors)}
  ${liste('Appareils', d.appareils, t.visitors)}
</div>

${d.objectifs.length ? `<h2>Du visiteur au client</h2>
${liste('Objectifs', d.objectifs, 0, [{ titre: 'Taux', f: (l) => pct(l.conversion_rate) }])}` : ''}

<h2>Mon analyse et mes recommandations</h2>
<div class="a-remplir" contenteditable="true">
  <ul>
    <li>[Ce qui a bien marché ce mois-ci, et pourquoi]</li>
    <li>[Ce qui a freiné : page qui fait fuir, source en baisse, étape du panier qui perd des clients]</li>
    <li>[Une ou deux actions simples à tester le mois prochain]</li>
  </ul>
</div>
<p class="consigne">Clique dans la zone jaune pour écrire, puis Ctrl+P → « Enregistrer en PDF ». Ce texte et le surlignage n'apparaissent pas à l'impression.</p>

<footer>Données du 1<sup>er</sup> au ${cur.jours} ${titreMois}, mesurées sans cookie et hébergées en Europe. Les visiteurs ne sont pas identifiés personnellement.</footer>
</div>
<div class="bulle" id="bulle"></div>
<script>
const b=document.getElementById('bulle');
document.querySelectorAll('.jour').forEach(g=>{
  g.addEventListener('mousemove',e=>{b.textContent=g.dataset.info;b.style.left=(e.clientX+12)+'px';b.style.top=(e.clientY-30)+'px';b.style.opacity=1});
  g.addEventListener('mouseleave',()=>{b.style.opacity=0});
});
</script>
</body></html>`;
}

/* ---------- Exécution ---------- */

try {
  const d = demo ? donneesDemo() : await donneesReelles();
  const dossier = path.join(ici, '..', 'rapports');
  fs.mkdirSync(dossier, { recursive: true });
  const fichier = path.join(dossier, `${demo ? 'demo' : domaine}-${mois}.html`);
  fs.writeFileSync(fichier, page(d));
  console.log(`Rapport créé : ${path.relative(process.cwd(), fichier) || fichier}`);
} catch (e) {
  const msg = e.cause?.code === 'ECONNREFUSED'
    ? `Impossible de joindre Plausible à ${URL_PLAUSIBLE}. Docker Desktop et Plausible sont-ils lancés ?`
    : e.message;
  console.error(msg);
  process.exit(1);
}
