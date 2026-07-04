// SPDX-License-Identifier: AGPL-3.0-or-later

use maud::{Markup, PreEscaped, html};

pub const THEME_INIT_SCRIPT: &str = r#"
(function () {
	try {
		var stored = localStorage.getItem('fluxer-admin-theme');
		var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
		if (stored === 'dark' || (!stored && prefersDark)) {
			document.documentElement.classList.add('dark');
		}
	} catch (e) {}
})();

"#;

pub const THEME_SCRIPT: &str = r#"
(function () {
	if (window.__fluxerAdminTheme) return;
	window.__fluxerAdminTheme = true;

	var STORAGE_KEY = 'fluxer-admin-theme';

	function isDark() {
		return document.documentElement.classList.contains('dark');
	}

	function applyTheme(dark) {
		document.documentElement.classList.toggle('dark', dark);
		try {
			localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
		} catch (e) {}
		document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
			btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
		});
	}

	function toggleTheme() {
		applyTheme(!isDark());
	}

	document.addEventListener('click', function (event) {
		var btn = event.target.closest('[data-theme-toggle]');
		if (!btn) return;
		event.preventDefault();
		toggleTheme();
	});

	document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
		btn.setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
	});
})();

"#;

pub fn render_theme_toggle(extra_class: &str) -> Markup {
    html! {
        button
            type="button"
            data-theme-toggle=""
            class={"inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border border-neutral-300 text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary " (extra_class)}
        {
            svg data-theme-icon="light" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" {
                path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" {}
            }
            svg data-theme-icon="dark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" {
                circle cx="12" cy="12" r="4" {}
                path d="M12 2v2" {}
                path d="M12 20v2" {}
                path d="m4.93 4.93 1.41 1.41" {}
                path d="m17.66 17.66 1.41 1.41" {}
                path d="M2 12h2" {}
                path d="M20 12h2" {}
                path d="m6.34 17.66-1.41 1.41" {}
                path d="m19.07 4.93-1.41 1.41" {}
            }
        }
    }
}

pub fn theme_init_script() -> Markup {
    html! {
        script { (PreEscaped(THEME_INIT_SCRIPT)) }
    }
}

pub fn theme_script() -> Markup {
    html! {
        script defer { (PreEscaped(THEME_SCRIPT)) }
    }
}
