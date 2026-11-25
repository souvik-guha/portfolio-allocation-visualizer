# Changelog

## 1.1.0
### Added
- GitHub Actions workflow: ESLint and HTML validation, then the model and layout test suites in headless Chrome
- `npm run lint`, with ESLint and html-validate configured in the repo (previously run by hand)
- Tests pass `--no-sandbox` when `CI` is set so Chrome starts on hosted runners

### Changed
- puppeteer-core updated to 25.x; dependencies locked with `package-lock.json`

## 1.0.0
First release: single-file visualiser, correlation-aware volatility, lognormal VaR and expected shortfall, tests and docs.
