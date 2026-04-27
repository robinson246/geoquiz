import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

function buildCountry(name, capital, code, region = 'Europe') {
	return {
		name: { common: name },
		capital: [capital],
		flags: { svg: `https://flags.example/${code}.svg` },
		cca3: code,
		region,
	};
}

const apiCountries = [
	buildCountry('France', 'Paris', 'FRA', 'Europe'),
	buildCountry('Germany', 'Berlin', 'DEU', 'Europe'),
	buildCountry('Japan', 'Tokyo', 'JPN', 'Asia'),
	buildCountry('Brazil', 'Brasilia', 'BRA', 'Americas'),
	buildCountry('Kenya', 'Nairobi', 'KEN', 'Africa'),
	buildCountry('Australia', 'Canberra', 'AUS', 'Oceania'),
	buildCountry('Canada', 'Ottawa', 'CAN', 'Americas'),
	buildCountry('Spain', 'Madrid', 'ESP', 'Europe'),
	buildCountry('India', 'New Delhi', 'IND', 'Asia'),
	buildCountry('Egypt', 'Cairo', 'EGY', 'Africa'),
];

function seedQuizSession(overrides = {}) {
	window.localStorage.setItem(
		'geoquizSessionV1',
		JSON.stringify({
			phase: 'results',
			quizMode: 'mixed',
			questionCount: 10,
			allowedContinents: ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'],
			currentIndex: 9,
			score: 8,
			mistakes: [
				{
					prompt: 'What is the capital of France?',
					correct: 'Paris',
					picked: 'Lyon',
				},
			],
			quiz: Array.from({ length: 10 }, (_, index) => ({
				id: `q-${index}`,
				type: 'capital',
				prompt: `Question ${index + 1}`,
				media: { name: 'France', flag: 'https://flags.example/FRA.svg' },
				answer: 'Paris',
				choices: ['Paris', 'Rome', 'Madrid', 'Berlin'],
			})),
			...overrides,
		})
	);
}

async function renderApp(initialEntries = ['/']) {
	render(
		<MemoryRouter initialEntries={initialEntries}>
			<App />
		</MemoryRouter>
	);
}

describe('App', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		window.localStorage.clear();
		window.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => apiCountries,
		});
	});

	it('supports deep-linking to a stored results route', async () => {
		seedQuizSession();

		render(
			<MemoryRouter initialEntries={['/results']}>
				<App />
			</MemoryRouter>
		);

		expect(await screen.findByRole('heading', { name: /assessment complete/i })).toBeTruthy();
		expect(screen.getByText(/you scored/i).textContent).toContain('8');
		expect(screen.getByRole('button', { name: /back to menu/i })).toBeTruthy();
	});

	it('caps a restored results score at the quiz length', async () => {
		seedQuizSession({ score: 11 });

		render(
			<MemoryRouter initialEntries={['/results']}>
				<App />
			</MemoryRouter>
		);

		expect(await screen.findByRole('heading', { name: /assessment complete/i })).toBeTruthy();
		expect(screen.getByText(/you scored/i).textContent).toContain('10');
		expect(screen.getByText('10/10')).toBeTruthy();
	});

	it('returns to the menu when quitting a quiz and cancels pending auto-advance', async () => {
		const user = userEvent.setup();

		await renderApp();
		await screen.findByRole('button', { name: /^play$/i });
		await user.click(screen.getByRole('button', { name: /^play$/i }));

		expect(await screen.findByRole('button', { name: /quit quiz/i })).toBeTruthy();

		const answerButtons = screen.getAllByRole('button').filter((button) =>
			button.className.includes('choice-button')
		);
		await user.click(answerButtons[0]);
		await user.click(screen.getByRole('button', { name: /quit quiz/i }));

		expect(await screen.findByRole('button', { name: /^play$/i })).toBeTruthy();
		expect(screen.getByText(/quiz ended/i)).toBeTruthy();

		await new Promise((resolve) => window.setTimeout(resolve, 1100));

		await waitFor(() => {
			expect(screen.getByRole('button', { name: /^play$/i })).toBeTruthy();
		});
	});

	it('does not show global leaderboard entries as a new user history', async () => {
		window.localStorage.setItem(
			'geoquizLeaderboardV1',
			JSON.stringify([
				{
					id: 'public-1',
					score: 10,
					total: 10,
					accuracy: 100,
					mode: 'Flags Only',
					playedAt: Date.now(),
					userEmail: 'someone@example.com',
					userName: 'Someone Else',
				},
			])
		);

		window.localStorage.setItem('geoquizAuthTokenV1', 'test-token');
		window.fetch = vi.fn(async (url) => {
			const urlText = String(url);
			if (urlText.endsWith('/auth/me')) {
				return {
					ok: true,
					json: async () => ({
						user: {
							id: 'user-1',
							name: 'New User',
							email: 'new@example.com',
							createdAt: Date.now(),
						},
					}),
				};
			}
			if (urlText.endsWith('/quiz-results/me')) {
				return { ok: true, json: async () => ({ results: [] }) };
			}
			if (urlText.endsWith('/quiz-sessions/active')) {
				return { ok: true, json: async () => ({ session: null }) };
			}
			if (urlText.endsWith('/study-progress')) {
				return { ok: true, json: async () => ({ progress: [] }) };
			}
			if (urlText.endsWith('/leaderboard')) {
				return { ok: true, json: async () => ({ entries: [] }) };
			}
			return { ok: true, json: async () => apiCountries };
		});

		await renderApp(['/user-history']);
		await screen.findByText(/new user · new@example.com/i);

		expect(screen.getByText(/no quiz history yet/i)).toBeTruthy();
		expect(screen.queryByText('Someone Else')).toBeNull();
		expect(screen.getByText('Quizzes Played').previousElementSibling?.textContent).toBe('0');
		expect(screen.getByText('Overall Accuracy').previousElementSibling?.textContent).toBe('0%');
	});

	afterEach(() => {
		vi.useRealTimers();
	});
});
