(() => {
	'use strict';

	const root = document.documentElement;
	const themeKey = 'ajb-theme';
	const themeMeta = document.querySelector('meta[name="theme-color"]');
	const topbar = document.querySelector('.topbar');
	let savedTheme = 'dark';

	try {
		const storedTheme = localStorage.getItem(themeKey);
		if (storedTheme === 'light' || storedTheme === 'dark') savedTheme = storedTheme;
	} catch {}

	function applyTheme(theme, persist = false) {
		root.dataset.theme = theme;
		if (themeMeta) themeMeta.content = theme === 'dark' ? '#101312' : '#f1f4ef';
		if (toggle) toggle.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
		if (persist) {
			try { localStorage.setItem(themeKey, theme); } catch {}
		}
	}

	let toggle;
	if (topbar) {
		toggle = document.createElement('button');
		toggle.className = 'shared-theme-toggle';
		toggle.type = 'button';
		toggle.title = 'Toggle light and dark mode';
		toggle.innerHTML = '<svg class="theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg><svg class="theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.9 13A8.8 8.8 0 0 1 11 3.1 8.9 8.9 0 1 0 20.9 13Z"/></svg>';
		toggle.addEventListener('click', () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));
		topbar.append(toggle);
	}

	applyTheme(savedTheme);
	window.addEventListener('storage', event => {
		if (event.key === themeKey && (event.newValue === 'light' || event.newValue === 'dark')) applyTheme(event.newValue);
	});
})();