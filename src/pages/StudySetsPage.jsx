import { useMemo, useState } from 'react';

export default function StudySetsPage({
	showStudyCapitals,
	setShowStudyCapitals,
	studyContinent,
	setStudyContinent,
	studyContinentOptions,
	studyCountries,
	studyProgress,
	canSaveStudyProgress,
	onToggleBookmark,
	onBack,
}) {
	const [countrySearch, setCountrySearch] = useState('');
	const filteredStudyCountries = useMemo(() => {
		const query = countrySearch.trim().toLowerCase();
		if (!query) {
			return studyCountries;
		}

		return studyCountries.filter((country) => country.name.toLowerCase().includes(query));
	}, [studyCountries, countrySearch]);

	return (
		<div className="status-panel ready study-sets-page">
			<div className="menu-page-head">
				<h3>Study Sets</h3>
				<button className="secondary-button slim" onClick={onBack}>
					Back
				</button>
			</div>

			<div className="study-toolbar">
				<label className="study-checkbox">
					<input
						type="checkbox"
						checked={showStudyCapitals}
						onChange={(event) => setShowStudyCapitals(event.target.checked)}
					/>
					<span>Enable capitals</span>
				</label>

				<label className="study-filter">
					<span>Search country</span>
					<input
						type="text"
						value={countrySearch}
						onChange={(event) => setCountrySearch(event.target.value)}
						placeholder="Type country name..."
					/>
				</label>

				<label className="study-filter">
					<span>Continent</span>
					<select
						value={studyContinent}
						onChange={(event) => setStudyContinent(event.target.value)}
					>
						{studyContinentOptions.map((continent) => (
							<option key={continent} value={continent}>
								{continent}
							</option>
						))}
					</select>
				</label>
			</div>

			<p className="menu-note">
				Showing {filteredStudyCountries.length} countries
				{studyContinent === 'All' ? '' : ` in ${studyContinent}`}.
				{canSaveStudyProgress ? '' : ' Sign in to save bookmarks.'}
			</p>

			<div className="study-set-grid">
				{filteredStudyCountries.map((country) => {
					const bookmarked = Boolean(studyProgress?.[country.code]?.bookmarked);
					return (
						<article key={`study-${country.code}`} className="study-set-card">
						<img
							className="study-flag"
							src={country.flag}
							alt={`${country.name} flag`}
							loading="lazy"
						/>
						<h4>{country.name}</h4>
						{showStudyCapitals && (
							<p className="study-capital">{country.capital || 'No capital listed'}</p>
						)}
						<p>{country.region}</p>
						<button
							className="secondary-button slim"
							disabled={!canSaveStudyProgress}
							onClick={() => onToggleBookmark(country.code)}
						>
							{bookmarked ? 'Bookmarked' : 'Bookmark'}
						</button>
					</article>
					);
				})}
			</div>
		</div>
	);
}
