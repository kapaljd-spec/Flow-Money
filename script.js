import {
  APP_NAME,
  APP_URL,
  TELEGRAM_BOT_URL,
  TELEGRAM_CTA_URL,
  TELEGRAM_START_PARAMETER,
} from './src/config/app.js';
import { isFirebaseConfigured } from './src/config/firebase.js';
import {
  signInWithEmail,
  signInWithMicrosoft,
  signOutUser,
  signUpWithEmail,
  subscribeToAuth,
} from './src/services/firebaseAuth.js';

let mountDashboard = null;
try {
  ({ mountDashboard } = await import('./src/services/dashboardApp.js'));
} catch {
  console.warn('FlowMoney dashboard module is unavailable.');
}

const authState = {
  mode: 'signin',
  user: null,
  message: '',
  error: '',
};

const themeState = {
  mode: localStorage.getItem('flowmoney-theme') || 'light',
};

function applyTheme(mode) {
  const nextMode = mode === 'dark' ? 'dark' : 'light';
  themeState.mode = nextMode;
  document.body.setAttribute('data-theme', nextMode);
  localStorage.setItem('flowmoney-theme', nextMode);

  const toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    toggle.textContent = nextMode === 'dark' ? '☀️ Light' : '🌙 Dark';
    toggle.setAttribute('aria-label', nextMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
}

const features = [
  {
    icon: '⚡',
    title: 'Quick Expense Tracking',
    text: 'Catat pengeluaran hanya dalam beberapa detik.'
  },
  {
    icon: '📈',
    title: 'Smart Cashflow',
    text: 'Lihat pemasukan, pengeluaran, dan cashflow dalam satu tempat.'
  },
  {
    icon: '💳',
    title: 'Wallet Management',
    text: 'Pantau saldo cash, bank, dan e-wallet.'
  },
  {
    icon: '🧮',
    title: 'Budget Tracking',
    text: 'Ketahui kapan pengeluaran mulai melewati batas.'
  },
  {
    icon: '📊',
    title: 'Analytics',
    text: 'Pahami pola pengeluaranmu.'
  },
  {
    icon: '💬',
    title: 'Telegram Access',
    text: 'Kelola pencatatan langsung dari Telegram.'
  }
];

const steps = [
  {
    number: '01',
    title: 'Open Telegram',
    text: 'Mulai dengan membuka FlowMoney Bot.'
  },
  {
    number: '02',
    title: 'Record Your Money',
    text: 'Catat pemasukan dan pengeluaran langsung melalui chat.'
  },
  {
    number: '03',
    title: 'Understand Your Finances',
    text: 'Lihat ringkasan dan perkembangan keuanganmu.'
  }
];

const ctaButton = (label, variant = 'primary', compact = false) => `
  <a
    class="cta-button ${variant} ${compact ? 'compact' : ''}"
    href="${TELEGRAM_CTA_URL}"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="${label}"
  >
    ${label}
  </a>
`;

const render = () => {
  const app = document.querySelector('#app');

  app.innerHTML = `
    <div class="flow-landing ${window.location.hash === '#dashboard' ? 'dashboard-mode' : ''}">
      <header class="topnav">
        <div class="container nav-shell">
          <a href="#top" class="brand" aria-label="FlowMoney home">
            <span class="brand-mark">F</span>
            <span>${APP_NAME}</span>
          </a>

          <nav class="main-nav" aria-label="Main navigation">
            <a href="#dashboard">Dashboard</a>
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#security">Security</a>
            <a href="#terms">Terms & Conditions</a>
            <a href="#privacy-policy">Privacy Policy</a>
          </nav>

          <div class="nav-actions">
            <button type="button" class="theme-toggle" data-theme-toggle aria-label="Switch to dark mode">🌙 Dark</button>
            ${ctaButton('Open Telegram', 'secondary', true)}
          </div>

          <button class="menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded="false">
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>

        <div class="mobile-menu" aria-label="Mobile navigation">
          <a href="#dashboard">Dashboard</a>
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#security">Security</a>
          <a href="#terms">Terms & Conditions</a>
          <a href="#privacy-policy">Privacy Policy</a>
          ${ctaButton('Open FlowMoney on Telegram', 'primary')}
        </div>
      </header>

      <main>
        <section class="hero container" id="top">
          <div class="hero-copy reveal">
            <p class="eyebrow">Personal finance, with intention</p>
            <h1>Make every <span>rupiah</span> count.</h1>
            <p class="hero-subtitle">
              FlowMoney membantu kamu mencatat, memahami, dan mengontrol keuangan pribadi — langsung dari Telegram, tanpa spreadsheet yang rumit.
            </p>

            <div class="cta-row">
              ${ctaButton('Open FlowMoney on Telegram', 'primary')}
              <a class="cta-button secondary" href="#dashboard">View dashboard</a>
              <a class="cta-button ghost" href="./dashboard/">Buka dashboard</a>
              <a class="cta-button ghost" href="#how-it-works">See how it works</a>
            </div>

            <p class="trust-line"><span class="trust-dot"></span> Built for clarity, designed for real life.</p>
          </div>

          <div class="auth-panel reveal" aria-live="polite">
            <div class="auth-header">
              <p class="eyebrow auth-eyebrow">FlowMoney Access</p>
              <h3>${authState.user ? 'Welcome back' : 'Sign in to FlowMoney'}</h3>
            </div>

            <div class="auth-tabs" role="tablist" aria-label="Authentication mode">
              <button type="button" class="auth-tab ${authState.mode === 'signin' ? 'active' : ''}" data-auth-mode="signin">Sign in</button>
              <button type="button" class="auth-tab ${authState.mode === 'signup' ? 'active' : ''}" data-auth-mode="signup">Create account</button>
            </div>

            ${authState.user ? `
              <div class="auth-user-box">
                <div>
                  <span class="user-label">Signed in</span>
                  <strong>${authState.user.email || 'FlowMoney user'}</strong>
                </div>
                <button type="button" class="cta-button secondary compact" data-signout>Sign out</button>
              </div>
            ` : `
              <form id="flow-auth-form" class="auth-form">
                <label class="auth-field">
                  <span>Email</span>
                  <input type="email" name="email" placeholder="you@example.com" required />
                </label>

                <label class="auth-field">
                  <span>Password</span>
                  <input type="password" name="password" placeholder="••••••••" minlength="6" required />
                </label>

                <label class="auth-field ${authState.mode === 'signup' ? '' : 'hidden'}" data-confirm-password-field>
                  <span>Confirm password</span>
                  <input type="password" name="confirmPassword" placeholder="Confirm password" minlength="6" />
                </label>

                <button type="submit" class="cta-button primary auth-submit">
                  ${authState.mode === 'signup' ? 'Create account' : 'Sign in'}
                </button>

                <button type="button" class="cta-button secondary auth-submit" data-signin-microsoft>
                  Continue with Microsoft
                </button>

                <p class="auth-feedback ${authState.error ? 'error' : ''}">${authState.message || (isFirebaseConfigured() ? 'Use your email and password to access FlowMoney.' : 'Firebase app config is missing. Add your Firebase web config first.')}</p>
              </form>
            `}
          </div>

          <div class="hero-visual reveal">
            <div class="dashboard-window">
              <div class="window-header">
                <div class="traffic-lights">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span class="window-label">FlowMoney Dashboard</span>
              </div>

              <div class="dashboard-body">
                <aside class="mini-sidebar">
                  <span class="mini-pill active">Overview</span>
                  <span class="mini-pill">Wallet</span>
                  <span class="mini-pill">Analytics</span>
                </aside>

                <div class="dashboard-panel">
                  <div class="summary-row">
                    <div>
                      <p class="mini-label">Total Balance</p>
                      <h3>Rp12.500.000</h3>
                    </div>
                    <span class="chip positive">+Rp4.650.000</span>
                  </div>

                  <div class="stat-grid">
                    <div class="statcard">
                      <span>Income</span>
                      <strong>Rp7.000.000</strong>
                    </div>
                    <div class="statcard warning">
                      <span>Expense</span>
                      <strong>Rp2.350.000</strong>
                    </div>
                  </div>

                  <div class="chart-box">
                    <div class="chart-line" aria-hidden="true">
                      <span class="bar short"></span>
                      <span class="bar mid"></span>
                      <span class="bar tall"></span>
                      <span class="bar mid"></span>
                      <span class="bar tall"></span>
                      <span class="bar short"></span>
                    </div>
                  </div>

                  <div class="list-head">
                    <span>Recent Transactions</span>
                    <span>Today</span>
                  </div>

                  <div class="transaction-list">
                    <div class="transaction-row">
                      <span class="emoji">🍔</span>
                      <div>
                        <strong>Food</strong>
                        <small>Lunch</small>
                      </div>
                      <strong class="amount negative">-Rp50.000</strong>
                    </div>
                    <div class="transaction-row">
                      <span class="emoji">🚗</span>
                      <div>
                        <strong>Transport</strong>
                        <small>Ride</small>
                      </div>
                      <strong class="amount negative">-Rp25.000</strong>
                    </div>
                    <div class="transaction-row income-row">
                      <span class="emoji">💰</span>
                      <div>
                        <strong>Salary</strong>
                        <small>Monthly income</small>
                      </div>
                      <strong class="amount positive">+Rp7.000.000</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="auth-section container" id="auth">
          <div class="auth-bottom-shell reveal">
            <div>
              <p class="eyebrow">Begin with your account</p>
              <h2>Track your money with a secure personal account.</h2>
            </div>
            <a class="cta-button ghost" href="#auth">Open account</a>
          </div>
        </section>

        <section class="stats-strip container reveal" aria-label="FlowMoney highlights">
          <div><strong>10 sec</strong><span>to log a transaction</span></div>
          <div><strong>24/7</strong><span>financial visibility</span></div>
          <div><strong>1 view</strong><span>for your whole cashflow</span></div>
          <div><strong>0 noise</strong><span>in your daily decisions</span></div>
        </section>

        <div id="dashboard-app-root"></div>

        <section class="features container" id="features">
          <div class="section-header">
            <div>
              <p class="eyebrow">Features</p>
              <h2>Everything you need to manage your money.</h2>
            </div>
          </div>

          <div class="feature-grid">
            ${features.map((item) => `
              <article class="feature-card reveal">
                <div class="feature-icon">${item.icon}</div>
                <h3>${item.title}</h3>
                <p>${item.text}</p>
              </article>
            `).join('')}
          </div>
        </section>

        <section class="showcase container" id="showcase">
          <div class="showcase-copy reveal">
            <p class="eyebrow">One calm view</p>
            <h2>Your financial life, finally in focus.</h2>
            <p>From your morning coffee to your monthly goals, FlowMoney turns everyday activity into a clear picture you can act on.</p>
            <a class="text-link" href="#dashboard">Explore the dashboard <span>↗</span></a>
          </div>
          <div class="showcase-card reveal">
            <div class="showcase-card-head"><span>Monthly overview</span><span class="showcase-date">September 2026</span></div>
            <div class="showcase-total"><span>Total balance</span><strong>Rp 12.500.000</strong><em>+18.4%</em></div>
            <div class="showcase-chart" aria-label="Cashflow trend"><i style="height: 28%"></i><i style="height: 40%"></i><i style="height: 34%"></i><i style="height: 62%"></i><i style="height: 54%"></i><i style="height: 78%"></i><i style="height: 68%"></i><i style="height: 92%"></i></div>
            <div class="showcase-legend"><span><b></b>Cashflow</span><span>Last 8 weeks <strong>↗</strong></span></div>
          </div>
        </section>

        <section class="how-it-works container" id="how-it-works">
          <div class="section-header centered">
            <p class="eyebrow">How It Works</p>
            <h2>From chat to clarity in three steps.</h2>
          </div>

          <div class="steps-grid">
            ${steps.map((step) => `
              <article class="step-card reveal">
                <div class="step-number">${step.number}</div>
                <h3>${step.title}</h3>
                <p>${step.text}</p>
              </article>
            `).join('')}
          </div>

          <div class="step-cta">
            ${ctaButton('Start with Telegram', 'primary')}
          </div>
        </section>

        <section class="telegram-flow container">
          <div class="bridge-copy reveal">
            <p class="eyebrow">Telegram-first experience</p>
            <h2>Manage your money from Telegram.</h2>
            <p>
              FlowMoney web memberi gambaran yang jelas. Telegram menjadi cara paling cepat untuk mencatat transaksi dan melihat ringkasan harian.
            </p>
            ${ctaButton('Open FlowMoney on Telegram', 'primary')}
          </div>

          <div class="telegram-visual reveal">
            <div class="phone-shell">
              <div class="phone-topbar">FlowMoney Bot</div>
              <div class="chat-box">
                <div class="bubble bot">
                  👋 Welcome to FlowMoney
                  <span>Your personal finance assistant.</span>
                </div>
                <div class="bubble bot small">What would you like to do?</div>
                <div class="bubble pills-row">
                  <span>💸 Add Expense</span>
                  <span>💰 Add Income</span>
                  <span>📊 View Summary</span>
                  <span>💳 Check Balance</span>
                </div>
                <div class="bubble user">makan 45rb cash</div>
                <div class="bubble bot message-result">
                  <strong>🍔 Expense recorded</strong>
                  <span>Food</span>
                  <span>-Rp45.000</span>
                  <small>Wallet: Cash</small>
                  <small>Balance: Rp455.000</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="privacy container" id="security">
          <div class="privacy-panel reveal">
            <div class="privacy-copy">
              <p class="eyebrow">Your money. Your data. Your control.</p>
              <h2>Built for simple personal finance tracking.</h2>
            </div>

            <ul class="privacy-list">
              <li>Clear transaction history</li>
              <li>Organized financial data</li>
              <li>Controlled access</li>
              <li>No unnecessary complexity</li>
            </ul>
          </div>
        </section>

        <section class="testimonial-section container">
          <div class="testimonial-card reveal">
            <span class="quote-mark">“</span>
            <blockquote>FlowMoney made me stop guessing. I can see what is happening with my money, make a better decision, and move on with my day.</blockquote>
            <div class="testimonial-person"><span class="avatar">AN</span><span><strong>Aditya N.</strong><small>FlowMoney user since 2025</small></span></div>
          </div>
          <div class="testimonial-side reveal"><p class="eyebrow">A quieter way to manage money</p><h2>Good habits start with seeing clearly.</h2><p>No guilt. No noise. Just a simple rhythm that helps you stay close to what matters.</p></div>
        </section>

        <section class="faq-section container" id="faq">
          <div class="section-header centered"><p class="eyebrow">Questions, answered</p><h2>Everything you need to know.</h2></div>
          <div class="faq-list reveal">
            <details open><summary>What is FlowMoney?</summary><p>FlowMoney is a personal finance companion for tracking income, expenses, wallets, budgets, and goals in one calm workspace.</p></details>
            <details><summary>Can I use FlowMoney from Telegram?</summary><p>Yes. Telegram is the fastest way to record a transaction. Your entries can then be reviewed in the FlowMoney dashboard.</p></details>
            <details><summary>Is my financial data private?</summary><p>Your account and financial data are protected with controlled access. FlowMoney does not sell your personal information.</p></details>
            <details><summary>Do I need to be good with numbers?</summary><p>Not at all. FlowMoney is designed to turn everyday money moments into simple, readable signals.</p></details>
          </div>
        </section>

        <section class="legal container" id="terms">
          <div class="legal-panel reveal">
            <div class="legal-header">
              <p class="eyebrow">Terms & Conditions</p>
              <h2>Simple rules for using FlowMoney.</h2>
              <p>Last updated: 22 September 2026</p>
            </div>

            <div class="legal-copy">
              <h3>Using the service</h3>
              <p>FlowMoney membantu kamu mencatat dan memahami keuangan pribadi. Kamu bertanggung jawab atas keakuratan data yang dimasukkan dan atas keamanan akunmu.</p>
              <h3>Financial information</h3>
              <p>FlowMoney bukan penasihat keuangan, bank, atau layanan pembayaran. Informasi dan ringkasan yang ditampilkan hanya untuk membantu pencatatan dan pengambilan keputusan pribadi.</p>
              <h3>Acceptable use</h3>
              <p>Kamu tidak boleh menyalahgunakan layanan, mencoba mengakses akun atau data pengguna lain, mengirim konten berbahaya, atau mengganggu keamanan dan kinerja FlowMoney.</p>
              <h3>Changes and availability</h3>
              <p>Kami dapat memperbarui fitur, menghentikan bagian layanan, atau mengubah ketentuan ini untuk menjaga keamanan dan kualitas layanan.</p>
            </div>
          </div>
        </section>

        <section class="legal container" id="privacy-policy">
          <div class="legal-panel reveal">
            <div class="legal-header">
              <p class="eyebrow">Privacy Policy</p>
              <h2>How FlowMoney handles your information.</h2>
              <p>Last updated: 22 September 2026</p>
            </div>

            <div class="legal-copy">
              <h3>Information we handle</h3>
              <p>FlowMoney dapat menyimpan informasi akun, data transaksi, wallet, budget, tujuan, serta identitas Telegram yang kamu gunakan untuk mengakses layanan.</p>
              <h3>How we use it</h3>
              <p>Data digunakan untuk menyediakan dashboard, menghitung ringkasan keuangan, menghubungkan akun, menjaga keamanan, dan meningkatkan keandalan layanan. Kami tidak menjual data pribadi kamu.</p>
              <h3>Storage and protection</h3>
              <p>Kami menerapkan kontrol akses dan langkah keamanan yang wajar. Jangan bagikan password, token bot, atau kredensial akun kepada siapa pun.</p>
              <h3>Your choices</h3>
              <p>Kamu dapat meninjau atau memperbarui data melalui layanan yang tersedia. Untuk pertanyaan privasi atau permintaan penghapusan data, hubungi tim FlowMoney melalui kanal resmi yang tersedia.</p>
            </div>
          </div>
        </section>

        <section class="final-cta container">
          <div class="final-panel reveal">
            <div>
              <p class="eyebrow">Start today</p>
              <h2>Start Taking Control of Your Money.</h2>
              <p>Catat pengeluaran dan pahami cashflow kamu langsung dari FlowMoney.</p>
            </div>
            <div class="final-actions">
              ${ctaButton('Open FlowMoney on Telegram', 'primary')}
              <a class="cta-button ghost" href="#dashboard">Explore Dashboard</a>
            </div>
          </div>
        </section>
      </main>

      <footer class="footer">
        <div class="container footer-shell">
          <div>
            <div class="brand footer-brand">
              <span class="brand-mark">F</span>
              <span>${APP_NAME}</span>
            </div>
            <p class="footer-tag">Know where your money goes.</p>
          </div>

          <div class="footer-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#terms">Terms & Conditions</a>
            <a href="#privacy-policy">Privacy Policy</a>
            <a href="./dashboard/">Dashboard</a>
            <a href="${TELEGRAM_BOT_URL}" target="_blank" rel="noopener noreferrer">Telegram</a>
          </div>
        </div>
      </footer>
    </div>
  `;

  const menuToggle = document.querySelector('.menu-toggle');
  const mobileMenu = document.querySelector('.mobile-menu');

  applyTheme(themeState.mode);

  const themeToggle = document.querySelector('[data-theme-toggle]');
  themeToggle?.addEventListener('click', () => {
    applyTheme(themeState.mode === 'dark' ? 'light' : 'dark');
  });

  menuToggle?.addEventListener('click', () => {
    const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!expanded));
    mobileMenu?.classList.toggle('open');
  });

  mobileMenu?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      menuToggle?.setAttribute('aria-expanded', 'false');
    });
  });

  document.querySelectorAll('[data-auth-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      authState.mode = button.dataset.authMode;
      authState.message = '';
      authState.error = '';
      render();
    });
  });

  const dashboardRoot = document.querySelector('#dashboard-app-root');
  if (dashboardRoot && mountDashboard) mountDashboard(dashboardRoot, authState.user);

  const authForm = document.querySelector('#flow-auth-form');
  if (authForm) {
    authForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const formData = new FormData(authForm);
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '');
      const confirmPassword = String(formData.get('confirmPassword') || '');

      if (!email || !password) {
        authState.error = 'Email and password are required.';
        authState.message = authState.error;
        render();
        return;
      }

      if (!isFirebaseConfigured()) {
        authState.error = 'Firebase web config is missing. Add the Firebase app config before using sign-in.';
        authState.message = authState.error;
        render();
        return;
      }

      if (authState.mode === 'signup' && password !== confirmPassword) {
        authState.error = 'Passwords do not match.';
        authState.message = authState.error;
        render();
        return;
      }

      try {
        if (authState.mode === 'signup') {
          await signUpWithEmail(email, password);
          authState.message = 'Account created successfully.';
        } else {
          await signInWithEmail(email, password);
          authState.message = 'Signed in successfully.';
        }
        authState.error = '';
        authForm.reset();
        render();
      } catch (error) {
        authState.error = error?.message || 'Authentication failed.';
        authState.message = authState.error;
        render();
      }
    });
  }

  const microsoftSignInButton = document.querySelector('[data-signin-microsoft]');
  microsoftSignInButton?.addEventListener('click', async () => {
    if (!isFirebaseConfigured()) {
      authState.error = 'Firebase web config is missing. Add your Firebase app config first.';
      authState.message = authState.error;
      render();
      return;
    }

    try {
      await signInWithMicrosoft();
      authState.message = 'Signed in with Microsoft.';
      authState.error = '';
    } catch (error) {
      authState.error = error?.message || 'Microsoft sign-in failed.';
      authState.message = authState.error;
      render();
    }
  });

  const signoutButton = document.querySelector('[data-signout]');
  signoutButton?.addEventListener('click', async () => {
    try {
      await signOutUser();
      authState.user = null;
      authState.message = 'Signed out successfully.';
      authState.error = '';
      render();
    } catch (error) {
      authState.error = error?.message || 'Could not sign out.';
      authState.message = authState.error;
      render();
    }
  });

  console.info(`FlowMoney Telegram config ready: ${TELEGRAM_BOT_URL} • start=${TELEGRAM_START_PARAMETER} • app=${APP_URL}`);
};

if (!window.__flowmoneyAuthSubscription) {
  window.__flowmoneyAuthSubscription = subscribeToAuth((user) => {
    authState.user = user;
    if (user) {
      authState.message = `Signed in as ${user.email || 'FlowMoney user'}`;
      authState.error = '';
    } else if (!authState.message) {
      authState.message = 'Use your email and password to access FlowMoney.';
    }
    render();
  });
}

function syncRoute() {
  const landing = document.querySelector('.flow-landing');
  if (!landing) return;
  landing.classList.toggle('dashboard-mode', window.location.hash === '#dashboard');
}

window.addEventListener('hashchange', syncRoute);
render();
syncRoute();
