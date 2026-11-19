# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: independent Tunisian creators** (filmmakers, YouTubers, podcasters, small studios) who make work in Tunisian derja and want a French version without a dubbing studio. They import a video, confirm who speaks, obtain authorizations, choose French voices, approve every translated line and export.
- **Secondary: voice owners** (voice actors, presenters, anyone lending a voice) who create a Voice Passport, publish a public profile with conditions and a price, and accept or refuse each project request. One account can be both creator and voice owner; one account offers one voice.
- **Verifiers:** festivals, producers, funders, platforms and hackathon judges who open a video's public Passeport 360° from a URL or QR code, without an account.

## Product Purpose

SAWTI 360 dubs video from Tunisian derja into French with AI, and wraps every voice in consent, licensing, human validation and traceability. Success is a downloadable French version that travels to audiences beyond derja speakers, accompanied by a signed, publicly verifiable record of which voices were used, under which authorization, and what the AI did.

## Positioning

Trust infrastructure, not only AI dubbing. Other tools produce a voice; SAWTI 360 produces a voice and the proof that it is legitimate, measured and traceable. Motto: « L’IA propose. L’humain décide. La confiance accompagne chaque export. »

## Operating Context

- Built for the Hackathon IA Éthique 360 (JEI INSAT × OIF); demonstrated to judges, investors and partners.
- Source of truth for the journey: `SAWTI_UX_Master_Specification_V2.pdf` (screens 01–16, authorization by life status, licensing, Passeport 360°). The repository README adds ten trust gates, nine trust modules, a hash-chained audit log, Sawti-Bench, an energy panel and a C2PA-inspired manifest.
- Workflow: import → analysis → characters → authorizations (living: consent by secure link; deceased: family document + AI consistency check with three outcomes) → French voices (licensed or AI-generated) → translation (first model, second model review, human approval) → timeline → generation → result and Passeport 360°.
- Public, no-account surfaces: consent response, licence response, Passeport 360° verification.

## Capabilities and Constraints

- Web prototype: React 19 + Vite + TypeScript, zustand state persisted in the browser, one server function (`api/tts.ts`) holding the ElevenLabs key. Python package `sawti/` and a Streamlit app also exist.
- Real today: rules engine (refuse by default, run in browser and server), content filter, fidelity checker, Ed25519 signatures, hash-chained audit log, local video reading with SHA-256 fingerprint and frame extraction, ElevenLabs synthesis when configured.
- Simulated today (isolated in `src/mock/`): transcription, speaker detection, both translation models, the family-document AI check, post-synthesis rendering steps, payments. Not built: MP4 render, original-voice cloning, platform-link import, accounts and e-mail.
- The interface is in French; derja appears in Arabic script, right to left.
- Never invent legal requirements, consent rules, AI verification capabilities or performance figures; real, simulated, example and planned data are labelled as such (from the original brief).
- The AI family-document check verifies role consistency only; it never certifies signatures, family ties or the legal standing of signatories. Private family documents are never exposed publicly.
- Open in the specification and shown as « à confirmer »: who in the family may sign and how many signatures, accepted document formats, the complementary verification procedure, the invitation of unregistered living people, Sawti's pricing framework, the AI label duration, the label rule for Reels/Shorts.

## Brand Commitments

- Name: SAWTI 360 (« Sawti » means « my voice »). The public record is the « Passeport 360° »; a voice owner's record is the « Passeport de voix ».
- Motto as above, used verbatim.

## Evidence on Hand

- Interview with Tunisian filmmaker Mohamed Karim Dahmouni (quoted in the README).
- Documented sector cases cited in the README (cloned voices, unlabelled synthetic voices); no product metrics exist yet.
- Prototype mock-ups in `docs/maquettes/`. All voice-owner profiles, prices and example projects are fictional. No WER, energy or benchmark figures exist: Sawti-Bench and the energy panel must show « à mesurer » until measured.

## Product Principles

1. No original voice without the applicable authorization; refuse by default.
2. The AI proposes, a human decides: every AI output is a proposal until explicitly approved.
3. Every export carries a public, verifiable Passeport 360°.
4. Say what is real: never present simulated or illustrative data as verified.
5. Protect people: private documents stay private; revocation is always possible.
