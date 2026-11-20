const appConfig = window.LASTTRAY_CONFIG || {};
const SUPABASE_URL = appConfig.supabaseUrl || '';
const SUPABASE_ANON_KEY = appConfig.supabaseAnonKey || '';
let supabase = null;
let supabaseStartupError = '';
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load the Supabase browser client. Check your internet connection.'));
      document.head.append(script);
    });
    if (!window.supabase?.createClient) throw new Error('Supabase browser client did not load.');
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (error) {
    console.error(error);
    supabaseStartupError = error.message || 'Supabase could not be loaded.';
  }
}
const DEMO_MODE = !supabase;
const STORE = {
  listings: 'lasttray_demo_listings_v1',
  reservations: 'lasttray_demo_reservations_v1',
  profile: 'lasttray_demo_profile_v1'
};

const app = document.querySelector('#app');
const modalRoot = document.createElement('div');
modalRoot.id = 'modal-root';
document.body.append(modalRoot);
const toastRoot = document.createElement('div');
toastRoot.className = 'toast-region';
document.body.append(toastRoot);

let session = null;
let sellerProfile = null;
let allListings = [];
let activeCategory = 'All';
let activeSearch = '';
let activeArea = '';
let sellerTab = 'listings';
let reserveTarget = null;
let dashboardBusy = false;

