# Changelog

## [1.2.0](https://github.com/tmchow/image-sprout/compare/v1.1.4...v1.2.0) (2026-03-07)


### Features

* add size presets 4:3, 3:2, 4:5 and convert to dropdown ([#18](https://github.com/tmchow/image-sprout/issues/18)) ([82e406c](https://github.com/tmchow/image-sprout/commit/82e406c1df8ea9048c4b62f204f2994580c874bb))


### Bug Fixes

* **canvas:** show run-specific prompt, feedback, and friendly model name ([#17](https://github.com/tmchow/image-sprout/issues/17)) ([c707d8a](https://github.com/tmchow/image-sprout/commit/c707d8a7197172d1004c0079c0e6495f7a35b198))

## [1.1.4](https://github.com/tmchow/image-sprout/compare/v1.1.3...v1.1.4) (2026-03-07)


### Bug Fixes

* add repository field for npm provenance ([#15](https://github.com/tmchow/image-sprout/issues/15)) ([ca3925e](https://github.com/tmchow/image-sprout/commit/ca3925e04181e96b8556210e319993256cc400ad))

## [1.1.3](https://github.com/tmchow/image-sprout/compare/v1.1.2...v1.1.3) (2026-03-07)


### Bug Fixes

* **ci:** fix npm OIDC trusted publishing ([#13](https://github.com/tmchow/image-sprout/issues/13)) ([b0e84c9](https://github.com/tmchow/image-sprout/commit/b0e84c91f0b627a72614f6ec9fe53b4f2334bffa))

## [1.1.2](https://github.com/tmchow/image-sprout/compare/v1.1.1...v1.1.2) (2026-03-07)


### Bug Fixes

* **ci:** add release environment for npm OIDC publishing ([#11](https://github.com/tmchow/image-sprout/issues/11)) ([ff58961](https://github.com/tmchow/image-sprout/commit/ff589618c5b7dbfc472d5030a7439cea6552d668))

## [1.1.1](https://github.com/tmchow/image-sprout/compare/v1.1.0...v1.1.1) (2026-03-07)


### Bug Fixes

* **ci:** combine release-please and publish into one workflow ([#9](https://github.com/tmchow/image-sprout/issues/9)) ([4be8b82](https://github.com/tmchow/image-sprout/commit/4be8b820e93fa0c47625b288340524fc321844a6))

## [1.1.0](https://github.com/tmchow/image-sprout/compare/v1.0.1...v1.1.0) (2026-03-07)


### Features

* **cli:** add --open flag to web command and document session delete ([00176b6](https://github.com/tmchow/image-sprout/commit/00176b66d8686174fc7a9588214b05cfbb5f553f))
* **cli:** add session delete subcommand ([6beb670](https://github.com/tmchow/image-sprout/commit/6beb670287c5cd053e0f3f815497218c5a4867ab))
* configurable analysis model for guide derivation ([ab2902f](https://github.com/tmchow/image-sprout/commit/ab2902fc3eaacf7748c25e621656daff6ee1b3b3))
* **sidebar:** add confirmation step before deleting a session ([30f062f](https://github.com/tmchow/image-sprout/commit/30f062fcd4fb46146747980ea33f3b040ab0fce4))
* support image count of 1 for single-image generation ([fbac1b6](https://github.com/tmchow/image-sprout/commit/fbac1b6af948da71ac1a9e5f0bfdc68fce83fa3d))


### Bug Fixes

* **api:** warn on non-JSON analysis response instead of silent fallback ([bf1fac7](https://github.com/tmchow/image-sprout/commit/bf1fac77144285f12b5ba1c99021628ec7347911))
* **cli:** remove isDirectExecution guard that broke npx/symlink invocation ([6774657](https://github.com/tmchow/image-sprout/commit/677465773f2eeb1d5e95017037000489f13970d8))
* **sidebar:** show draft placeholder when New Session is clicked ([675992c](https://github.com/tmchow/image-sprout/commit/675992c4072bdfbdfc037bdb20f5e69ca9d47318))
* **sidebar:** show draft placeholder when New Session is clicked ([62fd36e](https://github.com/tmchow/image-sprout/commit/62fd36ea1ab6ecd1c19ee387e0de1c1845f7313d))
* **test:** correct action-bar test to match actual component behavior ([a3ee6a5](https://github.com/tmchow/image-sprout/commit/a3ee6a5e9d4a2de4610bd53b0cde4c9c6027e83a))
* **web:** correct HTTP status codes for API error responses ([f7f4cef](https://github.com/tmchow/image-sprout/commit/f7f4cef56d63565b80e69bfebfe7b475c8f38c8e))


### Performance Improvements

* parallelize derive when target=both with different ref sets ([5fc0dfa](https://github.com/tmchow/image-sprout/commit/5fc0dfab1a21f666690bc63b277514c20dc05669))
