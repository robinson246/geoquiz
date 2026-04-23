import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import LoadingPage from './pages/LoadingPage.js';
import ErrorPage from './pages/ErrorPage.js';
import ReadyHomePage from './pages/ReadyHomePage.js';
import StudySetsPage from './pages/StudySetsPage.js';
import UserHistoryPage from './pages/UserHistoryPage.js';
import PlayingPage from './pages/PlayingPage.js';
import ResultsPage from './pages/ResultsPage.js';
import LeaderboardPage from './pages/LeaderboardPage.js';
import AuthPage from './pages/AuthPage.js';
import UserPage from './pages/UserPage.js';
import { fetchJsonWithRetry } from './utils/api.js';
import { logEvent } from './utils/telemetry.js';
import FALLBACK_COUNTRIES from './data/fallbackCountries.js';

const API_URL =
	import.meta.env.VITE_API_URL ||
	'https://restcountries.com/v3.1/all?fields=name,capital,flags,cca3,region';
const DEFAULT_QUESTION_COUNT = 10;
const QUESTION_COUNT_OPTIONS = [10, 20, 30];
const MIN_QUESTION_COUNT = QUESTION_COUNT_OPTIONS[0];
const MAX_QUESTION_COUNT = QUESTION_COUNT_OPTIONS[QUESTION_COUNT_OPTIONS.length - 1];
const CONTINENT_OPTIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];
const BG_TILE_SIZE = 44;
const DEFAULT_BG_TILE_COUNT = 320;
const LEADERBOARD_STORAGE_KEY = 'geoquizLeaderboardV1';
const USER_HISTORY_STORAGE_KEY = 'geoquizUserHistoryV1';
const AUTH_USERS_STORAGE_KEY = 'geoquizAuthUsersV1';
const AUTH_CURRENT_USER_STORAGE_KEY = 'geoquizCurrentUserV1';
const COUNTRIES_CACHE_STORAGE_KEY = 'geoquizCountriesCacheV1';

const API_FALLBACK_URLS = [
	API_URL,
	'https://restcountries.com/v3.1/all?fields=name,capital,flags,cca3,region',
	'https://raw.githubusercontent.com/mledoze/countries/master/countries.json',
];

const STUDY_CONTINENT_OPTIONS = ['All', ...CONTINENT_OPTIONS];

