import React from 'react';

export default class ErrorBoundary extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			hasError: false,
		};
	}

	static getDerivedStateFromError() {
		return {
			hasError: true,
		};
	}

	componentDidCatch(error, info) {
		if (import.meta.env.DEV) {
			console.error('Unhandled UI error:', error, info);
		}
	}

	render() {
		if (this.state.hasError) {
			return (
				<main className="app-shell">
					<section className="quiz-card">
						<div className="status-panel error">
							<h2>Something went wrong</h2>
							<p>Please refresh the page and try again.</p>
						</div>
					</section>
				</main>
			);
		}

		return this.props.children;
	}
}
