export default function ReadyHomePage({
	quizMode,
	setQuizMode,
	startQuiz,
	showOptions,
	openStudySets,
	openUserHistory,
	openLeaderboard,
	showOptionsPanel,
	questionCount,
	updateQuestionCount,
	questionCountOptions,
	continentOptions,
	allowedContinents,
	toggleContinent,
	menuNotice,
	canResumeQuiz,
	canReviewResults,
	onResumeQuiz,
}) {
	return (
		<div className="status-panel ready">
			<div className="mode-picker">
				<p>Select a quiz mode:</p>
				<div className="mode-grid">
					<button
						className={`mode-button ${quizMode === 'flags' ? 'active' : ''}`}
						onClick={() => setQuizMode('flags')}
					>
						Flags Only
					</button>
					<button
						className={`mode-button ${quizMode === 'capitals' ? 'active' : ''}`}
						onClick={() => setQuizMode('capitals')}
					>
						Capitals Only
					</button>
					<button
						className={`mode-button ${quizMode === 'mixed' ? 'active' : ''}`}
						onClick={() => setQuizMode('mixed')}
					>
						Flags + Capitals
					</button>
				</div>
			</div>

			<div className="menu-actions">
				<button className="primary-button" onClick={startQuiz}>
					Play
				</button>
				{(canResumeQuiz || canReviewResults) && (
					<button className="secondary-button" onClick={onResumeQuiz}>
						{canResumeQuiz ? 'Resume Quiz' : 'Review Results'}
					</button>
				)}
				<button className="secondary-button" onClick={showOptions}>
					Options
				</button>
				<button className="secondary-button" onClick={openStudySets}>
					Study Sets
				</button>
				<button className="secondary-button" onClick={openUserHistory}>
					User History
				</button>
				<button className="secondary-button" onClick={openLeaderboard}>
					Leaderboard
				</button>
			</div>

			{showOptionsPanel && (
				<div className="options-panel">
					<div className="option-group">
						<label htmlFor="questionCountSelect">Questions</label>
						<select
							id="questionCountSelect"
							value={questionCount}
							onChange={(event) => updateQuestionCount(event.target.value)}
						>
							{questionCountOptions.map((count) => (
								<option key={count} value={count}>
									{count}
								</option>
							))}
						</select>
					</div>

					<div className="option-group">
						<span>Continents</span>
						<div className="continent-grid">
							{continentOptions.map((continent) => {
								const checked = allowedContinents.includes(continent);
								return (
									<label key={continent} className={`continent-chip ${checked ? 'active' : ''}`}>
										<input
											type="checkbox"
											checked={checked}
											onChange={() => toggleContinent(continent)}
										/>
										<span>{continent}</span>
									</label>
								);
							})}
						</div>
					</div>
				</div>
			)}

			{menuNotice && <p className="menu-notice">{menuNotice}</p>}
		</div>
	);
}
