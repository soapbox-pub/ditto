# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2024-07-15

### Added

- Prometheus support (`/metrics` endpoint).
- Sort zaps by amount; add pagination.

### Fixed

- Added IP rate-limiting of HTTP requests and WebSocket messages.
- Added database query timeouts.
- Fixed nos2x compatibility.

## [1.0.0] - 2024-06-14

- Initial release

[unreleased]: https://gitlab.com/soapbox-pub/ditto/-/compare/v1.1.0...HEAD
[1.1.0]: https://gitlab.com/soapbox-pub/ditto/-/compare/v1.0.0...v1.1.0
[1.0.0]: https://gitlab.com/soapbox-pub/ditto/-/tags/v1.0.0
