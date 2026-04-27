import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import LoadingPage from './pages/LoadingPage.jsx';
import ErrorPage from './pages/ErrorPage.jsx';
import ReadyHomePage from './pages/ReadyHomePage.jsx';
import StudySetsPage from './pages/StudySetsPage.jsx';
import UserHistoryPage from './pages/UserHistoryPage.jsx';
import PlayingPage from './pages/PlayingPage.jsx';
import ResultsPage from './pages/ResultsPage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import UserPage from './pages/UserPage.jsx';
import { backendApi, fetchJsonWithRetry } from './utils/api.js';
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
const COUNTRIES_CACHE_STORAGE_KEY = 'geoquizCountriesCacheV1';
const QUIZ_SESSION_STORAGE_KEY = 'geoquizSessionV1';
const AUTH_TOKEN_STORAGE_KEY = 'geoquizAuthTokenV1';

const API_FALLBACK_URLS = [
	API_URL,
	'https://restcountries.com/v3.1/all?fields=name,capital,flags,cca3,region',
	'https://raw.githubusercontent.com/mledoze/countries/master/countries.json',
];

const STUDY_CONTINENT_OPTIONS = ['All', ...CONTINENT_OPTIONS];
const MIN_LOADING_MS = import.meta.env.MODE === 'test' ? 0 : 1500;

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

function sanitizeQuizMode(value) {
	return value === 'flags' || value === 'capitals' || value === 'mixed' ? value : 'mixed';
}

function sanitizeQuestionCount(value) {
	const parsed = Number(value);
	return QUESTION_COUNT_OPTIONS.includes(parsed) ? parsed : DEFAULT_QUESTION_COUNT;
}

function sanitizeAllowedContinents(value) {
	if (!Array.isArray(value)) {
		return CONTINENT_OPTIONS;
	}

	const filtered = value.filter((continent) => CONTINENT_OPTIONS.includes(continent));
	return filtered.length > 0 ? filtered : CONTINENT_OPTIONS;
}

function readStoredQuizSession() {
	if (typeof window === 'undefined') {
		return null;
	}

	try {
		const raw = window.localStorage.getItem(QUIZ_SESSION_STORAGE_KEY);
		if (!raw) {
			return null;
		}

		const parsed = JSON.parse(raw);
		return typeof parsed === 'object' && parsed !== null ? parsed : null;
	} catch {
		return null;
	}
}

function getInitialQuizSession() {
	const storedSession = readStoredQuizSession();
	const quiz = Array.isArray(storedSession?.quiz) ? storedSession.quiz : [];
	const phase =
		(storedSession?.phase === 'playing' || storedSession?.phase === 'results') && quiz.length > 0
			? storedSession.phase
			: 'ready';
	const maxIndex = Math.max(quiz.length - 1, 0);
	const currentIndex = Number.isInteger(storedSession?.currentIndex)
		? Math.max(0, Math.min(storedSession.currentIndex, maxIndex))
		: 0;

	return {
		phase,
		quiz,
		quizMode: sanitizeQuizMode(storedSession?.quizMode),
		questionCount: sanitizeQuestionCount(storedSession?.questionCount),
		allowedContinents: sanitizeAllowedContinents(storedSession?.allowedContinents),
		currentIndex,
		score: Number.isFinite(storedSession?.score) ? Math.max(0, storedSession.score) : 0,
		mistakes: Array.isArray(storedSession?.mistakes) ? storedSession.mistakes : [],
	};
}