function shuffle(items) {
	const copy = [...items];
	for (let index = copy.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(Math.random() * (index + 1));
		[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
	}
	return copy;
}

function normalizeCountry(country) {
	const alpha2 = (country.cca2 || '').toLowerCase();
	const fallbackFlag = alpha2 ? `https://flagcdn.com/w320/${alpha2}.png` : '';
	const normalizedName =
		typeof country.name === 'string' ? country.name : country.name?.common ?? 'Unknown';
	const normalizedCapital = Array.isArray(country.capital)
		? country.capital[0] ?? null
		: country.capital ?? null;
	const normalizedFlag = country.flags?.svg ?? country.flags?.png ?? fallbackFlag;

	return {
		code: country.cca3 ?? country.cca2 ?? normalizedName.slice(0, 3).toUpperCase(),
		name: normalizedName,
		capital: normalizedCapital,
		flag: normalizedFlag,
		region: country.region ?? 'Unknown',
	};
}

function randomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getResponsiveColumnCount(viewportWidth) {
	if (viewportWidth <= 820) {
		return 7;
	}
	if (viewportWidth <= 900) {
		return 10;
	}
	return 16;
}

function getBackgroundTileCount() {
	if (typeof window === 'undefined') {
		return DEFAULT_BG_TILE_COUNT;
	}

	const columns = getResponsiveColumnCount(window.innerWidth);
	const rows = Math.ceil(window.innerHeight / BG_TILE_SIZE) + 2;
	return columns * rows;
}

function pickDifferentFlag(pool, currentFlag) {
	if (!pool.length) {
		return '';
	}
	if (pool.length === 1) {
		return pool[0];
	}

	let next = pool[randomInt(0, pool.length - 1)];
	let safety = 0;
	while (next === currentFlag && safety < 10) {
		next = pool[randomInt(0, pool.length - 1)];
		safety += 1;
	}
	return next;
}

function formatTimestamp(value) {
	const date = new Date(value);
	return date.toLocaleString();
}

function buildInlineFlag(label) {
	const safeLabel = String(label || 'FLAG').slice(0, 10);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><rect width="320" height="200" fill="#4b5563"/><rect y="138" width="320" height="62" fill="#374151"/><text x="160" y="118" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#f3f4f6">${safeLabel}</text></svg>`;
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getBundledFallbackCountries() {
	return FALLBACK_COUNTRIES.map((country) => ({
		...country,
		flag: buildInlineFlag(country.code),
	}));
}

async function hashPassword(password) {
	if (!globalThis.crypto?.subtle) {
		return password;
	}

	const encodedPassword = new TextEncoder().encode(password);
	const digest = await globalThis.crypto.subtle.digest('SHA-256', encodedPassword);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function buildChoices(correctAnswer, pool, key, limit = 4) {
	const distractors = shuffle(
		pool
			.filter((country) => country[key] && country[key] !== correctAnswer)
			.map((country) => country[key])
	).filter((value, index, array) => array.indexOf(value) === index);

	const choices = shuffle([correctAnswer, ...distractors.slice(0, limit - 1)]);
	return choices;
}

function buildQuiz(
	countries,
	mode = 'mixed',
	questionCount = DEFAULT_QUESTION_COUNT,
	allowedContinents = CONTINENT_OPTIONS
) {
	const continentSet = new Set(allowedContinents);
	const usableCountries = countries.filter(
		(country) => country.capital && country.flag && continentSet.has(country.region)
	);
	if (!usableCountries.length) {
		return [];
	}

	const totalQuestions = Math.max(MIN_QUESTION_COUNT, Math.min(MAX_QUESTION_COUNT, questionCount));
	const pool = shuffle(usableCountries);
	const questionTypes =
		mode === 'flags'
			? Array.from({ length: totalQuestions }, () => 'flag')
			: mode === 'capitals'
				? Array.from({ length: totalQuestions }, () => 'capital')
				: shuffle([
						...Array.from({ length: Math.ceil(totalQuestions / 2) }, () => 'flag'),
						...Array.from({ length: Math.floor(totalQuestions / 2) }, () => 'capital'),
					]).slice(0, totalQuestions);

	return questionTypes.map((type, index) => {
		const country = pool[index % pool.length];

		if (type === 'flag') {
			return {
				id: `${country.code}-flag-${index}`,
				type,
				prompt: 'Which country does this flag belong to?',
				media: country.flag,
				answer: country.name,
				choices: buildChoices(country.name, pool, 'name'),
			};
		}

		return {
			id: `${country.code}-capital-${index}`,
			type,
			prompt: `What is the capital of ${country.name}?`,
			media: {
				name: country.name,
				flag: country.flag,
			},
			answer: country.capital,
			choices: buildChoices(country.capital, pool, 'capital'),
		};
	});
}

export default function App() {
	const [countries, setCountries] = useState([]);
	const [quiz, setQuiz] = useState([]);
	const [phase, setPhase] = useState('loading');
	const [quizMode, setQuizMode] = useState('mixed');
	const [questionCount, setQuestionCount] = useState(DEFAULT_QUESTION_COUNT);
	const [allowedContinents, setAllowedContinents] = useState(CONTINENT_OPTIONS);
	const [showOptionsPanel, setShowOptionsPanel] = useState(false);
	const [showStudyCapitals, setShowStudyCapitals] = useState(true);
	const [studyContinent, setStudyContinent] = useState('All');
	const [loadingProgress, setLoadingProgress] = useState(8);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [score, setScore] = useState(0);
	const [selectedAnswer, setSelectedAnswer] = useState('');
	const [feedback, setFeedback] = useState('');
	const [feedbackType, setFeedbackType] = useState('');
	const [mistakes, setMistakes] = useState([]);
	const [error, setError] = useState('');
	const [menuNotice, setMenuNotice] = useState('');
	const [backgroundTileCount, setBackgroundTileCount] = useState(() => getBackgroundTileCount());
	const [backgroundFlags, setBackgroundFlags] = useState(
		Array.from({ length: DEFAULT_BG_TILE_COUNT }, () => '')
	);
	const [fadingTiles, setFadingTiles] = useState({});
	const [leaderboardEntries, setLeaderboardEntries] = useState([]);
	const [userHistory, setUserHistory] = useState({});
	const [registeredUsers, setRegisteredUsers] = useState([]);
	const [currentUser, setCurrentUser] = useState(null);
	const location = useLocation();
	const navigate = useNavigate();

	const currentQuestion = quiz[currentIndex];
	const studyCountries = useMemo(() => {
		const filtered =
			studyContinent === 'All'
				? countries
				: countries.filter((country) => country.region === studyContinent);

		return [...filtered]
			.filter((country) => country.name && country.flag)
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [countries, studyContinent]);

	const progress = useMemo(() => {
		if (!quiz.length) {
			return 0;
		}
		return Math.round(((currentIndex + (phase === 'results' ? 1 : 0)) / quiz.length) * 100);
	}, [currentIndex, phase, quiz.length]);

	const currentUserHistoryEntries = useMemo(() => {
		if (!currentUser?.email) {
			return [];
		}

		if (Array.isArray(currentUser.history) && currentUser.history.length > 0) {
			return currentUser.history;
		}

		const storedEntries = userHistory[currentUser.email];
		if (Array.isArray(storedEntries) && storedEntries.length > 0) {
			return storedEntries;
		}

		const ownedEntries = leaderboardEntries.filter(
			(entry) => entry.userEmail === currentUser.email
		);
		if (ownedEntries.length > 0) {
			return ownedEntries;
		}

		return leaderboardEntries.length > 0 ? leaderboardEntries : [];
	}, [currentUser, leaderboardEntries, userHistory]);

	const hideFlagWall = phase === 'ready' && location.pathname === '/study-sets';

	useEffect(() => {
		logEvent('page_view', {
			path: location.pathname,
			phase,
		});
	}, [location.pathname, phase]);

	useEffect(() => {
		if (phase === 'playing' && location.pathname !== '/quiz') {
			navigate('/quiz', { replace: true });
			return;
		}

		if (phase === 'results' && location.pathname !== '/results') {
			navigate('/results', { replace: true });
			return;
		}

		if (phase === 'ready') {
			const readyPaths = new Set([
				'/',
				'/study-sets',
				'/user-history',
				'/leaderboard',
				'/auth',
				'/user',
			]);
			if (!readyPaths.has(location.pathname)) {
				navigate('/', { replace: true });
			}
		}
	}, [location.pathname, navigate, phase]);

	useEffect(() => {
		if (!currentUser?.email) {
			return;
		}

		const storedEntries = userHistory[currentUser.email];
		if (Array.isArray(storedEntries) && storedEntries.length > 0) {
			return;
		}

		const hasTaggedEntries = leaderboardEntries.some((entry) => Boolean(entry.userEmail));
		if (hasTaggedEntries || leaderboardEntries.length === 0) {
			return;
		}

		setUserHistory((prev) => ({
			...prev,
			[currentUser.email]: leaderboardEntries
				.map((entry) => ({
					...entry,
					userEmail: currentUser.email,
					userName: currentUser.name,
				}))
				.slice(0, 100),
		}));
	}, [currentUser, leaderboardEntries, userHistory]);

	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(LEADERBOARD_STORAGE_KEY);
			if (!raw) {
				return;
			}
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				setLeaderboardEntries(parsed);
			}
		} catch {
			setLeaderboardEntries([]);
		}
	}, []);

	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(USER_HISTORY_STORAGE_KEY);
			if (!raw) {
				return;
			}
			const parsed = JSON.parse(raw);
			if (typeof parsed === 'object' && parsed !== null) {
				setUserHistory(parsed);
			}
		} catch {
			setUserHistory({});
		}
	}, []);

	useEffect(() => {
		let cancelled = false;

		async function loadAuthData() {
			try {
				const rawUsers = window.localStorage.getItem(AUTH_USERS_STORAGE_KEY);
				if (rawUsers) {
					const parsedUsers = JSON.parse(rawUsers);
					if (Array.isArray(parsedUsers)) {
						const normalizedUsers = await Promise.all(
							parsedUsers.map(async (user) => {
								if (user?.passwordHash) {
									return user;
								}

								if (user?.password) {
									return {
										...user,
										passwordHash: await hashPassword(user.password),
									};
								}

								return user;
							})
						);

						if (!cancelled) {
							setRegisteredUsers(normalizedUsers);
						}
					}
				}

				const rawCurrentUser = window.localStorage.getItem(AUTH_CURRENT_USER_STORAGE_KEY);
				if (rawCurrentUser) {
					const parsedCurrentUser = JSON.parse(rawCurrentUser);
					if (parsedCurrentUser?.email && !cancelled) {
						setCurrentUser(parsedCurrentUser);
					}
				}
			} catch {
				if (!cancelled) {
					setRegisteredUsers([]);
					setCurrentUser(null);
				}
			}
		}

		loadAuthData();

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		try {
			window.localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(leaderboardEntries));
		} catch {
			// Ignore storage errors.
		}
	}, [leaderboardEntries]);

	useEffect(() => {
		try {
			window.localStorage.setItem(USER_HISTORY_STORAGE_KEY, JSON.stringify(userHistory));
		} catch {
			// Ignore storage errors.
		}
	}, [userHistory]);

	useEffect(() => {
		if (!currentUser?.email) {
			return;
		}

		if (Array.isArray(currentUser.history) && currentUser.history.length > 0) {
			return;
		}

		const accountRecord = registeredUsers.find((user) => user.email === currentUser.email);
		const storedEntries = userHistory[currentUser.email];
		const migratedHistory =
			Array.isArray(accountRecord?.history) && accountRecord.history.length > 0
				? accountRecord.history
				: Array.isArray(storedEntries) && storedEntries.length > 0
					? storedEntries
					: [];

		if (migratedHistory.length === 0) {
			return;
		}

		setCurrentUser((current) =>
			current
				? {
						...current,
						history: migratedHistory,
					}
				: current
		);
	}, [currentUser, registeredUsers, userHistory]);

	useEffect(() => {
		try {
			window.localStorage.setItem(AUTH_USERS_STORAGE_KEY, JSON.stringify(registeredUsers));
		} catch {
			// Ignore storage errors.
		}
	}, [registeredUsers]);

	useEffect(() => {
		try {
			if (currentUser) {
				window.localStorage.setItem(AUTH_CURRENT_USER_STORAGE_KEY, JSON.stringify(currentUser));
			} else {
				window.localStorage.removeItem(AUTH_CURRENT_USER_STORAGE_KEY);
			}
		} catch {
			// Ignore storage errors.
		}
	}, [currentUser]);

	useEffect(() => {
		let progressTimer;

		async function loadCountries() {
			const loadingStart = Date.now();

			try {
				setPhase('loading');
				setLoadingProgress(8);
				progressTimer = window.setInterval(() => {
					setLoadingProgress((value) => (value < 92 ? value + Math.random() * 6 : value));
				}, 170);

				let data;
				let activeApiUrl = '';
				let lastApiError = null;

				for (const endpoint of API_FALLBACK_URLS) {
					try {
						data = await fetchJsonWithRetry(endpoint);
						activeApiUrl = endpoint;
						break;
					} catch (error) {
						lastApiError = error;
					}
				}

				if (!data) {
					throw lastApiError || new Error('Unable to load countries from API.');
				}

				const normalized = data
					.map(normalizeCountry)
					.filter((country) => country.name && country.flag);

				try {
					window.localStorage.setItem(COUNTRIES_CACHE_STORAGE_KEY, JSON.stringify(normalized));
				} catch {
					// Ignore storage errors.
				}

				setCountries(normalized);
				const freshQuiz = buildQuiz(normalized, quizMode, questionCount, allowedContinents);
				if (!freshQuiz.length) {
					throw new Error('No quiz-ready countries were returned by the API.');
				}

				const remainingDelay = 1500 - (Date.now() - loadingStart);
				if (remainingDelay > 0) {
					await new Promise((resolve) => window.setTimeout(resolve, remainingDelay));
				}

				setLoadingProgress(100);
				setQuiz(freshQuiz);
				setPhase('ready');
				setError('');
				logEvent('countries_load_success', {
					countryCount: normalized.length,
					apiUrl: activeApiUrl,
				});
			} catch (loadError) {
				let loadedFromCache = false;

				try {
					const rawCached = window.localStorage.getItem(COUNTRIES_CACHE_STORAGE_KEY);
					if (rawCached) {
						const parsedCached = JSON.parse(rawCached);
						if (Array.isArray(parsedCached) && parsedCached.length > 0) {
							const cachedQuiz = buildQuiz(
								parsedCached,
								quizMode,
								questionCount,
								allowedContinents
							);

							if (cachedQuiz.length > 0) {
								setCountries(parsedCached);
								setQuiz(cachedQuiz);
								setMenuNotice('Offline mode: loaded cached country data.');
								setError('');
								setPhase('ready');
								loadedFromCache = true;
								logEvent('countries_cache_fallback_used', {
									countryCount: parsedCached.length,
								});
							}
						}
					}
				} catch {
					// Ignore cache parse errors.
				}

				const remainingDelay = 1500 - (Date.now() - loadingStart);
				if (remainingDelay > 0) {
					await new Promise((resolve) => window.setTimeout(resolve, remainingDelay));
				}

				if (!loadedFromCache) {
					const bundledFallback = getBundledFallbackCountries();
					const bundledQuiz = buildQuiz(
						bundledFallback,
						quizMode,
						questionCount,
						allowedContinents
					);

					if (bundledQuiz.length > 0) {
						setCountries(bundledFallback);
						setQuiz(bundledQuiz);
						setMenuNotice('Offline mode: loaded bundled country set.');
						setError('');
						setPhase('ready');
						logEvent('countries_bundled_fallback_used', {
							countryCount: bundledFallback.length,
						});
					} else {
						setError(
							'Unable to reach the countries API. Check your internet/VPN and try again.'
						);
						setPhase('error');
						logEvent('countries_load_error', { message: loadError.message || 'unknown' });
					}
				}
			} finally {
				if (progressTimer) {
					window.clearInterval(progressTimer);
				}
			}
		}

		loadCountries();

		return () => {
			if (progressTimer) {
				window.clearInterval(progressTimer);
			}
		};
	}, []);

	useEffect(() => {
		function handleResize() {
			setBackgroundTileCount(getBackgroundTileCount());
		}

		window.addEventListener('resize', handleResize);
		handleResize();

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	}, []);

	useEffect(() => {
		const pool = Array.from(new Set(countries.map((country) => country.flag).filter(Boolean)));
		if (!pool.length) {
			setBackgroundFlags(Array.from({ length: backgroundTileCount }, () => ''));
			setFadingTiles({});
			return;
		}

		setBackgroundFlags(
			Array.from({ length: backgroundTileCount }, () => pool[randomInt(0, pool.length - 1)])
		);
		setFadingTiles({});
	}, [countries, backgroundTileCount]);

	useEffect(() => {
		const pool = Array.from(new Set(countries.map((country) => country.flag).filter(Boolean)));
		if (!pool.length) {
			return undefined;
		}

		const intervalId = window.setInterval(() => {
			let updates = [];

			setBackgroundFlags((currentFlags) => {
				const swapCount = randomInt(1, 2);
				const picked = new Set();
				updates = [];

				while (picked.size < swapCount) {
					picked.add(randomInt(0, currentFlags.length - 1));
				}

				updates = Array.from(picked).map((index) => ({
					index,
					nextFlag: pickDifferentFlag(pool, currentFlags[index]),
				}));

				return currentFlags;
			});

			if (!updates.length) {
				return;
			}

			const fadeMap = {};
			updates.forEach((item) => {
				fadeMap[item.index] = item.nextFlag;
			});
			setFadingTiles((prev) => ({ ...prev, ...fadeMap }));

			window.setTimeout(() => {
				setBackgroundFlags((currentFlags) => {
					const nextFlags = [...currentFlags];
					updates.forEach((item) => {
						nextFlags[item.index] = item.nextFlag;
					});
					return nextFlags;
				});

				setFadingTiles((prev) => {
					const copy = { ...prev };
					updates.forEach((item) => {
						delete copy[item.index];
					});
					return copy;
				});
			}, 1700);
		}, 4300);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [countries]);

	function startQuiz() {
		const freshQuiz = buildQuiz(countries, quizMode, questionCount, allowedContinents);
		if (!freshQuiz.length) {
			setError('No quiz-ready countries match the selected options.');
			setPhase('error');
			return;
		}

		setQuiz(freshQuiz);
		setCurrentIndex(0);
		setScore(0);
		setSelectedAnswer('');
		setFeedback('');
		setFeedbackType('');
		setMistakes([]);
		setMenuNotice('');
		setShowOptionsPanel(false);
		setPhase('playing');
		navigate('/quiz');
	}

	function showOptions() {
		setShowOptionsPanel((value) => !value);
		setMenuNotice('');
	}

	function openStudySets() {
		setShowOptionsPanel(false);
		setMenuNotice('');
		navigate('/study-sets');
	}

	function openUserHistory() {
		setShowOptionsPanel(false);
		setMenuNotice('');
		navigate('/user-history');
	}

	function openLeaderboard() {
		setShowOptionsPanel(false);
		setMenuNotice('');
		navigate('/leaderboard');
	}

	function backToMenuHome() {
		setMenuNotice('');
		navigate('/');
	}

	function openAuthPage() {
		setShowOptionsPanel(false);
		setMenuNotice('');
		navigate('/auth');
	}

	function openUserPage() {
		setShowOptionsPanel(false);
		setMenuNotice('');
		navigate('/user');
	}

	function signOutUser() {
		setCurrentUser(null);
		setMenuNotice('Signed out.');
		navigate('/');
	}

	async function handleSignUp(credentials) {
		const name = credentials.name?.trim();
		const email = credentials.email?.trim().toLowerCase();
		const password = credentials.password ?? '';

		if (!name || !email || !password) {
			return { ok: false, message: 'Please complete all sign-up fields.' };
		}

		const exists = registeredUsers.some((user) => user.email === email);
		if (exists) {
			return { ok: false, message: 'An account with this email already exists.' };
		}

		const newUser = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			name,
			email,
			passwordHash: await hashPassword(password),
			createdAt: Date.now(),
			history: [],
		};

		setRegisteredUsers((current) => [...current, newUser]);
		setCurrentUser({
			name: newUser.name,
			email: newUser.email,
			createdAt: newUser.createdAt,
			history: [],
		});
		setMenuNotice('');
		navigate('/user');
		return { ok: true, message: 'Account created successfully.' };
	}

	async function handleLogIn(credentials) {
		const email = credentials.email?.trim().toLowerCase();
		const password = credentials.password ?? '';

		if (!email || !password) {
			return { ok: false, message: 'Please enter both email and password.' };
		}

		const passwordHash = await hashPassword(password);
		const matchedUser = registeredUsers.find(
			(user) => user.email === email && user.passwordHash === passwordHash
		);
		if (!matchedUser) {
			return { ok: false, message: 'Invalid email or password.' };
		}

		setCurrentUser({
			name: matchedUser.name,
			email: matchedUser.email,
			createdAt: matchedUser.createdAt,
			history: Array.isArray(matchedUser.history) ? matchedUser.history : [],
		});
		setMenuNotice('');
		navigate('/user');
		return { ok: true, message: 'Logged in successfully.' };
	}

	function addLeaderboardEntry(finalScore) {
		const total = quiz.length || questionCount;
		const accuracy = total > 0 ? Math.round((finalScore / total) * 100) : 0;
		const modeLabel =
			quizMode === 'flags'
				? 'Flags Only'
				: quizMode === 'capitals'
					? 'Capitals Only'
					: 'Flags + Capitals';

		const entry = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			score: finalScore,
			total,
			accuracy,
			mode: modeLabel,
			questions: questionCount,
			continents: allowedContinents.join(', '),
			playedAt: Date.now(),
			userEmail: currentUser?.email ?? '',
			userName: currentUser?.name ?? '',
		};

		setLeaderboardEntries((current) =>
			[entry, ...current]
				.sort((a, b) => {
					if (b.accuracy !== a.accuracy) {
						return b.accuracy - a.accuracy;
					}
					if (b.score !== a.score) {
						return b.score - a.score;
					}
					return b.playedAt - a.playedAt;
				})
				.slice(0, 30)
		);

		// Save to user history if logged in
		if (currentUser && currentUser.email) {
			const updatedHistory = [
				entry,
				...(Array.isArray(currentUser.history) ? currentUser.history : []),
			].slice(0, 100);
			setCurrentUser((current) =>
				current
					? {
							...current,
							history: updatedHistory,
							lastPlayedAt: entry.playedAt,
						}
					: current
			);

			setRegisteredUsers((currentUsers) =>
				currentUsers.map((user) =>
					user.email === currentUser.email
						? { ...user, history: updatedHistory, lastPlayedAt: entry.playedAt }
						: user
				)
			);

			setUserHistory((prev) => {
				const userEmail = currentUser.email;
				const userEntries = prev[userEmail] || [];
				return {
					...prev,
					[userEmail]: [entry, ...userEntries].slice(0, 100),
				};
			});
		}
	}

	function handleAnswer(choice) {
		if (phase !== 'playing' || selectedAnswer) {
			return;
		}

		setSelectedAnswer(choice);
		const isCorrect = choice === currentQuestion.answer;

		if (isCorrect) {
			setScore((value) => value + 1);
			setFeedback('Correct.');
			setFeedbackType('correct');
		} else {
			setFeedback(`Incorrect. The correct answer is ${currentQuestion.answer}.`);
			setFeedbackType('wrong');
			setMistakes((currentMistakes) => [
				...currentMistakes,
				{
					prompt: currentQuestion.prompt,
					correct: currentQuestion.answer,
					picked: choice,
				},
			]);
		}

		window.setTimeout(() => {
			setSelectedAnswer('');
			setFeedback('');
			setFeedbackType('');
			if (currentIndex + 1 >= quiz.length) {
				const finalScore = isCorrect ? score + 1 : score;
				addLeaderboardEntry(finalScore);
				setPhase('results');
				navigate('/results');
			} else {
				setCurrentIndex((value) => value + 1);
			}
		}, 900);
	}

	function restartQuiz() {
		if (!countries.length) {
			return;
		}
		const freshQuiz = buildQuiz(countries, quizMode, questionCount, allowedContinents);
		setQuiz(freshQuiz);
		setCurrentIndex(0);
		setScore(0);
		setSelectedAnswer('');
		setFeedback('');
		setFeedbackType('');
		setMistakes([]);
		setPhase('playing');
		navigate('/quiz');
	}

	function updateQuestionCount(value) {
		const parsed = Number(value);
		if (Number.isNaN(parsed)) {
			return;
		}
		if (QUESTION_COUNT_OPTIONS.includes(parsed)) {
			setQuestionCount(parsed);
		}
	}

	function toggleContinent(region) {
		setAllowedContinents((current) => {
			if (current.includes(region)) {
				if (current.length === 1) {
					return current;
				}
				return current.filter((value) => value !== region);
			}
			return [...current, region];
		});
	}

	return (
		<main className={`app-shell ${phase === 'playing' ? 'play-screen' : ''}`}>
			{!hideFlagWall && (
				<div className="flag-wall" aria-hidden="true">
					{backgroundFlags.map((flag, index) => (
						<div key={`bg-tile-${index}`} className="flag-tile">
							{flag ? (
								<>
									<img
										className={`flag-layer flag-base ${fadingTiles[index] ? 'fade-out' : ''}`}
										src={flag}
										alt=""
										loading="lazy"
									/>
									{fadingTiles[index] && (
										<img
											className="flag-layer flag-next fade-in"
											src={fadingTiles[index]}
											alt=""
											loading="lazy"
										/>
									)}
								</>
							) : (
								<span className="flag-placeholder" />
							)}
						</div>
					))}
				</div>
			)}

			{phase !== 'playing' && phase !== 'results' && (
				<section className="hero-card">
					<div>
						<h1 className="geo-title">GEOQUIZ</h1>
					</div>

					<div className="auth-strip">
						{currentUser ? (
							<>
								<button className="primary-button" onClick={openUserPage}>
									User Page
								</button>
								<button className="secondary-button" onClick={signOutUser}>
									Sign Out
								</button>
							</>
						) : (
							<button className="primary-button" onClick={openAuthPage}>
								Sign In
							</button>
						)}
					</div>
				</section>
			)}

			<section className="quiz-card">
				{phase === 'playing' && (
					<div className="topbar">
						<div>
							<span className="section-label">Quiz progress</span>
							<div className="progress-track" aria-hidden="true">
								<div className="progress-fill" style={{ width: `${progress}%` }} />
							</div>
						</div>
						<span className="progress-text">{progress}%</span>
					</div>
				)}

				{phase === 'loading' && <LoadingPage loadingProgress={loadingProgress} />}

				{phase === 'error' && <ErrorPage error={error} onRetry={() => window.location.reload()} />}

				{phase === 'ready' && (
					<Routes>
						<Route
							path="/"
							element={
								<ReadyHomePage
									quizMode={quizMode}
									setQuizMode={setQuizMode}
									startQuiz={startQuiz}
									showOptions={showOptions}
									openStudySets={openStudySets}
									openUserHistory={openUserHistory}
									openLeaderboard={openLeaderboard}
									showOptionsPanel={showOptionsPanel}
									questionCount={questionCount}
									updateQuestionCount={updateQuestionCount}
									questionCountOptions={QUESTION_COUNT_OPTIONS}
									continentOptions={CONTINENT_OPTIONS}
									allowedContinents={allowedContinents}
									toggleContinent={toggleContinent}
									menuNotice={menuNotice}
								/>
							}
						/>
						<Route
							path="/study-sets"
							element={
								<StudySetsPage
									showStudyCapitals={showStudyCapitals}
									setShowStudyCapitals={setShowStudyCapitals}
									studyContinent={studyContinent}
									setStudyContinent={setStudyContinent}
									studyContinentOptions={STUDY_CONTINENT_OPTIONS}
									studyCountries={studyCountries}
									onBack={backToMenuHome}
								/>
							}
						/>
						<Route
							path="/user-history"
							element={
								<UserHistoryPage
									currentUser={currentUser}
									entries={currentUserHistoryEntries}
									onBack={backToMenuHome}
									formatTimestamp={formatTimestamp}
								/>
							}
						/>
						<Route
							path="/leaderboard"
							element={
								<LeaderboardPage
									leaderboardEntries={leaderboardEntries}
									onBack={backToMenuHome}
									formatTimestamp={formatTimestamp}
								/>
							}
						/>
						<Route
							path="/auth"
							element={
								<AuthPage onBack={backToMenuHome} onSignUp={handleSignUp} onLogIn={handleLogIn} />
							}
						/>
						<Route
							path="/user"
							element={
								<UserPage user={currentUser} onBack={backToMenuHome} onOpenAuth={openAuthPage} />
							}
						/>
						<Route path="*" element={<Navigate to="/" replace />} />
					</Routes>
				)}

				{phase === 'playing' && currentQuestion && (
					<PlayingPage
						currentIndex={currentIndex}
						quiz={quiz}
						currentQuestion={currentQuestion}
						selectedAnswer={selectedAnswer}
						handleAnswer={handleAnswer}
						feedback={feedback}
						feedbackType={feedbackType}
					/>
				)}

				{phase === 'results' && (
					<ResultsPage score={score} quiz={quiz} mistakes={mistakes} restartQuiz={restartQuiz} />
				)}
			</section>
		</main>
	);
}
