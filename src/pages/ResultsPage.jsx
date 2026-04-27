import ScoreBadge from '../components/ScoreBadge.jsx';

export default function ResultsPage({ score, quiz, mistakes, restartQuiz, onBackToMenu }) {
	const accuracy = quiz.length > 0 ? Math.round((score / quiz.length) * 100) : 0;

	return (
		<div className="results-panel">
			<h2>Assessment complete</h2>
			<p>
				You scored <strong>{score}</strong> out of <strong>{quiz.length}</strong>.
			</p>
			<div className="score-strip">
				<ScoreBadge label="Score" value={`${score}/${quiz.length}`} />
				<ScoreBadge label="Accuracy" value={`${accuracy}%`} />
			</div>
			<div className="mistake-box">
				<h3>Review</h3>
				{mistakes.length === 0 ? (
					<p>Perfect score — no mistakes to review.</p>
				) : (
					<ul>
						{mistakes.map((item) => (
							<li key={`${item.prompt}-${item.correct}`}>
								<strong>{item.prompt}</strong>
								<span>
									Your answer: {item.picked} · Correct answer: {item.correct}
								</span>
							</li>
						))}
					</ul>
				)}
			</div>
			<div className="results-actions">
				<button className="primary-button" onClick={restartQuiz}>
					Start New Attempt
				</button>
				<button className="secondary-button" onClick={() => onBackToMenu('Results saved. Back at the main menu.')}>
					Back to Menu
				</button>
			</div>
		</div>
	);
}
