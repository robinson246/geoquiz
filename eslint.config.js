import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
	{
		ignores: ['dist/**', 'node_modules/**'],
	},
	{
		files: ['src/**/*.{js,jsx}'],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: {
				window: 'readonly',
				document: 'readonly',
				navigator: 'readonly',
				fetch: 'readonly',
				globalThis: 'readonly',
				TextEncoder: 'readonly',
				AbortController: 'readonly',
				console: 'readonly',
			},
			parserOptions: {
				ecmaFeatures: {
					jsx: true,
				},
			},
		},
		settings: {
			react: {
				version: 'detect',
			},
		},
		plugins: {
			react,
			'react-hooks': reactHooks,
		},
		rules: {
			...js.configs.recommended.rules,
			...react.configs.recommended.rules,
			...react.configs['jsx-runtime'].rules,
			...reactHooks.configs.recommended.rules,
				'react-hooks/set-state-in-effect': 'off',
				'react-hooks/exhaustive-deps': 'off',
			'react/prop-types': 'off',
			'react/react-in-jsx-scope': 'off',
		},
	},
	{
		files: ['src/**/*.{test,spec}.{js,jsx}'],
		languageOptions: {
			globals: {
				describe: 'readonly',
				it: 'readonly',
				expect: 'readonly',
			},
		},
	},
];