const categories = ['All', 'Bakery', 'Bread', 'Puffs & savouries', 'Cakes & sweets', 'Grocery', 'Meals'];
const categoryEmoji = {
  Bakery: '🥐', Bread: '🍞', 'Puffs & savouries': '🥟', 'Cakes & sweets': '🧁', Grocery: '🥬', Meals: '🍱'
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
function rupees(value) { return `₹${Number(value || 0).toLocaleString('en-IN')}`; }
function toLocalInput(date) {
  const d = new Date(date);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}
function dateText(value) {
  const d = new Date(value);
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}
function dayTimeText(value) {
  const d = new Date(value);
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${dateText(value)}`;
}
function isToday(value) {
  const a = new Date(value); const b = new Date();
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function newPickupCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
function toast(message) {
  const node = document.createElement('div'); node.className = 'toast'; node.textContent = message; toastRoot.append(node);
  window.setTimeout(() => node.remove(), 3600);
}
function readStore(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeStore(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function seedListings() {
  const now = Date.now();
  return [
    {
      id: 'demo-1', item_name: 'Veg puff bundle', category: 'Puffs & savouries', description: 'A small batch of flaky veg puffs, packed for easy pickup.',
      original_price: 90, deal_price: 55, quantity_available: 5, prepared_at: new Date(now - 2.1 * 3600000).toISOString(),
      pickup_by: new Date(now + 2.3 * 3600000).toISOString(), shop_name: 'Demo Corner Bakery', area: 'Jayanagar',
      pickup_address: 'Illustrative pickup point · Jayanagar', allergens: 'Wheat, may contain dairy', emoji: '🥟', art: 'gold', status: 'active', is_demo: true
    },
    {
      id: 'demo-2', item_name: 'Whole-wheat bread', category: 'Bread', description: 'Freshly baked loaves from today’s batch. Best collected before the listed cutoff.',
      original_price: 70, deal_price: 45, quantity_available: 4, prepared_at: new Date(now - 3.2 * 3600000).toISOString(),
      pickup_by: new Date(now + 3.1 * 3600000).toISOString(), shop_name: 'Demo Oven & Crumb', area: 'HSR Layout',
      pickup_address: 'Illustrative pickup point · HSR Layout', allergens: 'Wheat, gluten', emoji: '🍞', art: 'green', status: 'active', is_demo: true
    },
    {
      id: 'demo-3', item_name: 'Mini tea-cake box', category: 'Cakes & sweets', description: 'A mixed box of mini tea cakes. Ingredients are listed by the shop.',
      original_price: 160, deal_price: 95, quantity_available: 3, prepared_at: new Date(now - 1.4 * 3600000).toISOString(),
      pickup_by: new Date(now + 1.7 * 3600000).toISOString(), shop_name: 'Demo Sugar Lane', area: 'Tumakuru',
      pickup_address: 'Illustrative pickup point · Tumakuru', allergens: 'Wheat, egg, dairy', emoji: '🧁', art: 'rose', status: 'active', is_demo: true
    },
    {
      id: 'demo-4', item_name: 'Seasonal fruit pack', category: 'Grocery', description: 'A small same-day fruit pack. Please check the items at pickup.',
      original_price: 120, deal_price: 80, quantity_available: 6, prepared_at: new Date(now - 1.0 * 3600000).toISOString(),
      pickup_by: new Date(now + 4.0 * 3600000).toISOString(), shop_name: 'Demo Daily Basket', area: 'Malleshwaram',
      pickup_address: 'Illustrative pickup point · Malleshwaram', allergens: 'No declared allergens', emoji: '🍊', art: 'blue', status: 'active', is_demo: true
    },
    {
      id: 'demo-5', item_name: 'Khara bun pair', category: 'Bakery', description: 'Two savoury buns from the current batch, available for a short pickup window.',
      original_price: 65, deal_price: 40, quantity_available: 4, prepared_at: new Date(now - 1.8 * 3600000).toISOString(),
      pickup_by: new Date(now + 2.0 * 3600000).toISOString(), shop_name: 'Demo Bakehouse', area: 'SIT Main Road',
      pickup_address: 'Illustrative pickup point · SIT Main Road', allergens: 'Wheat, dairy', emoji: '🥯', art: 'gold', status: 'active', is_demo: true
    },
    {
      id: 'demo-6', item_name: 'Evening snack combo', category: 'Meals', description: 'A small snack combo with a clearly stated same-day pickup deadline.',
      original_price: 140, deal_price: 85, quantity_available: 2, prepared_at: new Date(now - 2.6 * 3600000).toISOString(),
      pickup_by: new Date(now + 1.2 * 3600000).toISOString(), shop_name: 'Demo Street Kitchen', area: 'Koramangala',
      pickup_address: 'Illustrative pickup point · Koramangala', allergens: 'Ask the shop before reserving', emoji: '🍱', art: 'rose', status: 'active', is_demo: true
    }
  ];
}
function getDemoListings() {
  let listings = readStore(STORE.listings, null);
  if (!listings) listings = [];
  const sampleRows = listings.filter((item) => String(item.id).startsWith('demo-'));
  const userRows = listings.filter((item) => !String(item.id).startsWith('demo-'));
  const sampleTrayIsStale = sampleRows.length === 0 || sampleRows.every((item) => item.status !== 'active' || new Date(item.pickup_by).getTime() <= Date.now());
  if (!listings.length || sampleTrayIsStale) {
    listings = [...seedListings(), ...userRows];
    writeStore(STORE.listings, listings);
  }
  return listings;
}
function normalizeListing(row) {
  return {
    ...row,
    item_name: row.item_name || row.title || 'Surplus item',
    emoji: row.emoji || categoryEmoji[row.category] || '🥐',
    art: row.art || 'gold',
    is_demo: false
  };
}

function renderPage() {
  app.innerHTML = `
    <div class="site-shell">
      <div class="announcement"><div class="container"><span>🍞</span><span><strong>Good food deserves a second chance.</strong> Same-day surplus, picked up locally.</span></div></div>
      <header class="site-header">
        <div class="container nav-row">
          <a class="brand" href="#top" aria-label="LastTray home"><span class="brand-mark">LT</span><span class="brand-name">LastTray<span>.</span></span></a>
          <nav class="nav-links" id="nav-links" aria-label="Main navigation">
            <a href="#marketplace">Find a deal</a><a href="#how-it-works">How it works</a><a href="#for-shops">For shops</a><a href="#food-safety">Food safety</a>
          </nav>
          <div class="nav-actions"><button class="btn btn-dark btn-small" data-action="open-seller">List your surplus <span>↗</span></button><button class="mobile-menu" id="mobile-menu" aria-label="Open menu">☰</button></div>
        </div>
      </header>

      <main id="top">
        <section class="hero"><div class="container hero-grid">
          <div>
            <div class="eyebrow"><span class="dot"></span> A local surplus marketplace</div>
            <h1>Good food.<br/><em>Better timing.</em></h1>
            <p class="hero-copy">LastTray helps neighbourhood bakeries and grocery shops sell their same-day surplus to nearby people — before good food becomes waste.</p>
            <div class="hero-buttons"><a class="btn btn-primary" href="#marketplace">Explore today's tray <span>→</span></a><button class="btn btn-ghost" data-action="open-seller">I'm a shop owner <span>↗</span></button></div>
            <div class="hero-meta"><span><b>⌖</b> Designed for neighbourhood pickup</span><span><b>◷</b> Clear same-day cutoffs</span><span><b>♡</b> Less avoidable waste</span></div>
          </div>
          <div class="hero-visual" aria-label="Illustration of same-day food offers">
            <div class="hero-sun"></div>
            <div class="float-note note-one"><span class="note-icon">♻</span><span><strong>Less food wasted</strong><small>More value recovered</small></span></div>
            <div class="visual-board">
              <div class="visual-top"><strong>Today's nearby tray</strong><span class="live-pill">Same-day picks</span></div>
              <div class="visual-listing"><div class="food-thumb">🥐</div><div class="visual-item-info"><strong>Fresh puff bundle</strong><small>Nearby bakery · pickup by 7:30 PM</small></div><div class="visual-price"><strong>₹55</strong><small>₹90</small></div></div>
              <div class="visual-listing"><div class="food-thumb green">🍞</div><div class="visual-item-info"><strong>Whole-wheat bread</strong><small>Local bakehouse · pickup by 8 PM</small></div><div class="visual-price"><strong>₹45</strong><small>₹70</small></div></div>
              <div class="visual-listing"><div class="food-thumb pink">🧁</div><div class="visual-item-info"><strong>Mini tea-cake box</strong><small>Neighbourhood shop · pickup by 6 PM</small></div><div class="visual-price"><strong>₹95</strong><small>₹160</small></div></div>
              <div class="visual-foot"><span>Reserve nearby. Collect in time.</span><span>↗</span></div>
            </div>
            <div class="float-note note-two"><span class="note-icon">⏱</span><span><strong>Pickup deadline shown</strong><small>No next-day leftovers</small></span></div>
          </div>
        </div></section>

        <section class="trust-strip"><div class="container trust-row"><span class="trust-label">Built around real shop-floor friction</span><span class="trust-item"><b>15</b> short counter talks</span><span class="trust-item"><b>2</b> cities explored</span><span class="trust-item"><b>1</b> simple pickup loop</span></div></section>

        <section class="section marketplace" id="marketplace"><div class="container">
          <div class="section-head"><div><div class="section-kicker">The neighbourhood tray</div><h2>Good finds, while they're still good.</h2><p class="section-sub">Browse today's listed surplus, reserve what you need and collect it from the shop before its stated cutoff.</p></div><button class="btn btn-dark btn-small" data-action="open-seller">Have a shop? List an item ↗</button></div>
          <div id="market-alert"></div>
          <div class="market-toolbar"><label class="search-box"><span>⌕</span><input id="search-input" type="search" placeholder="Search bread, puffs, cakes…" aria-label="Search listings"/></label><select id="area-filter" class="filter-select" aria-label="Filter by area"><option value="">All areas</option><option>Bengaluru</option><option>Tumakuru</option><option>Jayanagar</option><option>HSR Layout</option><option>Koramangala</option><option>Malleshwaram</option><option>SIT Main Road</option></select><button class="btn btn-light btn-small" data-action="refresh-listings">↻ Refresh</button></div>
          <div class="filter-tabs" id="category-tabs">${categories.map((cat, i) => `<button class="filter-chip ${i === 0 ? 'active' : ''}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`).join('')}</div>
          <div class="listings-grid" id="listing-grid"><div class="empty-state"><strong>Loading today's tray…</strong>Please wait a moment.</div></div>
        </div></section>

        <section class="section section-white" id="how-it-works"><div class="container"><div class="section-head"><div><div class="section-kicker">Simple from start to finish</div><h2>From the last tray to a happy pickup.</h2><p class="section-sub">No complicated workflow. The shop decides what's eligible, the buyer reserves, and the item is collected before the shop's safe cutoff.</p></div></div>
          <div class="how-grid">
            <article class="how-card"><span class="how-icon">🧺</span><div class="step-number">01</div><h3>Shop posts what's left</h3><p>Add the item, quantity, price, prepared time and pickup deadline. A listing should take less than a minute.</p></article>
            <article class="how-card"><span class="how-icon">📍</span><div class="step-number">02</div><h3>Nearby buyers find it</h3><p>Residents, students, PGs and local businesses see what's available around them and reserve the quantity they need.</p></article>
            <article class="how-card"><span class="how-icon">🤝</span><div class="step-number">03</div><h3>Collect before cutoff</h3><p>The buyer gets a reservation code and picks up directly from the shop within the stated safe window.</p></article>
          </div>
        </div></section>

        <section class="section" id="for-shops"><div class="container"><div class="seller-band"><div><div class="section-kicker">For local shops</div><h2>Turn today's unsold stock into today's sale.</h2><p>When demand changes, good products can be left on the rack. LastTray gives you a simple way to reach nearby buyers without managing a long WhatsApp broadcast yourself.</p><button class="btn btn-primary" data-action="open-seller">Open seller dashboard <span>→</span></button></div><div class="seller-points"><div class="seller-point"><strong>01 · One quick listing</strong>Item, quantity, price and deadline in one place.</div><div class="seller-point"><strong>02 · Nearby demand</strong>Make offers visible to people around your shop.</div><div class="seller-point"><strong>03 · Clear reservations</strong>Know what has been reserved and what remains.</div><div class="seller-point"><strong>04 · Owner control</strong>Choose eligible items and set the pickup cutoff.</div></div></div></div></section>

        <section class="section safety-section" id="food-safety"><div class="container safety-grid"><div class="safety-stamp"><div class="stamp-inner"><span class="stamp-icon">🛡️</span><strong>Good food. Safe timing.</strong><small>LastTray does not extend shelf life.</small></div></div><div><div class="section-kicker">Non-negotiable</div><h2>Food safety comes first.</h2><p class="section-sub">LastTray is a way to reach buyers within a product's suitable selling window — not a way to sell expired or unsafe food.</p><div class="safety-list"><div class="safety-item"><span class="safety-check">✓</span><div><strong>No expired stock</strong><small>Expired or unsafe items must never be listed.</small></div></div><div class="safety-item"><span class="safety-check">✓</span><div><strong>Owner sets eligibility</strong><small>The shop decides what is safe and suitable to sell.</small></div></div><div class="safety-item"><span class="safety-check">✓</span><div><strong>Show the timing</strong><small>Prepared time and pickup-by time are visible.</small></div></div><div class="safety-item"><span class="safety-check">✓</span><div><strong>Share known allergens</strong><small>Buyers can check ingredient and allergen notes.</small></div></div></div></div></div></section>

        <section class="section section-white"><div class="container faq-grid"><div><div class="section-kicker">A few useful details</div><h2>Questions, answered.</h2><p class="section-sub">LastTray is being built for a small, local pilot. These are the operating principles behind the first version.</p></div><div class="faq-list">
          <details><summary>Does LastTray deliver the food?</summary><p>No. The first version is designed around direct pickup from the shop. The buyer reserves online and collects before the listed cutoff.</p></details>
          <details><summary>Can a shop list food for tomorrow?</summary><p>No. The concept focuses on same-day surplus. Short-life items must not be carried forward or resold the next day through LastTray.</p></details>
          <details><summary>Is payment handled on the website?</summary><p>Not in this MVP. Buyers reserve first and pay the shop at pickup, according to the shop's stated process. Online payments can be added after the pilot is validated.</p></details>
          <details><summary>Are the offers on this page live?</summary><p>Without a connected Supabase project, the website runs in demo mode with illustrative sample listings. Connect the backend to publish real listings across devices.</p></details>
        </div></div></section>

        <section class="final-cta"><div class="container final-cta-row"><div><h2>Make the last tray count.</h2><p>Better reach for shops. Better finds for neighbours. Less avoidable waste.</p></div><div class="hero-buttons"><a class="btn btn-dark" href="#marketplace">Find today's tray →</a><button class="btn btn-primary" data-action="open-seller">List your surplus ↗</button></div></div></section>
      </main>

      <footer class="site-footer"><div class="container"><div class="footer-top"><div class="footer-brand"><a class="brand" href="#top"><span class="brand-mark">LT</span><span class="brand-name">LastTray<span>.</span></span></a><p>A same-day surplus channel connecting small bakeries and grocery shops with nearby buyers. Built around simple listings, clear cutoffs and safe pickup.</p></div><div class="footer-links"><div><strong>Explore</strong><a href="#marketplace">Today's tray</a><a href="#how-it-works">How it works</a><a href="#food-safety">Food safety</a></div><div><strong>Get involved</strong><button data-action="open-seller">List as a shop</button><a href="https://www.instagram.com/reel/Df9KaY-KvMi/?evlk=MWZ2bXFoYWI1bGNvbw==" target="_blank" rel="noopener">Our project reel ↗</a></div></div></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} LastTray · Workshop project</span><span>Team: <strong>Utkarsh · Ankit · Aditya · Gautam · Ranjan</strong></span></div></div></footer>
    </div>`;

  document.querySelector('#mobile-menu').addEventListener('click', () => document.querySelector('#nav-links').classList.toggle('open'));
  document.querySelectorAll('#nav-links a').forEach((link) => link.addEventListener('click', () => document.querySelector('#nav-links').classList.remove('open')));
  document.querySelector('#search-input').addEventListener('input', (event) => { activeSearch = event.target.value.trim().toLowerCase(); renderListings(); });
  document.querySelector('#area-filter').addEventListener('change', (event) => { activeArea = event.target.value; renderListings(); });
  document.querySelector('#category-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]'); if (!button) return;
    activeCategory = button.dataset.category;
    document.querySelectorAll('.filter-chip').forEach((chip) => chip.classList.toggle('active', chip === button));
    renderListings();
  });
  document.addEventListener('click', handleGlobalClick);
  document.addEventListener('submit', handleFormSubmit);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
}

function marketNotice() {
  const node = document.querySelector('#market-alert');
  if (!node) return;
  node.innerHTML = DEMO_MODE
    ? `<div class="demo-alert"><span>ⓘ</span><span><strong>Preview mode:</strong> these are illustrative sample listings, not live shop inventory. ${supabaseStartupError ? `The live connection could not start: ${escapeHtml(supabaseStartupError)}. ` : ''}Connect Supabase to share real listings and reservations across devices.</span></div>`
    : `<div class="demo-alert" style="background:#edf4eb;border-color:#d7e5d4;color:#4d6d53"><span>✓</span><span><strong>Live marketplace:</strong> listings are loaded from the connected LastTray database. Always confirm item condition and pickup details with the shop.</span></div>`;
}

async function loadListings() {
  marketNotice();
  if (DEMO_MODE) {
    allListings = getDemoListings().filter((item) => item.status === 'active' && new Date(item.pickup_by).getTime() > Date.now() && item.quantity_available > 0);
  } else {
    const { data, error } = await supabase.from('listings').select('*').eq('status', 'active').gt('pickup_by', new Date().toISOString()).gt('quantity_available', 0).order('pickup_by', { ascending: true });
    if (error) { console.error(error); toast('Could not load live listings. Check the database setup.'); allListings = []; }
    else allListings = (data || []).map(normalizeListing);
  }
  renderListings();
}

function areaMatches(listing, filter) {
  if (!filter) return true;
  const haystack = `${listing.area || ''} ${listing.pickup_address || ''}`.toLowerCase();
  if (filter === 'Bengaluru') return /bengaluru|bangalore|jayanagar|hsr|koramangala|malleshwaram|rajajinagar|vidyaranyapura/i.test(haystack);
  if (filter === 'Tumakuru') return /tumakuru|tumkur|sit main/i.test(haystack);
  return haystack.includes(filter.toLowerCase());
}

function listingCard(item) {
  const saving = Math.max(0, Math.round((1 - Number(item.deal_price) / Math.max(1, Number(item.original_price))) * 100));
  const qtyLabel = Number(item.quantity_available) === 1 ? '1 left' : `${item.quantity_available} left`;
  const emoji = escapeHtml(item.emoji || categoryEmoji[item.category] || '🥐');
  const art = escapeHtml(item.art || 'gold');
  return `<article class="listing-card">
    <div class="card-art ${art}"><span class="card-tag">${escapeHtml(item.category || 'Same-day pick')}</span>${saving > 0 ? `<span class="card-savings">${saving}% OFF</span>` : ''}<span class="card-emoji">${emoji}</span></div>
    <div class="card-body"><div class="card-shop">⌂ ${escapeHtml(item.shop_name || 'Local shop')} ${item.is_demo ? '<span class="mini-status">DEMO</span>' : ''}</div>
      <div class="card-title-row"><h3 class="card-title">${escapeHtml(item.item_name)}</h3></div>
      <div class="card-location">⌖ ${escapeHtml(item.area || 'Nearby')} · Pickup only</div>
      <div class="card-meta"><span>◷ Pickup by <strong>${escapeHtml(dateText(item.pickup_by))}</strong></span><span>▦ ${escapeHtml(qtyLabel)}</span></div>
      <div class="card-bottom"><div class="card-price"><strong>${rupees(item.deal_price)}</strong> <del>${rupees(item.original_price)}</del></div><button class="btn btn-primary btn-small" data-action="reserve" data-id="${escapeHtml(item.id)}">Reserve →</button></div>
    </div></article>`;
}

function renderListings() {
  const grid = document.querySelector('#listing-grid'); if (!grid) return;
  const filtered = allListings.filter((item) => {
    const matchesCategory = activeCategory === 'All' || item.category === activeCategory || (activeCategory === 'Bakery' && ['Bread', 'Puffs & savouries', 'Cakes & sweets'].includes(item.category));
    const searchable = `${item.item_name} ${item.shop_name} ${item.area} ${item.category} ${item.description}`.toLowerCase();
    return matchesCategory && (!activeSearch || searchable.includes(activeSearch)) && areaMatches(item, activeArea);
  });
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state"><strong>No matching items right now.</strong>Try another category or area. Shops add new offers as surplus becomes available.<br/><button class="btn btn-dark btn-small" style="margin-top:16px" data-action="reset-filters">Clear filters</button></div>`;
    return;
  }
  grid.innerHTML = filtered.map(listingCard).join('');
}

