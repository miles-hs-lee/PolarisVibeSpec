exports.run = (n, fn) => { try { fn(); console.log('ok  - '+n); } catch (e) { console.error('fail - '+n+': '+e.message); process.exitCode = 1; } };
