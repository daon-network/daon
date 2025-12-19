module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow merge commits (for GitHub merge queue)
    'subject-case': [0],
    'body-max-line-length': [0],
    'header-max-length': [2, 'always', 150], // Allow up to 150 chars for detailed commit messages
    // More lenient for now
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature
        'fix',      // Bug fix
        'docs',     // Documentation only
        'style',    // Formatting, missing semi colons, etc; no code change
        'refactor', // Refactoring production code
        'test',     // Adding tests, refactoring test; no production code change
        'chore',    // Updating build tasks, package manager configs, etc
        'ci',       // CI/CD related changes
        'perf',     // Performance improvements
        'revert',   // Revert a previous commit
        'build',    // Changes that affect the build system
        'merge',    // Merge commits
      ],
    ],
  },
  ignores: [
    // Ignore merge commits from GitHub
    (message) => message.startsWith('Merge '),
  ],
};
