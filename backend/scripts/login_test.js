(async () => {
  try {
    const port = process.env.TARGET_PORT || process.env.PORT || 5001;
    const res = await fetch(`http://localhost:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dixitlendingsolution@gmail.com', password: 'AdminNewP@ss123', role: 'admin' })
    });
    const data = await res.json().catch(() => null);
    console.log('Login status:', res.status);
    console.log('Login body:', data);
  } catch (err) {
    console.error('Login request failed:', err.message || err);
    process.exit(1);
  }
})();