function showModal(content, wide = false) {
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">${content}</section></div>`;
  modalRoot.querySelector('.modal').addEventListener('click', (event) => event.stopPropagation());
  const close = modalRoot.querySelector('[data-action="close-modal"]');
  if (close) close.addEventListener('click', closeModal);
}
function closeModal() { modalRoot.innerHTML = ''; reserveTarget = null; }
function modalHeader(title, subtitle = '') {
  return `<div class="modal-header"><div><h3>${title}</h3><p>${subtitle}</p></div><button class="modal-close" type="button" data-action="close-modal" aria-label="Close">×</button></div>`;
}

function openReserve(id) {
  const item = allListings.find((listing) => String(listing.id) === String(id));
  if (!item) { toast('This item is no longer available. Refresh the tray.'); return; }
  reserveTarget = item;
  showModal(`${modalHeader('Reserve your pickup', `${escapeHtml(item.item_name)} · ${escapeHtml(item.shop_name)} · pickup by ${escapeHtml(dateText(item.pickup_by))}`)}
    <div class="notice">Your name and contact number are shared with this shop for pickup coordination, not shown publicly. No payment is collected on this website. Please collect before the listed cutoff.</div>
    <form id="reserve-form"><div class="form-grid">
      <div class="form-field full"><label for="buyer-name">YOUR NAME</label><input id="buyer-name" name="customer_name" required maxlength="70" placeholder="Name for the reservation" autocomplete="name" /></div>
      <div class="form-field full"><label for="buyer-phone">MOBILE NUMBER</label><input id="buyer-phone" name="customer_phone" required inputmode="tel" minlength="8" maxlength="16" placeholder="Your contact number" autocomplete="tel" /></div>
      <div class="form-field"><label for="reserve-qty">QUANTITY</label><select id="reserve-qty" name="quantity">${Array.from({ length: Math.min(5, Number(item.quantity_available)) }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></div>
      <div class="form-field"><label>PRICE PER UNIT</label><input value="${rupees(item.deal_price)}" disabled /></div>
      <div class="form-field full"><small class="form-help">By reserving, you agree to collect within the pickup window and check the item, ingredients and allergen notes with the shop.</small></div>
    </div><div class="form-actions"><button class="btn btn-primary" type="submit">Confirm reservation ↗</button></div></form>`);
}

