const analyticsEndpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT || '';

export function logEvent(eventName, payload = {}) {
	const record = {
		event: eventName,
		payload,
		timestamp: Date.now(),
	};

	if (import.meta.env.DEV) {
		console.info('[telemetry]', record);
	}

	if (!analyticsEndpoint || typeof navigator === 'undefined' || !navigator.sendBeacon) {
		return;
	}

	try {
		navigator.sendBeacon(analyticsEndpoint, JSON.stringify(record));
	} catch {
		// Ignore analytics send failures.
	}
}
