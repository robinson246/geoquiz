const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_FETCH_TIMEOUT_MS || 12000);
const DEFAULT_RETRIES = Number(import.meta.env.VITE_FETCH_RETRIES || 2);
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

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

async function request(path, options = {}) {
	const response = await fetch(`${BACKEND_URL}${path}`, {
		...options,
		headers: {
			'content-type': 'application/json',
			...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
			...(options.headers || {}),
		},
		body: options.body ? JSON.stringify(options.body) : undefined,
	});

	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(payload.message || 'Request failed.');
	}
	return payload;
}

export const backendApi = {
	signUp(credentials) {
		return request('/auth/signup', { method: 'POST', body: credentials });
	},
	logIn(credentials) {
		return request('/auth/login', { method: 'POST', body: credentials });
	},
	logOut(token) {
		return request('/auth/logout', { method: 'POST', token });
	},
	getMe(token) {
		return request('/auth/me', { token });
	},
	saveQuizResult(result, token = '') {
		return request('/quiz-results', { method: 'POST', body: result, token });
	},
	getUserHistory(token) {
		return request('/quiz-results/me', { token });
	},
	getLeaderboard() {
		return request('/leaderboard');
	},
	getActiveSession(token) {
		return request('/quiz-sessions/active', { token });
	},
	createSession(session, token) {
		return request('/quiz-sessions', { method: 'POST', body: session, token });
	},
	updateSession(sessionId, session, token) {
		return request(`/quiz-sessions/${sessionId}`, { method: 'PATCH', body: session, token });
	},
	completeSession(sessionId, token) {
		return request(`/quiz-sessions/${sessionId}/complete`, { method: 'POST', token });
	},
	abandonSession(sessionId, token) {
		return request(`/quiz-sessions/${sessionId}/abandon`, { method: 'POST', token });
	},
	getStudyProgress(token) {
		return request('/study-progress', { token });
	},
	saveStudyProgress(countryCode, progress, token) {
		return request(`/study-progress/${countryCode}`, { method: 'PUT', body: progress, token });
	},
};
