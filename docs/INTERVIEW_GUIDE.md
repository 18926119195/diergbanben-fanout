# Interview architecture walkthrough

## 30-second version

This repository implements a constrained document fan-out reasoning system. It separates retrieval, composition, human-approved execution, prompt compilation, model inference, and formal validation. It does not use a free-form ReAct loop.

## 3-minute version

1. PDF pages are OCR'ed and converted into `BookIndex` slots (`key*`).
2. Retrieval produces `draftKeys` but does not inject slot text.
3. A compose policy turns candidate slots into member-key units.
4. The letter desk proposes reuse, expand, or deferred decisions.
5. Motion plans decide which keys require fault-in or scope expansion.
6. The harness gateway can require human approval before text is fetched.
7. The compiler converts approved keys into blocks and an AllowedKeys boundary.
8. Only `infer-ops` receives the compiled blocks.
9. A formal validator rejects out-of-bag keys, dropped premises, or thin derivations.
10. Accepted paths become settled assets; rejected paths are discarded.

## Demonstration

```text
scan PDF -> OCR -> ready index -> ask question -> open letter desk
-> review member keys -> approve execution -> see formal ops
-> navigate premise key to PDF page -> accept/reject -> reuse
```

## Key engineering questions and answers

### Why not inject all retrieved text?

The system treats original text as cold storage. The model sees only an approved working projection. This makes injection auditable and limits prompt growth.

### Why is a compose bag not an AllowedKeys bag?

A compose bag describes which candidate slots belong together. It becomes a possible member-key set, not an unconditional permission to expose text. Fault-in approval determines the actual expanded subset.

### Why is reuse safe?

Reuse matches member keys, question similarity, and model fingerprint. A same-bag result from another model cannot silently become a reuse hit.

### Why formal validation?

Natural-language model output is not sufficient. Formal validation checks key ownership, premise coverage, JSON structure, and derivation quality before a result is accepted.

### What is DSH?

DSH is the dialogue event anchor concept. It is still explicitly unbridged in `FanoutHud.tsx`; do not describe it as complete in an interview.

## Known limitations to explain honestly

- Section semantics are currently page-oriented, not a complete section tree.
- MotionBrain is mostly deterministic/rule-driven.
- The micro loop has bounded retries, not the complete target architecture.
- OCR and the reasoning gateway do not yet share one fully unified ledger.
- Persistence is mainly browser/session-oriented and is not production-grade cross-device memory.

## Good interview framing

"This is a constrained Agent Harness prototype, not a claim to a fully autonomous ReAct implementation. It explores how to make retrieval, tool execution and memory changes auditable at the gateway boundary."
