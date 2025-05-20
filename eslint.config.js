// eslint.config.js
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import jest from 'eslint-plugin-jest';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  // Prettier config (extends from prettier)
  prettierConfig,
  {
    // Apply to all files by default
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', '*.config.js'],
  },
  {
    // Base config
    files: ['**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        node: true,
        es2022: true,
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      jest: jest,
      prettier: prettier,
    },
    rules: {
      // Best practices
      'no-console': 'warn', // Only warning for now as the codebase uses console extensively
      'no-debugger': 'warn',
      'no-duplicate-imports': 'error',
      'no-else-return': 'error',
      'no-empty-function': ['error', { allow: ['constructors', 'arrowFunctions'] }],
      'no-param-reassign': 'error',
      'no-unused-expressions': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-destructuring': ['warn', { object: true, array: false }],
      'prefer-template': 'error',
      'spaced-comment': ['error', 'always'],

      // TypeScript specific rules
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn', // Warning instead of error for now
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/array-type': [
        'warn',
        {
          default: 'array',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: true,
        },
      ],
      '@typescript-eslint/consistent-type-assertions': [
        'warn',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never',
        },
      ],
      '@typescript-eslint/explicit-member-accessibility': [
        'warn',
        {
          accessibility: 'no-public',
        },
      ],
      '@typescript-eslint/member-ordering': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/return-await': ['error', 'never'],

      // Prettier rules
      'prettier/prettier': 'warn',
    },
  },
  {
    // Test-specific configuration
    files: [
      '**/__tests__/**/*.{js,ts}',
      '**/*.test.{js,ts}',
      '**/__integration_tests__/**/*.{js,ts}',
    ],
    plugins: {
      '@typescript-eslint': typescript,
      jest: jest,
      prettier: prettier,
    },
    languageOptions: {
      globals: {
        jest: true,
      },
    },
    rules: {
      // Relaxed rules for test files
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_|event|handler|error|filePath|path',
          varsIgnorePattern: '^_|error',
        },
      ],
      'no-console': 'off',
      'jest/expect-expect': [
        'warn',
        {
          assertFunctionNames: ['expect', 'assert*'],
        },
      ],
      'jest/no-conditional-expect': 'warn',
      'jest/no-jasmine-globals': 'warn',
    },
  },
];
