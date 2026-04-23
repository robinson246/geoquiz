export default function LeaderboardPage({ leaderboardEntries, onBack, formatTimestamp }) {
	return (
		<div className="menu-page-panel">
			<div className="menu-page-head">
				<h3>Leaderboard</h3>
				<button className="secondary-button slim" onClick={onBack}>
					Back
				</button>
			</div>

			{leaderboardEntries.length === 0 ? (
				<p className="menu-note">No leaderboard entries yet. Finish a quiz to create one.</p>
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
							{leaderboardEntries.slice(0, 10).map((entry, index) => (
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
