// Add future use cases here to keep both pages' navigation in sync.
export const useCases = [
  { id: 'gesture', label: 'Gesture web tools', icon: '✋', href: '/gesture.html' },
  { id: 'expenses', label: 'Categorize expenses', icon: '≡', href: '/#expenses' },
  { id: 'flight', label: 'Book a flight', icon: '↗', href: '/#flight' },
  { id: 'appointment', label: 'Book an appointment', icon: '▦', href: '/#appointment' },
  { id: 'mcp', label: 'Compare tool selection', icon: '⇄', href: '/compare.html' },
];

const sidebar = document.getElementById('use-case-sidebar');
const playground = document.body.classList.contains('playground-page');
sidebar.innerHTML = `
  <div class="sidebar-heading"><span>USE CASES</span><span class="use-case-count">${useCases.length}</span></div>
  <button type="button" class="navigation-toggle" aria-expanded="false" aria-controls="use-case-list">Use cases <span aria-hidden="true">☰</span></button>
  <nav id="use-case-list" class="use-case-list" aria-label="Demo use cases"></nav>
  <a class="sidebar-contribute" href="https://github.com/jangya/jev-in-action/blob/main/CONTRIBUTING.md">+ Contribute a use case <span aria-hidden="true">↗</span></a>`;
const nav = sidebar.querySelector('nav');
for (const item of useCases) {
  const local = playground && item.href.startsWith('/#');
  const control = document.createElement(local ? 'button' : 'a');
  control.className = 'use-case-link';
  if (local) {
    control.type = 'button';
    control.dataset.view = item.id;
    control.setAttribute('aria-pressed', 'false');
  } else {
    control.href = item.href;
    if (item.href === location.pathname) {
      control.classList.add('active');
      control.setAttribute('aria-current', 'page');
    }
  }
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = item.icon;
  control.append(icon, document.createTextNode(item.label));
  nav.append(control);
}
const toggle = sidebar.querySelector('.navigation-toggle');
function closeNavigation() {
  sidebar.classList.remove('expanded');
  toggle.setAttribute('aria-expanded', 'false');
}
toggle.addEventListener('click', () => {
  const expanded = sidebar.classList.toggle('expanded');
  toggle.setAttribute('aria-expanded', String(expanded));
});
nav.addEventListener('click', event => {
  if (!event.target.closest('.use-case-link')) return;
  closeNavigation();
  if (matchMedia('(max-width: 760px)').matches) document.getElementById('main-content').focus();
});
sidebar.addEventListener('keydown', event => {
  if (event.key === 'Escape' && sidebar.classList.contains('expanded')) {
    closeNavigation();
    toggle.focus();
  }
});