function reservationConfirmation(result, item) {
  showModal(`<div class="confirmation"><div class="confirm-check">✓</div><h3>You're on the list.</h3><p>Your reservation has been created. Show this code to the shop when you arrive and collect before <strong>${escapeHtml(dateText(result.pickup_by || item.pickup_by))}</strong>.</p><div class="pickup-code" id="pickup-code-value">${escapeHtml(result.pickup_code)}</div><button class="btn btn-light btn-small" type="button" data-action="copy-code" data-code="${escapeHtml(result.pickup_code)}">Copy pickup code</button><p><strong>${escapeHtml(item.shop_name)}</strong><br/>${escapeHtml(item.pickup_address || item.area || '')}</p><div class="notice">No online payment was taken. Confirm the item and amount at pickup. Please don't arrive after the cutoff.</div><button class="btn btn-dark" data-action="close-modal">Done</button></div>`);
}

function localCreateReservation(payload) {
  const listings = readStore(STORE.listings, seedListings());
  const item = listings.find((listing) => String(listing.id) === String(payload.listing_id));
  if (!item || item.status !== 'active' || Number(item.quantity_available) < payload.quantity || new Date(item.pickup_by) <= new Date()) throw new Error('This quantity is no longer available. Refresh the tray.');
  item.quantity_available = Number(item.quantity_available) - payload.quantity;
  if (item.quantity_available <= 0) item.status = 'sold_out';
  writeStore(STORE.listings, listings);
  const reservation = { id: `demo-res-${Date.now()}`, listing_id: item.id, seller_id: item.seller_id || 'demo-seller', customer_name: payload.customer_name, customer_phone: payload.customer_phone, quantity: payload.quantity, status: 'reserved', pickup_code: newPickupCode(), created_at: new Date().toISOString() };
  const reservations = readStore(STORE.reservations, []); reservations.unshift(reservation); writeStore(STORE.reservations, reservations);
  return { ...reservation, pickup_by: item.pickup_by, shop_name: item.shop_name, pickup_address: item.pickup_address };
}

