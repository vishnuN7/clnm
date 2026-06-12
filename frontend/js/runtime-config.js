// Default to the local backend in development, otherwise use the deployed API host.
/*window.__CLN_API_BASE__ = window.__CLN_API_BASE__ || (() => {
	const { protocol, hostname, origin } = window.location;

	if (protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1') {
		return 'http://localhost:5000';
	}

	if (hostname.endsWith('.netlify.app')) {
		return 'https://clnm.onrender.com';
	}

	return origin;
})();
*/

window.__CLN_API_BASE__ = window.__CLN_API_BASE__ || 'https://clnm.onrender.com';