# Contributing to DAON

Thank you for your interest in contributing to the Digital Asset Ownership Network (DAON)!

## Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature-name`
3. Make your changes
4. Write tests for new functionality
5. Ensure all tests pass: `npm test`
6. Commit with conventional format (see below)
7. Push and create a Pull Request

## Commit Message Format

We use [Conventional Commits](https://conventionalcommits.org/) for automated versioning and changelog generation.

### Format
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types
- **feat**: A new feature (triggers minor version bump)
- **fix**: A bug fix (triggers patch version bump)
- **docs**: Documentation only changes
- **style**: Code style changes (formatting, missing semicolons, etc)
- **refactor**: Code refactoring without changing functionality
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **build**: Changes to build system or dependencies
- **ci**: Changes to CI configuration
- **chore**: Maintenance tasks
- **revert**: Reverting previous commits

### Breaking Changes
- Add `!` after type: `feat!: breaking API change`
- Or add `BREAKING CHANGE:` in footer

### Examples
```bash
feat: add content protection API endpoint
fix: resolve memory leak in hash generation
docs: update API documentation
feat(auth): add JWT authentication support
fix(api)!: change response format for /verify endpoint

BREAKING CHANGE: The /verify endpoint now returns an object instead of a string
```

## Automated Versioning

When ready for production releases, we use semantic-release:

- **fix**: `0.1.0` → `0.1.1` (patch)
- **feat**: `0.1.0` → `0.2.0` (minor) 
- **feat!**: `0.9.0` → `1.0.0` (major/breaking)

## Git Configuration

Set up the commit message template:
```bash
git config --local commit.template .gitmessage
```

## Testing

- **Unit tests**: `npm test`
- **Security tests**: `npm run test-full`
- **Lint**: `npm run lint`

## Code Style

- Use ESLint configuration
- Follow existing patterns
- Add JSDoc comments for public APIs
- Keep functions small and focused

## Security

- Never commit secrets or API keys
- Run security audit: `npm audit`
- Test input validation thoroughly
- Follow principle of least privilege

## API Changes

- Maintain backward compatibility during 0.x
- Document breaking changes in commit messages
- Update API documentation
- Add integration tests

## Pull Request Process

1. Update documentation for any new features
2. Add tests for bug fixes and new features
3. Ensure CI passes (tests, security, linting)
4. Use conventional commit format for PR title
5. Get review from maintainers

## Release Process

### Current (Manual)
- Manual version bumps during development
- `0.x.y` releases for pre-production

### Future (Automated)
- Semantic release based on commit messages  
- Automatic changelog generation
- Docker image tagging
- GitHub releases

## Questions?

- Open an issue for bugs or feature requests
- Use discussions for general questions
- Follow existing code patterns
- Ask maintainers for guidance

Thank you for contributing to creator protection! 🚀