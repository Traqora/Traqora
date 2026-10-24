WASM_DIR := contracts/target/wasm32-unknown-unknown/release
# Maximum allowed WASM binary size in bytes (500 KB)
MAX_WASM_SIZE := 512000

.PHONY: build optimize check-size test fmt clippy lint lint-fix audit

build:
	cd contracts && cargo build --target wasm32-unknown-unknown --release

optimize: build
	@command -v wasm-opt >/dev/null 2>&1 || { echo "wasm-opt not found. Install binaryen: https://github.com/WebAssembly/binaryen"; exit 1; }
	@for wasm in $(WASM_DIR)/*.wasm; do \
		echo "Optimizing $$wasm ..."; \
		wasm-opt -O4 "$$wasm" -o "$$wasm"; \
	done
	@echo "Optimization complete."

check-size: optimize
	@echo "Checking WASM binary sizes (limit: $(MAX_WASM_SIZE) bytes)..."
	@failed=0; \
	for wasm in $(WASM_DIR)/*.wasm; do \
		size=$$(wc -c < "$$wasm"); \
		name=$$(basename "$$wasm"); \
		echo "  $$name: $$size bytes"; \
		if [ "$$size" -gt "$(MAX_WASM_SIZE)" ]; then \
			echo "  FAIL: $$name exceeds limit ($$size > $(MAX_WASM_SIZE))"; \
			failed=1; \
		fi; \
	done; \
	if [ "$$failed" -eq 1 ]; then exit 1; fi; \
	echo "All binaries within size limit."

test:
	cd contracts && cargo test --workspace

# fmt / clippy / lint delegate to scripts/fmt-clippy-check.sh (issue #743), which
# is also what CI runs. Keeping one definition stops `make clippy` from drifting
# away from the pipeline: the previous inline `cargo clippy -- -D warnings` had no
# --locked, no --workspace, no wasm target, and linted the integration-tests crate
# in a way that cannot build.
fmt:
	@./scripts/fmt-clippy-check.sh --only fmt

clippy:
	@./scripts/fmt-clippy-check.sh --only clippy

lint:
	@./scripts/fmt-clippy-check.sh

lint-fix:
	@./scripts/fmt-clippy-check.sh --fix

audit:
	cd contracts && cargo audit
