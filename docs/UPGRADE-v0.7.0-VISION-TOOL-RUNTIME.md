# Jarvis v0.7.0 Vision + Tool Runtime

Status: staged on `develop/v0.7.0-vision-tool-runtime`.

## Purpose

Turn the existing image and multimodal UI from a partially disconnected prototype into a real desktop runtime that can use the configured OpenRouter provider.

This package also fixes one existing broken automotive AI path so OBD diagnosis no longer calls an unimplemented desktop function.

## Included

- Multimodal OpenRouter chat requests with text plus image references.
- Real desktop `generateImage` implementation through the configured OpenRouter image-generation endpoint.
- Image model discovery.
- Separate configurable image-generation model in Settings.
- Text-to-image generation with no reference image required.
- Reference-image analysis/edit prompt flow.
- Correct desktop file-upload validation metadata flow.
- Normalized generated-image result shape for the existing image editor.
- Real `generateOBDDiagnosis` desktop handler using the configured AI provider.
- OBD diagnosis prompt explicitly separates measured facts, likely causes and next checks.
- Old user-facing Gemini branding changed to Jarvis AI.

## Architecture

`Image editor / automotive vision -> jarvisClient -> isolated Electron function IPC -> OpenRouter provider -> normalized result`

The provider stays behind Jarvis' central runtime so later model changes do not require rewriting every feature.

## API-key behaviour

Jarvis still starts and non-AI deterministic functions still work without an API key.

Image generation, multimodal analysis and AI OBD diagnosis clearly report that an OpenRouter API key is required when no key is configured.

## Upgrade path

1. Complete the earlier release gates for v0.3-v0.6.
2. Configure an OpenRouter key on a test installation.
3. Verify at least one currently available image-generation model.
4. Test text-to-image and reference-image flows.
5. Test OBD AI diagnosis with recorded/safe diagnostic data.
6. Merge and publish only after acceptance tests pass.
7. Existing installations receive v0.7 through the one-click updater.

## Acceptance tests

- [ ] Security/dependency verification passes.
- [ ] Renderer build passes.
- [ ] Windows installer builds.
- [ ] Jarvis starts with no API key configured.
- [ ] Settings saves the general AI model and image model independently.
- [ ] Image-model discovery returns available models when a valid key is configured.
- [ ] Text-only image generation produces a usable image.
- [ ] Reference-image generation/editing can send image inputs to a multimodal model.
- [ ] Large/disallowed files are rejected before AI processing.
- [ ] Generated image loads into the existing canvas.
- [ ] Missing API key produces a clear UI error instead of a generic crash.
- [ ] OBD diagnosis no longer throws `JARVIS_FUNCTION_NOT_IMPLEMENTED:generateOBDDiagnosis`.
- [ ] OBD AI diagnosis uses cautious wording and does not present a DTC lookup as certainty.
- [ ] No provider/API secret is written to the repository.

## Deliberately not included

This package does not claim that every OpenRouter model supports image generation or image editing. Jarvis discovers image-capable models at runtime and the chosen provider/model must be tested before release.
