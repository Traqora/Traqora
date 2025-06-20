## 1. ✅ CONTRIBUTING.md

```markdown
# Contributing to Traqora

We welcome contributions from everyone interested in building a decentralized travel future with StarkNet!

Please take a moment to review this guide to understand how you can contribute effectively.

## 🛠 Ways to Contribute

- Submit bug reports and feature requests
- Review code and documentation
- Write tests and improve tooling
- Translate content or improve UX/UI
- Help onboard new contributors

## 📥 How to Submit a Pull Request (PR)

1. Fork the repository and create a new branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes.
3. Commit your changes using descriptive commit messages.
4. Push your branch to your forked repo:
   ```bash
   git push origin feature/your-feature-name
   ```
5. Open a Pull Request against the `main` branch of this repo.

## 📋 Code Guidelines

- Use clear, concise, and readable code.
- Follow Cairo best practices for StarkNet development.
- Include comments where necessary.
- Ensure all functions have tests.
- Lint and format your code before submitting.

## 🧪 Testing

All contributions should be accompanied by unit or integration tests. Run tests locally before submitting a PR:

```bash
scarb test
```

For frontend contributions:

```bash
npm run lint
npm run test

