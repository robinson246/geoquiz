export default function LoadingPage({ loadingProgress }) {
	return (
		<div className="status-panel loading-panel">
			<div className="loader-globe" aria-hidden="true">
				🌍
			</div>
			<h3>Preparing your geography challenge</h3>
			<p>Loading country flags and capitals from the API...</p>
			<div className="loading-track" aria-hidden="true">
				<div className="loading-fill" style={{ width: `${Math.round(loadingProgress)}%` }} />
			</div>
			<span className="loading-label">{Math.round(loadingProgress)}%</span>
		</div>
	);
}
