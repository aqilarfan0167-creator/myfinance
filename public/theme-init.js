// Applies the saved/OS theme before React loads (external file so the CSP needs no inline scripts).
try { var t = localStorage.getItem('mf-theme'); if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark'); } catch (e) { /* storage unavailable */ }
