(async () => {
  try {
    const res = await fetch('http://localhost:5000/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dixitlendingsolution@gmail.com' })
    });

    const data = await res.json().catch(() => null);
    console.log('Response status:', res.status);
    console.log('Response body:', data);
  } catch (err) {
    console.error('Request failed:', err.message || err);
    process.exit(1);
  }
})();