function sellerAuthContent(message = '') {
  return `${modalHeader('Seller sign in', 'Get a secure sign-in link by email to manage your shop and listings.')}
    ${message ? `<div class="notice">${escapeHtml(message)}</div>` : ''}
    <form id="seller-auth-form"><div class="form-grid"><div class="form-field full"><label for="seller-email">SHOP OWNER EMAIL</label><input id="seller-email" name="email" type="email" required autocomplete="email" placeholder="you@yourshop.com" /></div><div class="form-field full"><small class="form-help">We'll email you a one-time sign-in link. No password needed. Add your Vercel domain to Supabase Auth redirect URLs after deployment.</small></div></div><div class="form-actions"><button class="btn btn-primary" type="submit">Email my sign-in link →</button></div></form>`;
}

async function openSellerDashboard() {
  if (DEMO_MODE) {
    sellerProfile = readStore(STORE.profile, null);
    renderSellerDashboard();
    return;
  }
  if (!session) { showModal(sellerAuthContent()); return; }
  const { data, error } = await supabase.from('seller_profiles').select('*').eq('user_id', session.user.id).maybeSingle();
  if (error) { console.error(error); toast('Could not load your shop profile.'); return; }
  sellerProfile = data;
  renderSellerDashboard();
}

function profileForm() {
  const profile = sellerProfile || {};
  return `<form id="seller-profile-form"><div class="form-grid">
    <div class="form-field full"><label for="shop-name">SHOP / BUSINESS NAME</label><input id="shop-name" name="shop_name" required maxlength="90" value="${escapeHtml(profile.shop_name || '')}" placeholder="e.g. Sunrise Bakery" /></div>
    <div class="form-field"><label for="shop-phone">CONTACT NUMBER</label><input id="shop-phone" name="contact_phone" required maxlength="16" value="${escapeHtml(profile.contact_phone || '')}" placeholder="Shop contact number" /></div>
    <div class="form-field"><label for="shop-area">AREA / LOCALITY</label><input id="shop-area" name="area" required maxlength="90" value="${escapeHtml(profile.area || '')}" placeholder="e.g. Jayanagar" /></div>
    <div class="form-field full"><label for="shop-address">PICKUP ADDRESS</label><input id="shop-address" name="pickup_address" required maxlength="180" value="${escapeHtml(profile.pickup_address || '')}" placeholder="Street, landmark and shop location" /></div>
  </div><div class="form-actions"><button class="btn btn-primary" type="submit">Save shop details</button></div></form>`;
}

