/* Site Manager Console: accessible navigation enhancements.
   Observes existing view state; does not replace the application's routing. */
(() => {
  'use strict';
  const sidebar = document.querySelector('#admin-app .sidebar');
  const main = document.querySelector('#admin-app .main-area');
  if (!sidebar || !main) return;

  sidebar.setAttribute('aria-label', 'Site Manager navigation');
  main.id ||= 'site-manager-main';
  main.setAttribute('tabindex', '-1');

  const buttons = Array.from(sidebar.querySelectorAll('.sidebar-btn[data-view]'));
  const sync = () => {
    buttons.forEach((button) => {
      const selected = button.classList.contains('active');
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  };
  sync();
  const observer = new MutationObserver(sync);
  buttons.forEach((button) => observer.observe(button, { attributes: true, attributeFilter: ['class'] }));

  // Support the keyboard without hijacking ordinary mouse navigation.
  sidebar.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
    const visible = buttons.filter((button) => !button.disabled && button.getClientRects().length && getComputedStyle(button).visibility !== 'hidden');
    const index = visible.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = visible.length - 1;
    if (event.key === 'ArrowDown') next = (index + 1) % visible.length;
    if (event.key === 'ArrowUp') next = (index - 1 + visible.length) % visible.length;
    visible[next]?.focus();
  });

  const skip = document.createElement('a');
  skip.className = 'admin-skip-link';
  skip.href = '#site-manager-main';
  skip.textContent = 'Skip to main content';
  skip.addEventListener('click', () => {
    // Allow the browser to move to the target, then ensure keyboard focus follows.
    requestAnimationFrame(() => main.focus({ preventScroll: true }));
  });
  document.body.prepend(skip);
})();