export default function App() {
	const [initialQuizSession] = useState(() => getInitialQuizSession());
	const [countries, setCountries] = useState([]);
	const [quiz, setQuiz] = useState(initialQuizSession.quiz);
	const [phase, setPhase] = useState(initialQuizSession.phase);
	const [quizMode, setQuizMode] = useState(initialQuizSession.quizMode);
	const [questionCount, setQuestionCount] = useState(initialQuizSession.questionCount);
	const [allowedContinents, setAllowedContinents] = useState(initialQuizSession.allowedContinents);
	const [showOptionsPanel, setShowOptionsPanel] = useState(false);
	const [showStudyCapitals, setShowStudyCapitals] = useState(true);
	const [studyContinent, setStudyContinent] = useState('All');
	const [dataStatus, setDataStatus] = useState('loading');
	const [loadingProgress, setLoadingProgress] = useState(8);
	const [currentIndex, setCurrentIndex] = useState(initialQuizSession.currentIndex);
	const [score, setScore] = useState(initialQuizSession.score);
	const [selectedAnswer, setSelectedAnswer] = useState('');
	const [feedback, setFeedback] = useState('');
	const [feedbackType, setFeedbackType] = useState('');
	const [mistakes, setMistakes] = useState(initialQuizSession.mistakes);
	const [error, setError] = useState('');
	const [menuNotice, setMenuNotice] = useState('');
	const [backgroundTileCount, setBackgroundTileCount] = useState(() => getBackgroundTileCount());
	const [backgroundFlags, setBackgroundFlags] = useState(
		Array.from({ length: DEFAULT_BG_TILE_COUNT }, () => '')
	);
	const [fadingTiles, setFadingTiles] = useState({});
	const [leaderboardEntries, setLeaderboardEntries] = useState([]);
	const [leaderboardHydrated, setLeaderboardHydrated] = useState(false);
	const [userHistory, setUserHistory] = useState({});
	const [userHistoryHydrated, setUserHistoryHydrated] = useState(false);
	const [currentUser, setCurrentUser] = useState(null);
	const [authHydrated, setAuthHydrated] = useState(false);
	const [authToken, setAuthToken] = useState('');
	const [activeSessionId, setActiveSessionId] = useState('');
	const [studyProgress, setStudyProgress] = useState({});
	const [loadRevision, setLoadRevision] = useState(0);
	const answerTimeoutRef = useRef(null);
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

		return [];
	}, [currentUser, leaderboardEntries, userHistory]);

	const canRenderQuizRoute = phase === 'playing' && quiz.length > 0 && Boolean(currentQuestion);
	const canRenderResultsRoute = phase === 'results' && quiz.length > 0;
	const hasActiveSession = canRenderQuizRoute || canRenderResultsRoute;

	const showFlagWall = location.pathname === '/' || location.pathname === '/quiz';
	const showHeroCard =
		dataStatus !== 'loading' &&
		dataStatus !== 'error' &&
		location.pathname !== '/quiz' &&
		location.pathname !== '/results';

	useEffect(() => {
		logEvent('page_view', {
			path: location.pathname,
			phase,
		});
	}, [location.pathname, phase]);

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
		} finally {
			setLeaderboardHydrated(true);
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
		} finally {
			setUserHistoryHydrated(true);
		}
	}, []);

	useEffect(() => {
		let cancelled = false;

		async function loadAuthData() {
			try {
				const storedToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '';
				if (storedToken) {
					const response = await backendApi.getMe(storedToken);
					if (!cancelled && response.user) {
						setAuthToken(storedToken);
						setCurrentUser(response.user);
					}
				}
			} catch {
				if (!cancelled) {
					setAuthToken('');
					setCurrentUser(null);
					window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
				}
			} finally {
				if (!cancelled) {
					setAuthHydrated(true);
				}
			}
		}

		loadAuthData();

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!leaderboardHydrated) {
			return;
		}

		try {
			window.localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(leaderboardEntries));
		} catch {
			// Ignore storage errors.
		}
	}, [leaderboardEntries, leaderboardHydrated]);

	useEffect(() => {
		if (!userHistoryHydrated) {
			return;
		}

		try {
			window.localStorage.setItem(USER_HISTORY_STORAGE_KEY, JSON.stringify(userHistory));
		} catch {
			// Ignore storage errors.
		}
	}, [userHistory, userHistoryHydrated]);

	useEffect(() => {
		if (!authHydrated) {
			return;
		}

		try {
			if (authToken) {
				window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, authToken);
			} else {
				window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
			}
		} catch {
			// Ignore storage errors.
		}
	}, [authHydrated, authToken]);

	useEffect(() => {
		let cancelled = false;

		async function loadLeaderboard() {
			try {
				const response = await backendApi.getLeaderboard();
				if (!cancelled && Array.isArray(response.entries)) {
					setLeaderboardEntries(response.entries);
				}
			} catch {
				// Keep local fallback if API is unavailable.
			}
		}

		loadLeaderboard();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!authToken || !currentUser?.email) {
			return;
		}

		let cancelled = false;

		async function loadUserData() {
			try {
				const [historyResponse, sessionResponse, progressResponse] = await Promise.all([
					backendApi.getUserHistory(authToken),
					backendApi.getActiveSession(authToken),
					backendApi.getStudyProgress(authToken),
				]);

				if (cancelled) {
					return;
				}

				if (Array.isArray(historyResponse.results)) {
					setUserHistory((prev) => ({
						...prev,
						[currentUser.email]: historyResponse.results,
					}));
					setCurrentUser((current) =>
						current ? { ...current, history: historyResponse.results } : current
					);
				}

				if (sessionResponse.session && phase === 'ready') {
					setActiveSessionId(sessionResponse.session.id);
					setQuiz(sessionResponse.session.quiz || []);
					setQuizMode(sanitizeQuizMode(sessionResponse.session.quizMode));
					setQuestionCount(sanitizeQuestionCount(sessionResponse.session.questionCount));
					setAllowedContinents(sanitizeAllowedContinents(sessionResponse.session.allowedContinents));
					setCurrentIndex(sessionResponse.session.currentIndex || 0);
					setScore(sessionResponse.session.score || 0);
					setMistakes(sessionResponse.session.mistakes || []);
					setPhase('playing');
				}

				if (Array.isArray(progressResponse.progress)) {
					setStudyProgress(
						progressResponse.progress.reduce((map, item) => {
							map[item.countryCode] = item;
							return map;
						}, {})
					);
				}
			} catch {
				// User-specific persistence is optional while developing without the API.
			}
		}

		loadUserData();
		return () => {
			cancelled = true;
		};
	}, [authToken, currentUser?.email, phase]);

	useEffect(() => {
		if (phase !== 'playing' && phase !== 'results') {
			try {
				window.localStorage.removeItem(QUIZ_SESSION_STORAGE_KEY);
			} catch {
				// Ignore storage errors.
			}
			return;
		}

		try {
			window.localStorage.setItem(
				QUIZ_SESSION_STORAGE_KEY,
				JSON.stringify({
					phase,
					quiz,
					quizMode,
					questionCount,
					allowedContinents,
					currentIndex,
					score,
					mistakes,
				})
			);
		} catch {
			// Ignore storage errors.
		}
	}, [allowedContinents, currentIndex, mistakes, phase, questionCount, quiz, quizMode, score]);

	useEffect(() => {
		return () => {
			if (answerTimeoutRef.current) {
				window.clearTimeout(answerTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		let progressTimer;

		async function loadCountries() {
			const loadingStart = Date.now();

			try {
				setDataStatus('loading');
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

				const remainingDelay = MIN_LOADING_MS - (Date.now() - loadingStart);
				if (remainingDelay > 0) {
					await new Promise((resolve) => window.setTimeout(resolve, remainingDelay));
				}

				setLoadingProgress(100);
				setDataStatus('ready');
				setError('');
				if (initialQuizSession.phase !== 'playing' && initialQuizSession.phase !== 'results') {
					setPhase('ready');
				}
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
							setCountries(parsedCached);
							setMenuNotice('Offline mode: loaded cached country data.');
							setError('');
							setDataStatus('ready');
							if (initialQuizSession.phase !== 'playing' && initialQuizSession.phase !== 'results') {
								setPhase('ready');
							}
							loadedFromCache = true;
							logEvent('countries_cache_fallback_used', {
								countryCount: parsedCached.length,
							});
						}
					}
				} catch {
					// Ignore cache parse errors.
				}

				const remainingDelay = MIN_LOADING_MS - (Date.now() - loadingStart);
				if (remainingDelay > 0) {
					await new Promise((resolve) => window.setTimeout(resolve, remainingDelay));
				}

				if (!loadedFromCache) {
					const bundledFallback = getBundledFallbackCountries();

					if (bundledFallback.length > 0) {
						setCountries(bundledFallback);
						setMenuNotice('Offline mode: loaded bundled country set.');
						setError('');
						setDataStatus('ready');
						if (initialQuizSession.phase !== 'playing' && initialQuizSession.phase !== 'results') {
							setPhase('ready');
						}
						logEvent('countries_bundled_fallback_used', {
							countryCount: bundledFallback.length,
						});
					} else {
						setError(
							'Unable to reach the countries API. Check your internet/VPN and try again.'
						);
						setDataStatus('error');
						setPhase('ready');
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
	}, [initialQuizSession.phase, loadRevision]);

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
		if (!showFlagWall || !pool.length) {
			setBackgroundFlags(Array.from({ length: backgroundTileCount }, () => ''));
			setFadingTiles({});
			return;
		}

		setBackgroundFlags(
			Array.from({ length: backgroundTileCount }, () => pool[randomInt(0, pool.length - 1)])
		);
		setFadingTiles({});
	}, [backgroundTileCount, countries, showFlagWall]);

	useEffect(() => {
		const pool = Array.from(new Set(countries.map((country) => country.flag).filter(Boolean)));
		if (!showFlagWall || !pool.length) {
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
	}, [countries, showFlagWall]);

	function retryLoadCountries() {
		setError('');
		setMenuNotice('');
		setLoadRevision((value) => value + 1);
	}

	function clearAnswerTimeout() {
		if (answerTimeoutRef.current) {
			window.clearTimeout(answerTimeoutRef.current);
			answerTimeoutRef.current = null;
		}
	}

	function resetQuizFeedback() {
		clearAnswerTimeout();
		setSelectedAnswer('');
		setFeedback('');
		setFeedbackType('');
	}

	function abandonQuiz(notice = 'Quiz ended. You can start a new attempt anytime.') {
		if (authToken && activeSessionId) {
			backendApi.abandonSession(activeSessionId, authToken).catch(() => {});
		}
		resetQuizFeedback();
		setQuiz([]);
		setActiveSessionId('');
		setCurrentIndex(0);
		setScore(0);
		setMistakes([]);
		setPhase('ready');
		setMenuNotice(notice);
		navigate('/');
	}

	function resumeAttempt() {
		if (phase === 'playing' && quiz.length > 0 && currentQuestion) {
			navigate('/quiz');
			return;
		}

		if (phase === 'results' && quiz.length > 0) {
			navigate('/results');
		}
	}

	async function startQuiz() {
		const freshQuiz = buildQuiz(countries, quizMode, questionCount, allowedContinents);
		if (!freshQuiz.length) {
			setMenuNotice('No quiz-ready countries match the selected options.');
			setShowOptionsPanel(true);
			setPhase('ready');
			navigate('/');
			return;
		}

		setQuiz(freshQuiz);
		setCurrentIndex(0);
		setScore(0);
		resetQuizFeedback();
		setMistakes([]);
		setMenuNotice('');
		setShowOptionsPanel(false);
		setPhase('playing');
		if (authToken) {
			try {
				const response = await backendApi.createSession(
					{
						quizMode,
						questionCount,
						allowedContinents,
						quiz: freshQuiz,
						currentIndex: 0,
						score: 0,
						mistakes: [],
					},
					authToken
				);
				setActiveSessionId(response.session?.id || '');
			} catch {
				setActiveSessionId('');
			}
		}
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
		if (authToken) {
			backendApi.logOut(authToken).catch(() => {});
		}
		setAuthToken('');
		setCurrentUser(null);
		setActiveSessionId('');
		setStudyProgress({});
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

		try {
			const response = await backendApi.signUp({ name, email, password });
			setAuthToken(response.token || '');
			setCurrentUser({ ...response.user, history: [] });
			setMenuNotice('');
			navigate('/user');
			return { ok: true, message: 'Account created successfully.' };
		} catch (error) {
			return { ok: false, message: error.message || 'Unable to create account.' };
		}
	}

	async function handleLogIn(credentials) {
		const email = credentials.email?.trim().toLowerCase();
		const password = credentials.password ?? '';

		if (!email || !password) {
			return { ok: false, message: 'Please enter both email and password.' };
		}

		try {
			const response = await backendApi.logIn({ email, password });
			setAuthToken(response.token || '');
			setCurrentUser({ ...response.user, history: [] });
			setMenuNotice('');
			navigate('/user');
			return { ok: true, message: 'Logged in successfully.' };
		} catch (error) {
			return { ok: false, message: error.message || 'Invalid email or password.' };
		}
	}

	async function addLeaderboardEntry(finalScore) {
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
			displayName: currentUser?.name ?? 'Guest',
			mistakes,
		};

		try {
			const response = await backendApi.saveQuizResult(entry, authToken);
			const savedEntry = response.result || entry;
			setLeaderboardEntries((current) =>
				[savedEntry, ...current]
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

			if (currentUser?.email) {
				setUserHistory((prev) => ({
					...prev,
					[currentUser.email]: [savedEntry, ...(prev[currentUser.email] || [])].slice(0, 100),
				}));
				setCurrentUser((current) =>
					current
						? {
								...current,
								history: [savedEntry, ...(current.history || [])].slice(0, 100),
								lastPlayedAt: savedEntry.playedAt,
							}
						: current
				);
			}
			return;
		} catch {
			// Fall back to local persistence when the backend is unavailable.
		}

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

		answerTimeoutRef.current = window.setTimeout(async () => {
			answerTimeoutRef.current = null;
			resetQuizFeedback();
			if (currentIndex + 1 >= quiz.length) {
				const finalScore = isCorrect ? score + 1 : score;
				await addLeaderboardEntry(finalScore);
				if (authToken && activeSessionId) {
					backendApi.completeSession(activeSessionId, authToken).catch(() => {});
					setActiveSessionId('');
				}
				setPhase('results');
				navigate('/results');
			} else {
				const nextIndex = currentIndex + 1;
				setCurrentIndex(nextIndex);
				if (authToken && activeSessionId) {
					backendApi
						.updateSession(
							activeSessionId,
							{
								quiz,
								currentIndex: nextIndex,
								score: isCorrect ? score + 1 : score,
								mistakes: isCorrect
									? mistakes
									: [
											...mistakes,
											{
												prompt: currentQuestion.prompt,
												correct: currentQuestion.answer,
												picked: choice,
											},
										],
							},
							authToken
						)
						.catch(() => {});
				}
			}
		}, 900);
	}

	async function restartQuiz() {
		if (!countries.length) {
			return;
		}
		const freshQuiz = buildQuiz(countries, quizMode, questionCount, allowedContinents);
		if (!freshQuiz.length) {
			abandonQuiz('No quiz-ready countries match the selected options for a new attempt.');
			return;
		}

		setQuiz(freshQuiz);
		setCurrentIndex(0);
		setScore(0);
		resetQuizFeedback();
		setMistakes([]);
		setPhase('playing');
		setMenuNotice('');
		if (authToken) {
			try {
				const response = await backendApi.createSession(
					{
						quizMode,
						questionCount,
						allowedContinents,
						quiz: freshQuiz,
						currentIndex: 0,
						score: 0,
						mistakes: [],
					},
					authToken
				);
				setActiveSessionId(response.session?.id || '');
			} catch {
				setActiveSessionId('');
			}
		}
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

	function toggleStudyBookmark(countryCode) {
		if (!authToken) {
			return;
		}

		const normalizedCode = countryCode.toUpperCase();
		const nextProgress = {
			...(studyProgress[normalizedCode] || { countryCode: normalizedCode }),
			bookmarked: !studyProgress[normalizedCode]?.bookmarked,
		};
		setStudyProgress((current) => ({
			...current,
			[normalizedCode]: nextProgress,
		}));
		backendApi.saveStudyProgress(normalizedCode, nextProgress, authToken).catch(() => {});
	}

	return (
		<main className={`app-shell ${phase === 'playing' ? 'play-screen' : ''}`}>
			{showFlagWall && (
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

			{showHeroCard && (
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
				{location.pathname === '/quiz' && canRenderQuizRoute && (
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

				{dataStatus === 'loading' && !hasActiveSession ? (
					<LoadingPage loadingProgress={loadingProgress} />
				) : dataStatus === 'error' && !hasActiveSession ? (
					<ErrorPage error={error} onRetry={retryLoadCountries} />
				) : (
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
									canResumeQuiz={phase === 'playing' && quiz.length > 0 && Boolean(currentQuestion)}
									canReviewResults={phase === 'results' && quiz.length > 0}
									onResumeQuiz={resumeAttempt}
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
									studyProgress={studyProgress}
									canSaveStudyProgress={Boolean(authToken)}
									onToggleBookmark={toggleStudyBookmark}
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
						<Route
							path="/quiz"
							element={
								canRenderQuizRoute ? (
									<PlayingPage
										currentIndex={currentIndex}
										quiz={quiz}
										currentQuestion={currentQuestion}
										selectedAnswer={selectedAnswer}
										handleAnswer={handleAnswer}
										feedback={feedback}
										feedbackType={feedbackType}
										onQuit={abandonQuiz}
									/>
								) : (
									<Navigate to={canRenderResultsRoute ? '/results' : '/'} replace />
								)
							}
						/>
						<Route
							path="/results"
							element={
								canRenderResultsRoute ? (
									<ResultsPage
										score={score}
										quiz={quiz}
										mistakes={mistakes}
										restartQuiz={restartQuiz}
										onBackToMenu={abandonQuiz}
									/>
								) : (
									<Navigate to={canRenderQuizRoute ? '/quiz' : '/'} replace />
								)
							}
						/>
						<Route path="*" element={<Navigate to="/" replace />} />
					</Routes>
				)}
			</section>
		</main>
	);
}
