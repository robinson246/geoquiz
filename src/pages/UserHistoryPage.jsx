export default function UserHistoryPage({ currentUser, entries, onBack, formatTimestamp }) {
	if (!currentUser) {
		return (
			<div className="menu-page-panel">
				<div className="menu-page-head">
					<h3>User History</h3>
					<button className="secondary-button slim" onClick={onBack}>
						Back
					</button>
				</div>
				<p className="menu-note">Please sign in to view your quiz history.</p>
			</div>
		);
	}

	const userEntries = Array.isArray(entries) ? entries : [];

	const totalQuizzes = userEntries.length;
	let totalScore = 0;
	let totalQuestions = 0;
	let bestScore = 0;
	let bestAccuracy = 0;

	userEntries.forEach((entry) => {
		totalScore += entry.score;
		totalQuestions += entry.total;
		if (entry.score > bestScore) {
			bestScore = entry.score;
		}
		if (entry.accuracy > bestAccuracy) {
			bestAccuracy = entry.accuracy;
		}
	});

	const overallAccuracy = totalQuestions > 0 ? Math.round((totalScore / totalQuestions) * 100) : 0;
	const averageScore = totalQuizzes > 0 ? (totalScore / totalQuizzes).toFixed(1) : 0;

	return (
		<div className="menu-page-panel">
			<div className="menu-page-head">
				<div>
					<h3>User Activity</h3>
					<p className="menu-note">
						{currentUser.name} · {currentUser.email}
					</p>
				</div>
				<button className="secondary-button slim" onClick={onBack}>
					Back
				</button>
			</div>

			<div className="user-stats-container">
				<div className="stat-card">
					<div className="stat-value">{totalQuizzes}</div>
					<div className="stat-label">Quizzes Played</div>
				</div>
				<div className="stat-card">
					<div className="stat-value">{averageScore}</div>
					<div className="stat-label">Average Score</div>
				</div>
				<div className="stat-card">
					<div className="stat-value">{bestScore}</div>
					<div className="stat-label">Best Score</div>
				</div>
				<div className="stat-card">
					<div className="stat-value">{overallAccuracy}%</div>
					<div className="stat-label">Overall Accuracy</div>
				</div>
			</div>

			{userEntries.length === 0 ? (
				<p className="menu-note">No quiz history yet. Play a quiz to get started!</p>
			) : (
				<div className="leaderboard-table-wrap">
					<table className="leaderboard-table">
						<thead>
							<tr>
								<th>#</th>
								<th>Score</th>
								<th>Accuracy</th>
								<th>Mode</th>
								<th>Played</th>
							</tr>
						</thead>
						<tbody>
							{userEntries.map((entry, index) => (
								<tr key={entry.id}>
									<td>{index + 1}</td>
									<td>
										{entry.score}/{entry.total}
									</td>
									<td>{entry.accuracy}%</td>
									<td>{entry.mode}</td>
									<td>{formatTimestamp(entry.playedAt)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
