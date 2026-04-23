export default function PlayingPage({
	currentIndex,
	quiz,
	currentQuestion,
	selectedAnswer,
	handleAnswer,
	feedback,
	feedbackType,
}) {
	const capitalMedia =
		typeof currentQuestion.media === 'string'
			? { name: currentQuestion.media, flag: '' }
			: currentQuestion.media || { name: '', flag: '' };

	return (
		<div className="question-layout">
			<div className="question-copy">
				<span className="question-number">
					Question {currentIndex + 1} of {quiz.length}
				</span>
				<h2>{currentQuestion.prompt}</h2>
				<p className="question-meta">
					{currentQuestion.type === 'flag' ? 'Flag challenge' : 'Capital challenge'}
				</p>
			</div>

			<div className="media-panel">
				{currentQuestion.type === 'flag' ? (
					<img src={currentQuestion.media} alt="Country flag for quiz question" />
				) : (
					<div className="capital-media">
						{capitalMedia.flag && (
							<img
								className="capital-flag"
								src={capitalMedia.flag}
								alt={`${capitalMedia.name} flag`}
							/>
						)}
						<div className="capital-chip">
							<span>{capitalMedia.name}</span>
						</div>
					</div>
				)}
			</div>

			<div className="choices-grid">
				{currentQuestion.choices.map((choice) => {
					const isCorrectChoice = selectedAnswer && choice === currentQuestion.answer;
					const isPicked = selectedAnswer === choice;
					const isWrongChoice =
						Boolean(selectedAnswer) && isPicked && choice !== currentQuestion.answer;

					return (
						<button
							key={choice}
							className={`choice-button ${isPicked ? 'picked' : ''} ${isCorrectChoice ? 'correct' : ''} ${isWrongChoice ? 'wrong' : ''}`}
							onClick={() => handleAnswer(choice)}
							disabled={Boolean(selectedAnswer)}
						>
							{choice}
						</button>
					);
				})}
			</div>

			<div className={`feedback-line ${feedbackType}`} role="status" aria-live="polite">
				{feedback || 'Choose one answer to continue.'}
			</div>
		</div>
	);
}
