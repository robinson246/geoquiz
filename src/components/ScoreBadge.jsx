export default function ScoreBadge({ label, value }) {
	return (
		<div className="badge">
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}