function newListingForm() {
  const now = new Date(); const later = new Date(now.getTime() + 2 * 3600000);
  const todayEnd = new Date(now); todayEnd.setHours(23, 30, 0, 0);
  const pickupDefault = later > todayEnd ? todayEnd : later;
  return `<form id="new-listing-form"><div class="form-grid">
    <div class="form-field full"><label for="item-name">ITEM NAME</label><input id="item-name" name="item_name" required maxlength="90" placeholder="e.g. Veg puff bundle" /></div>
    <div class="form-field"><label for="item-category">CATEGORY</label><select id="item-category" name="category">${categories.filter((c) => c !== 'All').map((c) => `<option>${escapeHtml(c)}</option>`).join('')}</select></div>
    <div class="form-field"><label for="item-quantity">QUANTITY AVAILABLE</label><input id="item-quantity" name="quantity_available" type="number" min="1" max="500" required value="5" /></div>
    <div class="form-field"><label for="original-price">REGULAR PRICE (₹)</label><input id="original-price" name="original_price" type="number" min="1" step="1" required placeholder="100" /></div>
    <div class="form-field"><label for="deal-price">LASTTRAY PRICE (₹)</label><input id="deal-price" name="deal_price" type="number" min="1" step="1" required placeholder="60" /></div>
    <div class="form-field"><label for="prepared-at">PREPARED / PACKED AT</label><input id="prepared-at" name="prepared_at" type="datetime-local" required value="${toLocalInput(now)}" /></div>
    <div class="form-field"><label for="pickup-by">PICKUP BEFORE</label><input id="pickup-by" name="pickup_by" type="datetime-local" required value="${toLocalInput(pickupDefault)}" /></div>
    <div class="form-field full"><label for="item-description">ITEM DETAILS</label><textarea id="item-description" name="description" maxlength="260" placeholder="What's included? Any handling or pickup notes?"></textarea></div>
    <div class="form-field full"><label for="item-allergens">INGREDIENTS / ALLERGENS (WHERE KNOWN)</label><input id="item-allergens" name="allergens" maxlength="180" placeholder="e.g. wheat, dairy, nuts; or ask the shop" /></div>
    <div class="form-field full"><small class="form-help">Only list food your shop considers safe and suitable to sell. Never list expired or unsafe items. The pickup cutoff must be today.</small></div>
  </div><div class="form-actions"><button class="btn btn-primary" type="submit">Publish today's offer ↗</button></div></form>`;
}

async function getSellerListings() {
  if (DEMO_MODE) return readStore(STORE.listings, seedListings()).filter((item) => item.seller_id === 'demo-seller');
  const { data, error } = await supabase.from('listings').select('*').eq('seller_id', session.user.id).order('created_at', { ascending: false });
  if (error) throw error; return data || [];
}
async function getSellerReservations() {
  if (DEMO_MODE) {
    const mine = readStore(STORE.listings, seedListings()).filter((item) => item.seller_id === 'demo-seller').map((x) => x.id);
    return readStore(STORE.reservations, []).filter((r) => mine.includes(r.listing_id)).map((r) => ({ ...r, listings: readStore(STORE.listings, seedListings()).find((x) => x.id === r.listing_id) }));
  }
  const { data, error } = await supabase.from('reservations').select('id, listing_id, customer_name, customer_phone, quantity, status, pickup_code, created_at, listings(item_name, shop_name, pickup_by, pickup_address)').eq('seller_id', session.user.id).order('created_at', { ascending: false });
  if (error) throw error; return data || [];
}

async function renderSellerDashboard() {
  dashboardBusy = true;
  showModal(`${modalHeader('Seller dashboard', DEMO_MODE ? 'Demo workspace · changes stay in this browser.' : `Signed in as ${escapeHtml(session?.user?.email || '')}`)}<div class="notice">${DEMO_MODE ? 'Demo mode is for testing the experience. Connect Supabase to save shop listings and reservations online.' : 'Your listings are visible to nearby buyers while active. You control item eligibility and pickup cutoffs.'}</div><div id="seller-dashboard-content"><div class="empty-state"><strong>Loading your shop…</strong></div></div>`, true);
  try {
    if (sellerProfile) {
      const [listings, reservations] = await Promise.all([getSellerListings(), getSellerReservations()]);
      const activeCount = listings.filter((x) => x.status === 'active').length;
      const content = `
        <div class="dashboard-tabs"><button class="${sellerTab === 'listings' ? 'active' : ''}" data-action="seller-tab" data-tab="listings">My listings (${activeCount})</button><button class="${sellerTab === 'reservations' ? 'active' : ''}" data-action="seller-tab" data-tab="reservations">Reservations (${reservations.length})</button><button class="${sellerTab === 'profile' ? 'active' : ''}" data-action="seller-tab" data-tab="profile">Shop profile</button></div>
        ${sellerTab === 'profile' ? profileForm() : sellerTab === 'reservations' ? renderReservations(reservations) : `<div class="notice">Posting rule: only same-day items. Set a cutoff before the food is no longer suitable to sell.</div>${newListingForm()}<div style="height:1px;background:var(--line);margin:22px 0"></div><h4 style="color:var(--green);margin:0 0 12px;font-family:Manrope">Your offers</h4><div class="dashboard-list">${listings.length ? listings.map(renderSellerListing).join('') : '<div class="empty-state"><strong>No offers yet.</strong>Add your first same-day listing above.</div>'}</div>`}
      `;
      const target = document.querySelector('#seller-dashboard-content'); if (target) target.innerHTML = content;
    } else {
      const target = document.querySelector('#seller-dashboard-content'); if (target) target.innerHTML = `<div class="notice">Set up your shop details once. These details will appear on each listing so buyers know where to collect.</div>${profileForm()}`;
    }
  } catch (error) {
    console.error(error); const target = document.querySelector('#seller-dashboard-content'); if (target) target.innerHTML = `<div class="notice error">Could not load seller information: ${escapeHtml(error.message || 'Unknown error')}</div><button class="btn btn-light" data-action="seller-refresh">Try again</button>`;
  } finally { dashboardBusy = false; }
}

