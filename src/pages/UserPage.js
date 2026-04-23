export default function UserPage({ user, onBack, onOpenAuth }) {
	if (!user) {
		return (
			<div className="menu-page-panel user-panel">
				<div className="menu-page-head">
					<h3>User Page</h3>
					<button className="secondary-button slim" onClick={onBack}>
						Back
					</button>
				</div>
				<p className="menu-note">You are not signed in.</p>
				<button className="primary-button" onClick={onOpenAuth}>
					Go to Sign In
				</button>
			</div>
		);
	}

	return (
		<div className="menu-page-panel user-panel">
			<div className="menu-page-head">
				<h3>User Page</h3>
				<button className="secondary-button slim" onClick={onBack}>
					Back
				</button>
			</div>

			<div className="user-info-card">
				<p>
					<strong>Name:</strong> {user.name}
				</p>
				<p>
					<strong>Email:</strong> {user.email}
				</p>
			</div>

			<p className="menu-note">You are signed in and ready to play.</p>
		</div>
	);
}
