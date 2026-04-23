const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_FETCH_TIMEOUT_MS || 12000);
const DEFAULT_RETRIES = Number(import.meta.env.VITE_FETCH_RETRIES || 2);

function sleep(ms) {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function fetchJsonWithRetry(url, options = {}) {
	const timeoutMs = Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	const retries = Number(options.retries ?? DEFAULT_RETRIES);
	let attempt = 0;
	let lastError = null;

	while (attempt <= retries) {
		const controller = new AbortController();
		const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`Request failed with status ${response.status}`);
			}

			return await response.json();
		} catch (error) {
			lastError = error;
			if (attempt >= retries) {
				break;
			}

			const backoffMs = Math.min(1500 * (attempt + 1), 4000);
			await sleep(backoffMs);
		} finally {
			window.clearTimeout(timeoutId);
		}

		attempt += 1;
	}

	if (lastError?.name === 'AbortError') {
		throw new Error('Request timed out. Please try again.');
	}

	throw new Error(lastError?.message || 'Request failed. Please try again.');
}
