.PHONY: test test-sidecar build-sidecar

test: test-sidecar

test-sidecar:
	cd sidecar && npm test

build-sidecar:
	cd sidecar && npm run build
