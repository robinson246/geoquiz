import { useState } from 'react';

export default function AuthPage({ onBack, onSignUp, onLogIn }) {
	const [activeTab, setActiveTab] = useState('login');
	const [loginEmail, setLoginEmail] = useState('');
	const [loginPassword, setLoginPassword] = useState('');
	const [signUpName, setSignUpName] = useState('');
	const [signUpEmail, setSignUpEmail] = useState('');
	const [signUpPassword, setSignUpPassword] = useState('');
	const [authMessage, setAuthMessage] = useState('');
	const [authStatus, setAuthStatus] = useState('');

	async function submitLogIn(event) {
		event.preventDefault();
		const result = await onLogIn({
			email: loginEmail,
			password: loginPassword,
		});

		setAuthMessage(result.message);
		setAuthStatus(result.ok ? 'ok' : 'error');
	}

	async function submitSignUp(event) {
		event.preventDefault();
		const result = await onSignUp({
			name: signUpName,
			email: signUpEmail,
			password: signUpPassword,
		});

		setAuthMessage(result.message);
		setAuthStatus(result.ok ? 'ok' : 'error');
	}

	return (
		<div className="menu-page-panel auth-panel">
			<div className="menu-page-head">
				<h3>Account</h3>
				<button className="secondary-button slim" onClick={onBack}>
					Back
				</button>
			</div>

			<div className="auth-tabs">
				<button
					className={`mode-button ${activeTab === 'login' ? 'active' : ''}`}
					onClick={() => setActiveTab('login')}
				>
					Log In
				</button>
				<button
					className={`mode-button ${activeTab === 'signup' ? 'active' : ''}`}
					onClick={() => setActiveTab('signup')}
				>
					Sign Up
				</button>
			</div>

			{activeTab === 'login' ? (
				<form className="auth-form" onSubmit={submitLogIn}>
					<label>
						<span>Email</span>
						<input
							type="email"
							value={loginEmail}
							onChange={(event) => setLoginEmail(event.target.value)}
							placeholder="you@example.com"
							required
						/>
					</label>
					<label>
						<span>Password</span>
						<input
							type="password"
							value={loginPassword}
							onChange={(event) => setLoginPassword(event.target.value)}
							placeholder="Enter password"
							required
						/>
					</label>
					<button type="submit" className="primary-button">
						Log In
					</button>
				</form>
			) : (
				<form className="auth-form" onSubmit={submitSignUp}>
					<label>
						<span>Name</span>
						<input
							type="text"
							value={signUpName}
							onChange={(event) => setSignUpName(event.target.value)}
							placeholder="Your name"
							required
						/>
					</label>
					<label>
						<span>Email</span>
						<input
							type="email"
							value={signUpEmail}
							onChange={(event) => setSignUpEmail(event.target.value)}
							placeholder="you@example.com"
							required
						/>
					</label>
					<label>
						<span>Password</span>
						<input
							type="password"
							value={signUpPassword}
							onChange={(event) => setSignUpPassword(event.target.value)}
							placeholder="Create password"
							required
						/>
					</label>
					<button type="submit" className="primary-button">
						Create Account
					</button>
				</form>
			)}

			{authMessage && (
				<p className={`auth-message ${authStatus === 'ok' ? 'ok' : 'error'}`}>{authMessage}</p>
			)}
		</div>
	);
}