function renderSellerListing(item) {
  const status = item.status || 'active';
  return `<div class="dashboard-row"><div><strong>${escapeHtml(item.item_name || 'Surplus item')}</strong><small>${escapeHtml(item.category || '')} · ${item.quantity_available} remaining · pickup by ${escapeHtml(dateText(item.pickup_by))} · ${rupees(item.deal_price)}</small></div><div class="dashboard-row-actions"><span class="mini-status ${status !== 'active' ? 'sold' : ''}">${escapeHtml(status.replace('_', ' '))}</span>${status === 'active' ? `<button class="btn btn-light btn-small" data-action="mark-sold" data-id="${escapeHtml(item.id)}">Mark unavailable</button>` : ''}</div></div>`;
}
function renderReservations(rows) {
  if (!rows.length) return `<div class="empty-state"><strong>No reservations yet.</strong>New buyer reservations will show up here.</div>`;
  return `<div class="dashboard-list">${rows.map((row) => `<div class="dashboard-row"><div><strong>${escapeHtml(row.customer_name)} · ${escapeHtml(row.listings?.item_name || 'Your listing')}</strong><small>${escapeHtml(row.customer_phone)} · Qty ${row.quantity} · Pickup code ${escapeHtml(row.pickup_code)}<br/>${escapeHtml(row.created_at ? dayTimeText(row.created_at) : '')}</small></div><div class="dashboard-row-actions"><span class="mini-status ${row.status === 'collected' ? 'sold' : ''}">${escapeHtml(row.status)}</span>${row.status === 'reserved' ? `<button class="btn btn-light btn-small" data-action="mark-collected" data-id="${escapeHtml(row.id)}">Mark collected</button>` : ''}</div></div>`).join('')}</div>`;
}

async function saveSellerProfile(form) {
  const payload = Object.fromEntries(new FormData(form));
  payload.shop_name = payload.shop_name.trim(); payload.area = payload.area.trim(); payload.pickup_address = payload.pickup_address.trim(); payload.contact_phone = payload.contact_phone.trim();
  if (DEMO_MODE) {
    sellerProfile = { ...payload, user_id: 'demo-seller' }; writeStore(STORE.profile, sellerProfile);
  } else {
    const { data, error } = await supabase.from('seller_profiles').upsert({ ...payload, user_id: session.user.id }, { onConflict: 'user_id' }).select().single();
    if (error) throw error; sellerProfile = data;
  }
  sellerTab = 'listings'; toast('Shop profile saved. You can publish your first offer.'); await renderSellerDashboard();
}

function toISOFromLocalInput(value) { const date = new Date(value); if (Number.isNaN(date.getTime())) throw new Error('Please enter a valid date and time.'); return date.toISOString(); }
async function createSellerListing(form) {
  if (!sellerProfile) throw new Error('Save your shop profile before publishing an offer.');
  const values = Object.fromEntries(new FormData(form));
  const preparedAt = toISOFromLocalInput(values.prepared_at); const pickupBy = toISOFromLocalInput(values.pickup_by);
  const now = new Date();
  if (new Date(pickupBy) <= now) throw new Error('Pickup deadline must be in the future.');
  if (!isToday(pickupBy)) throw new Error('LastTray listings are for same-day pickup. Choose a cutoff later today.');
  if (new Date(preparedAt) > now) throw new Error('Prepared / packed time cannot be in the future.');
  if (new Date(pickupBy) <= new Date(preparedAt)) throw new Error('Pickup cutoff must be after the prepared / packed time.');
  const quantity = Number(values.quantity_available); const original = Number(values.original_price); const deal = Number(values.deal_price);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) throw new Error('Enter a valid quantity.');
  if (!(original > 0 && deal > 0 && deal <= original)) throw new Error('The LastTray price must be positive and no higher than the regular price.');
  const payload = {
    item_name: values.item_name.trim(), category: values.category, description: values.description.trim(), allergens: values.allergens.trim(),
    original_price: original, deal_price: deal, quantity_available: quantity, prepared_at: preparedAt, pickup_by: pickupBy,
    shop_name: sellerProfile.shop_name, area: sellerProfile.area, pickup_address: sellerProfile.pickup_address,
    seller_id: DEMO_MODE ? 'demo-seller' : session.user.id, status: 'active'
  };
  if (DEMO_MODE) {
    const listings = readStore(STORE.listings, seedListings());
    listings.unshift({ ...payload, id: `seller-${Date.now()}`, emoji: categoryEmoji[payload.category] || '🥐', art: 'green', is_demo: true, created_at: new Date().toISOString() });
    writeStore(STORE.listings, listings);
  } else {
    const { error } = await supabase.from('listings').insert(payload);
    if (error) throw error;
  }
  toast('Your same-day offer is live.'); sellerTab = 'listings'; await renderSellerDashboard(); await loadListings();
}

