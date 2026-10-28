// Every automated test is local/synthetic, including unexpected code paths.
globalThis.fetch = async () => { throw new Error('Network disabled in automated tests'); };
