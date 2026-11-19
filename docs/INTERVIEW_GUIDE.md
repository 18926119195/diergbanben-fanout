# Interview architecture walkthrough

## 30-second version

This repository is a constrained document-reasoning harness prototype. It separates retrieval, composition, human-approved execution, prompt compilation, model inference, and output validation. It is not a free-form ReAct agent.

## 3-minute version

1. PDF pages are OCR'ed and converted into `BookIndex` slots (`key*`).
2. Retrieval produces `draftKeys`; these are candidates, not injected text.
3. A compose policy turns candidate slots into member-key units.
4. The letter desk proposes `reuse`, `expand`, or `deferred` decisions.
5. Motion plans determine which keys should be opened or reused.
6. The harness gateway probes available keys and can require human approval.
7. The compiler builds inference blocks and an `AllowedKeys` boundary.
8. The fan-out path calls the `infer-ops` endpoint.
9. A formal validator checks key ownership, premise coverage, and derivation structure.
10. Accepted paths become settled assets; rejected paths are not treated as accepted memory.

## Demonstration

```text
scan PDF -> OCR -> ready index -> ask question -> open letter desk
-> review member keys -> approve execution -> inspect formal ops
-> navigate a premise key to its PDF page -> accept/reject -> reuse
```

## Key engineering questions

### Why not inject all retrieved text?

The design keeps original slot text in the document index and constructs a working projection for inference. Retrieval candidates do not automatically become model context; this makes the injection boundary inspectable.

### Why are compose members not the same as injected text?

A compose unit defines a candidate group. The approved plan and gateway determine which text is compiled for inference. `memberKeys`, `faultInKeys`, and `AllowedKeys` have different roles and must not be conflated.

### Why formal validation?

A correctly shaped model response is not necessarily grounded. The validator checks that referenced keys are allowed, required premises are covered, and the derivation is not trivially thin. These checks reduce errors; they do not prove the conclusion mathematically.

### What is the state of DSH?

DSH is the dialogue event anchor concept. It is still explicitly unbridged in `FanoutHud.tsx`; do not present it as complete.

## Known limitations to explain honestly

- Semantic indexing is page-oriented and heuristic, not a complete hierarchical section tree.
- MotionBrain is primarily rule-driven, not a fully autonomous LLM planner.
- The bounded micro loop is not the full target incremental fault-in architecture.
- OCR processing and inference actions do not yet share one fully unified ledger.
- Cross-book reasoning is not implemented.
- This repository inspection did not run build or end-to-end tests; verify locally before claiming a tested release.

## Suggested framing

"This is a constrained Agent Harness prototype, not a claim to a fully autonomous ReAct implementation. It explores how to make retrieval, tool execution, and memory transitions auditable at gateway boundaries, while keeping the remaining design gaps explicit."
