# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from typing import Annotated

from fastapi import Query
from pydantic import Field, field_validator, model_validator

from src.audios.audio_constants import LanguageEnum, VoiceEnum
from src.common.base_dto import BaseDto, GenerationModelEnum
from src.common.schema.media_item_model import SourceMediaItemLink

LYRIA_3_IMAGE_INPUT_MODELS = {
    GenerationModelEnum.LYRIA_3_CLIP_PREVIEW,
    GenerationModelEnum.LYRIA_3_PRO_PREVIEW,
}
MAX_LYRIA_3_REFERENCE_IMAGES = 10


class CreateAudioDto(BaseDto):
    """Generic Audio Generation DTO.
    Supports:
    1. Music Generation (Lyria) -> Uses negative_prompt, sample_count, seed
    2. Text-to-Speech (Chirp, Gemini TTS) -> Uses language_code, voice_name
    """

    model: GenerationModelEnum = Field(
        default=GenerationModelEnum.LYRIA_002,
        description="The model to use for generation (Lyria, Chirp, Gemini TTS).",
    )

    prompt: Annotated[str, Query(max_length=10000)] = Field(
        description="The text input. For Lyria, this is the music description. For TTS, this is the text to speak.",
    )

    workspace_id: int = Field(
        description="The ID of the workspace for this generation.",
    )

    metadata_generation_model: GenerationModelEnum | str | None = Field(
        default=GenerationModelEnum.GEMINI_3_5_FLASH,
        description="The Gemini model to use for synchronous metadata generation.",
    )
    titles: list[str] | None = Field(
        default=None,
        description="Optional titles for the generated audio.",
    )
    descriptions: list[str] | None = Field(
        default=None,
        description="Optional descriptions for the generated audio.",
    )

    # --- Lyria Specific Fields ---
    enhance_prompt: bool = Field(
        default=False,
        description="[Lyria Only] Optional flag to enhance the music prompt with Gemini before generation.",
    )

    negative_prompt: str | None = Field(
        default=None,
        description="[Lyria Only] What to avoid in the music generation.",
    )

    sample_count: int = Field(
        default=1,
        ge=1,
        le=4,
        description="[Lyria Only] Number of audio samples to generate.",
    )

    seed: int | None = Field(
        default=None,
        description="[Lyria Only] A seed for deterministic generation.",
    )

    source_asset_ids: Annotated[list[int], Field(max_length=10)] | None = Field(
        default=None,
        description="[Lyria 3 Only] IDs of uploaded image assets from the library (up to 10 total reference images).",
    )

    source_media_items: (
        Annotated[list[SourceMediaItemLink], Field(max_length=10)] | None
    ) = Field(
        default=None,
        description="[Lyria 3 Only] Generated gallery image references (up to 10 total reference images).",
    )

    # --- TTS / Chirp Specific Fields ---
    language_code: LanguageEnum | None = Field(
        default=LanguageEnum.EN_US,
        description="The BCP-47 language code.",
    )

    # 2. FLEXIBLE TYPING (Validated conditionally below):
    voice_name: VoiceEnum | None = Field(
        default=VoiceEnum.PUCK,
        description="The specific voice ID. For Gemini, must be a valid GeminiVoiceEnum value.",
    )

    file_name: str | None = Field(
        default=None,
        description="Optional name for the generated media.",
    )

    @field_validator("model")
    @classmethod
    def validate_audio_model(
        cls, value: GenerationModelEnum
    ) -> GenerationModelEnum:
        allowed_audio_models = {
            GenerationModelEnum.LYRIA_002,
            GenerationModelEnum.LYRIA_3_CLIP_PREVIEW,
            GenerationModelEnum.LYRIA_3_PRO_PREVIEW,
            GenerationModelEnum.CHIRP_3,
            GenerationModelEnum.GEMINI_2_5_FLASH_TTS,
            GenerationModelEnum.GEMINI_2_5_FLASH_LITE_PREVIEW_TTS,
            GenerationModelEnum.GEMINI_2_5_PRO_TTS,
            GenerationModelEnum.GEMINI_3_1_FLASH_TTS_PREVIEW,
        }

        if value not in allowed_audio_models:
            raise ValueError(
                f"Model '{value}' is not a valid audio model. "
                f"Allowed models: {[m.value for m in allowed_audio_models]}",
            )
        return value

    @model_validator(mode="after")
    def validate_model_requirements(self) -> "CreateAudioDto":
        model_str = str(self.model).lower()

        is_music_model = "lyria" in model_str
        if not (self.prompt or "").strip():
            raise ValueError("prompt cannot be empty.")

        total_reference_images = len(self.source_asset_ids or []) + len(
            self.source_media_items or []
        )
        if total_reference_images > 0:
            if self.model not in LYRIA_3_IMAGE_INPUT_MODELS:
                raise ValueError(
                    f"Reference images are only supported for Lyria 3 models "
                    f"({[m.value for m in sorted(LYRIA_3_IMAGE_INPUT_MODELS, key=lambda m: m.value)]})."
                )
            if total_reference_images > MAX_LYRIA_3_REFERENCE_IMAGES:
                raise ValueError(
                    f"At most {MAX_LYRIA_3_REFERENCE_IMAGES} reference images "
                    f"can be provided per request (got {total_reference_images})."
                )

        if not is_music_model:
            # TTS Check
            if not self.language_code:
                raise ValueError(
                    "language_code is required for Text-to-Speech models."
                )

        return self
