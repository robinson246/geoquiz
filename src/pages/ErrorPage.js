export default function ErrorPage({ error, onRetry }) {
	return (
		<div className="status-panel error">
			<p>{error}</p>
			<button className="primary-button" onClick={onRetry}>
				Try again
			</button>
		</div>
	);
}