async function updateListingStatus(id, status) {
  if (DEMO_MODE) {
    const listings = readStore(STORE.listings, seedListings()); const item = listings.find((x) => String(x.id) === String(id));
    if (item) { item.status = status; if (status === 'sold_out') item.quantity_available = 0; }
    writeStore(STORE.listings, listings);
  } else {
    const { error } = await supabase.from('listings').update({ status, ...(status === 'sold_out' ? { quantity_available: 0 } : {}) }).eq('id', id).eq('seller_id', session.user.id);
    if (error) throw error;
  }
  toast('Listing updated.'); await renderSellerDashboard(); await loadListings();
}

async function markReservationCollected(id) {
  if (DEMO_MODE) {
    const rows = readStore(STORE.reservations, []); const row = rows.find((r) => r.id === id); if (row) row.status = 'collected'; writeStore(STORE.reservations, rows);
  } else {
    const { error } = await supabase.from('reservations').update({ status: 'collected', collected_at: new Date().toISOString() }).eq('id', id).eq('seller_id', session.user.id);
    if (error) throw error;
  }
  toast('Pickup marked as collected.'); await renderSellerDashboard();
}

async function handleGlobalClick(event) {
  const actionEl = event.target.closest('[data-action]'); if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === 'backdrop-close' && event.target === actionEl) { closeModal(); return; }
  if (action === 'close-modal') { closeModal(); return; }
  if (action === 'open-seller') { await openSellerDashboard(); return; }
  if (action === 'reserve') { openReserve(actionEl.dataset.id); return; }
  if (action === 'refresh-listings') { await loadListings(); toast('Tray refreshed.'); return; }
  if (action === 'reset-filters') { activeCategory = 'All'; activeSearch = ''; activeArea = ''; document.querySelector('#search-input').value = ''; document.querySelector('#area-filter').value = ''; document.querySelectorAll('.filter-chip').forEach((x) => x.classList.toggle('active', x.dataset.category === 'All')); renderListings(); return; }
  if (action === 'seller-tab') { sellerTab = actionEl.dataset.tab; await renderSellerDashboard(); return; }
  if (action === 'seller-refresh') { await openSellerDashboard(); return; }
  if (action === 'mark-sold') { try { await updateListingStatus(actionEl.dataset.id, 'sold_out'); } catch (error) { toast(error.message); } return; }
  if (action === 'mark-collected') { try { await markReservationCollected(actionEl.dataset.id); } catch (error) { toast(error.message); } return; }
  if (action === 'copy-code') {
    try { await navigator.clipboard.writeText(actionEl.dataset.code || ''); toast('Pickup code copied.'); }
    catch { toast('Please take a screenshot of your pickup code.'); }
    return;
  }
  if (action === 'sign-out') { if (supabase) await supabase.auth.signOut(); session = null; sellerProfile = null; closeModal(); toast('Signed out.'); return; }
}

async function handleFormSubmit(event) {
  const form = event.target;
  if (!form.id) return;
  if (form.id === 'reserve-form') {
    event.preventDefault();
    if (!reserveTarget) return;
    const formData = Object.fromEntries(new FormData(form));
    const phoneDigits = String(formData.customer_phone).replace(/\D/g, '');
    if (phoneDigits.length < 8 || phoneDigits.length > 15) { toast('Enter a valid mobile number.'); return; }
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true; submit.textContent = 'Reserving…';
    try {
      const payload = { listing_id: reserveTarget.id, customer_name: String(formData.customer_name).trim(), customer_phone: String(formData.customer_phone).trim(), quantity: Number(formData.quantity) };
      let result;
      if (DEMO_MODE) result = localCreateReservation(payload);
      else {
        const { data, error } = await supabase.rpc('reserve_listing', { p_listing_id: payload.listing_id, p_customer_name: payload.customer_name, p_customer_phone: payload.customer_phone, p_quantity: payload.quantity });
        if (error) throw error;
        result = Array.isArray(data) ? data[0] : data;
      }
      const item = reserveTarget; reservationConfirmation(result, item); await loadListings();
    } catch (error) { console.error(error); submit.disabled = false; submit.textContent = 'Confirm reservation ↗'; toast(error.message || 'Reservation could not be completed.'); }
    return;
  }
  if (form.id === 'seller-auth-form') {
    event.preventDefault(); const email = new FormData(form).get('email'); const button = form.querySelector('[type="submit"]'); button.disabled = true; button.textContent = 'Sending link…';
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) { button.disabled = false; button.textContent = 'Email my sign-in link →'; toast(error.message); }
    else { form.innerHTML = `<div class="notice">Sign-in link sent to <strong>${escapeHtml(email)}</strong>. Open it on this device to continue. Check your spam folder if it doesn't arrive.</div>`; toast('Check your email for the sign-in link.'); }
    return;
  }
  if (form.id === 'seller-profile-form') {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); button.disabled = true; button.textContent = 'Saving…';
    try { await saveSellerProfile(form); } catch (error) { toast(error.message || 'Could not save shop details.'); button.disabled = false; button.textContent = 'Save shop details'; }
    return;
  }
  if (form.id === 'new-listing-form') {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); button.disabled = true; button.textContent = 'Publishing…';
    try { await createSellerListing(form); } catch (error) { toast(error.message || 'Could not publish listing.'); button.disabled = false; button.textContent = "Publish today's offer ↗"; }
  }
}

async function initialise() {
  renderPage();
  if (supabase) {
    const { data } = await supabase.auth.getSession(); session = data.session;
    supabase.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      if (session && modalRoot.innerHTML) { openSellerDashboard(); }
    });
  }
  await loadListings();
  window.__LASTTRAY_APP_READY__ = true;
}

initialise().catch((error) => {
  console.error(error);
  app.innerHTML = `<div class="container" style="padding:60px 0"><h1>LastTray couldn't load.</h1><p>Please refresh the page. ${escapeHtml(error.message || '')}</p></div>`;
});
