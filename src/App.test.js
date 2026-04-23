describe('sanity', () => {
	it('handles strings', () => {
		expect('geoquiz'.toUpperCase()).toBe('GEOQUIZ');
	});

	it('handles simple math', () => {
		expect(2 + 2).toBe(4);
	});
});
