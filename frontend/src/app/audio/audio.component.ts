/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Component, Inject, OnInit, computed, signal} from '@angular/core';
import {Router} from '@angular/router';
import {
  CreateAudioDto,
  GenerationModelEnum,
} from '../services/audio/audio.service';
import {MatChipInputEvent} from '@angular/material/chips';
import {MatSnackBar} from '@angular/material/snack-bar';
import {MatDialog} from '@angular/material/dialog';
import {WorkspaceStateService} from '../services/workspace/workspace-state.service';
import {JobStatus, MediaItem} from '../common/models/media-item.model';
import {AddVoiceDialogComponent} from '../components/add-voice-dialog/add-voice-dialog.component';
import {ConfirmationDialogComponent} from '../common/components/confirmation-dialog/confirmation-dialog.component';
import {MatIconRegistry} from '@angular/material/icon';
import {LanguageEnum, VoiceEnum} from './audio.constants';
import {SearchService} from '../services/search/search.service';
import {
  AudioStateService,
  DEFAULT_LYRIA_MODEL,
  DEFAULT_TTS_MODEL,
} from '../services/audio-state.service';
import {
  GenerationModelConfig,
  MODEL_CONFIGS,
} from '../common/config/model-config';
import {GalleryService} from '../gallery/gallery.service';
import {AssetTypeEnum} from '../admin/source-assets-management/source-asset.model';
import {
  ImageSelectorComponent,
  MediaItemSelection,
} from '../common/components/image-selector/image-selector.component';
import {
  ReferenceImage,
  SourceMediaItemLink,
} from '../common/models/search.model';
import {
  SourceAssetResponseDto,
  SourceAssetService,
} from '../common/services/source-asset.service';
import {Observable, finalize, first} from 'rxjs';
import {
  handleErrorSnackbar,
  handleInfoSnackbar,
  handleSuccessSnackbar,
} from '../utils/handleMessageSnackbar';

// UI Helper type
type UiModelType = 'lyria' | 'chirp' | 'gemini-tts';

interface VoiceOption {
  id: VoiceEnum | string; // Allow string for custom cloned voices later
  name: string;
  type: 'preset' | 'custom';
}

interface LanguageOption {
  code: LanguageEnum;
  name: string;
}

@Component({
  selector: 'app-lyria',
  templateUrl: './audio.component.html',
  styleUrls: ['./audio.component.scss'],
})
export class AudioComponent implements OnInit {
  // UI State (Signal-backed for reactivity with FlowPromptBox)
  private selectedModelSignal = signal<UiModelType>('lyria');
  get selectedModel(): UiModelType {
    return this.selectedModelSignal();
  }
  set selectedModel(val: UiModelType) {
    this.selectedModelSignal.set(val);
  }

  isLoading = false;

  // Job Tracking
  activeAudioJob$: Observable<MediaItem | null>;
  public readonly JobStatus = JobStatus;
  showErrorOverlay = true;

  // FlowPromptBox Modes & Models
  readonly audioModes = [
    {value: 'Music', icon: 'music_note', label: 'Music (Lyria)'},
    {
      value: 'Text to Speech',
      icon: 'record_voice_over',
      label: 'Text to Speech',
    },
  ];
  readonly lyriaModels: GenerationModelConfig[] = MODEL_CONFIGS.filter(
    m => m.type === 'AUDIO' && m.value.startsWith('lyria'),
  );
  readonly ttsModels: GenerationModelConfig[] = MODEL_CONFIGS.filter(
    m => m.type === 'AUDIO' && !m.value.startsWith('lyria'),
  );

  // Lyria Specific Inputs
  /** Concrete Lyria model used when the "Lyria (Music)" family is selected. */
  private lyriaModelSignal = signal<string>(DEFAULT_LYRIA_MODEL);
  get lyriaModel(): string {
    return this.lyriaModelSignal();
  }
  set lyriaModel(val: string) {
    this.lyriaModelSignal.set(val);
  }

  /** Concrete TTS model used when Text to Speech is selected. */
  private ttsModelSignal = signal<string>(DEFAULT_TTS_MODEL);
  get ttsModel(): string {
    return this.ttsModelSignal();
  }
  set ttsModel(val: string) {
    this.ttsModelSignal.set(val);
  }

  prompt = '';
  negativePrompt = '';
  negativePhrases: string[] = [];
  seed: number | undefined;
  sampleCount = 1;
  enhancePrompt = false;
  referenceImages: ReferenceImage[] = [];

  // TTS & Chirp Specific Inputs
  private selectedLanguageSignal = signal<LanguageEnum>(LanguageEnum.EN_US);
  get selectedLanguage(): LanguageEnum {
    return this.selectedLanguageSignal();
  }
  set selectedLanguage(val: LanguageEnum) {
    this.selectedLanguageSignal.set(val);
  }

  private selectedVoiceSignal = signal<VoiceEnum | string>(VoiceEnum.PUCK);
  get selectedVoice(): VoiceEnum | string {
    return this.selectedVoiceSignal();
  }
  set selectedVoice(val: VoiceEnum | string) {
    this.selectedVoiceSignal.set(val);
  }

  languages: LanguageOption[] = [
    {code: LanguageEnum.AR_XA, name: 'Arabic'},
    {code: LanguageEnum.BG_BG, name: 'Bulgarian (Bulgaria)'},
    {code: LanguageEnum.BN_IN, name: 'Bengali (India)'},
    {code: LanguageEnum.CMN_CN, name: 'Mandarin Chinese'},
    {code: LanguageEnum.CS_CZ, name: 'Czech (Czech Republic)'},
    {code: LanguageEnum.DA_DK, name: 'Danish (Denmark)'},
    {code: LanguageEnum.DE_DE, name: 'German (Germany)'},
    {code: LanguageEnum.EL_GR, name: 'Greek (Greece)'},
    {code: LanguageEnum.EN_AU, name: 'English (Australia)'},
    {code: LanguageEnum.EN_GB, name: 'English (UK)'},
    {code: LanguageEnum.EN_IN, name: 'English (India)'},
    {code: LanguageEnum.EN_US, name: 'English (United States)'},
    {code: LanguageEnum.ES_ES, name: 'Spanish (Spain)'},
    {code: LanguageEnum.ES_US, name: 'Spanish (US)'},
    {code: LanguageEnum.FI_FI, name: 'Finnish (Finland)'},
    {code: LanguageEnum.FR_CA, name: 'French (Canada)'},
    {code: LanguageEnum.FR_FR, name: 'French (France)'},
    {code: LanguageEnum.GU_IN, name: 'Gujarati (India)'},
    {code: LanguageEnum.HE_IL, name: 'Hebrew (Israel)'},
    {code: LanguageEnum.HI_IN, name: 'Hindi (India)'},
    {code: LanguageEnum.HU_HU, name: 'Hungarian (Hungary)'},
    {code: LanguageEnum.ID_ID, name: 'Indonesian (Indonesia)'},
    {code: LanguageEnum.IT_IT, name: 'Italian (Italy)'},
    {code: LanguageEnum.JA_JP, name: 'Japanese (Japan)'},
    {code: LanguageEnum.KN_IN, name: 'Kannada (India)'},
    {code: LanguageEnum.KO_KR, name: 'Korean (South Korea)'},
    {code: LanguageEnum.LT_LT, name: 'Lithuanian (Lithuania)'},
    {code: LanguageEnum.LV_LV, name: 'Latvian (Latvia)'},
    {code: LanguageEnum.ML_IN, name: 'Malayalam (India)'},
    {code: LanguageEnum.MR_IN, name: 'Marathi (India)'},
    {code: LanguageEnum.NB_NO, name: 'Norwegian (Norway)'},
    {code: LanguageEnum.NL_BE, name: 'Dutch (Belgium)'},
    {code: LanguageEnum.NL_NL, name: 'Dutch (Netherlands)'},
    {code: LanguageEnum.PL_PL, name: 'Polish (Poland)'},
    {code: LanguageEnum.PT_BR, name: 'Portuguese (Brazil)'},
    {code: LanguageEnum.RO_RO, name: 'Romanian (Romania)'},
    {code: LanguageEnum.RU_RU, name: 'Russian (Russia)'},
    {code: LanguageEnum.SK_SK, name: 'Slovak (Slovakia)'},
    {code: LanguageEnum.SR_RS, name: 'Serbian (Serbia)'},
    {code: LanguageEnum.SV_SE, name: 'Swedish (Sweden)'},
    {code: LanguageEnum.TA_IN, name: 'Tamil (India)'},
    {code: LanguageEnum.TE_IN, name: 'Telugu (India)'},
    {code: LanguageEnum.TH_TH, name: 'Thai (Thailand)'},
    {code: LanguageEnum.TR_TR, name: 'Turkish (Turkey)'},
    {code: LanguageEnum.UK_UA, name: 'Ukrainian (Ukraine)'},
    {code: LanguageEnum.VI_VN, name: 'Vietnamese (Vietnam)'},
  ];

  // Map Enums to Voice Options
  private voicesSignal = signal<VoiceOption[]>([
    {id: VoiceEnum.ACHERNAR, name: 'Achernar (Female)', type: 'preset'},
    {id: VoiceEnum.ACHIRD, name: 'Achird (Male)', type: 'preset'},
    {id: VoiceEnum.ALGENIB, name: 'Algenib (Male)', type: 'preset'},
    {id: VoiceEnum.ALGIEBA, name: 'Algieba (Male)', type: 'preset'},
    {id: VoiceEnum.ALNILAM, name: 'Alnilam (Male)', type: 'preset'},
    {id: VoiceEnum.AOEDE, name: 'Aoede (Female)', type: 'preset'},
    {id: VoiceEnum.AUTONOE, name: 'Autonoe (Female)', type: 'preset'},
    {id: VoiceEnum.CALLIRRHOE, name: 'Callirrhoe (Female)', type: 'preset'},
    {id: VoiceEnum.CHARON, name: 'Charon (Male)', type: 'preset'},
    {id: VoiceEnum.DESPINA, name: 'Despina (Female)', type: 'preset'},
    {id: VoiceEnum.ENCELADUS, name: 'Enceladus (Male)', type: 'preset'},
    {id: VoiceEnum.ERINOME, name: 'Erinome (Female)', type: 'preset'},
    {id: VoiceEnum.FENRIR, name: 'Fenrir (Male)', type: 'preset'},
    {id: VoiceEnum.GACRUX, name: 'Gacrux (Female)', type: 'preset'},
    {id: VoiceEnum.IAPETUS, name: 'Iapetus (Male)', type: 'preset'},
    {id: VoiceEnum.KORE, name: 'Kore (Female)', type: 'preset'},
    {id: VoiceEnum.LAOMEDEIA, name: 'Laomedeia (Female)', type: 'preset'},
    {id: VoiceEnum.LEDA, name: 'Leda (Female)', type: 'preset'},
    {id: VoiceEnum.ORUS, name: 'Orus (Male)', type: 'preset'},
    {id: VoiceEnum.PUCK, name: 'Puck (Male)', type: 'preset'},
    {id: VoiceEnum.PULCHERRIMA, name: 'Pulcherrima (Female)', type: 'preset'},
    {id: VoiceEnum.RASALGETHI, name: 'Rasalgethi (Male)', type: 'preset'},
    {id: VoiceEnum.SADACHBIA, name: 'Sadachbia (Male)', type: 'preset'},
    {id: VoiceEnum.SADALTAGER, name: 'Sadaltager (Male)', type: 'preset'},
    {id: VoiceEnum.SCHEDAR, name: 'Schedar (Male)', type: 'preset'},
    {id: VoiceEnum.SULAFAT, name: 'Sulafat (Female)', type: 'preset'},
    {id: VoiceEnum.UMBRIEL, name: 'Umbriel (Male)', type: 'preset'},
    {id: VoiceEnum.VINDEMIATRIX, name: 'Vindemiatrix (Female)', type: 'preset'},
    {id: VoiceEnum.ZEPHYR, name: 'Zephyr (Female)', type: 'preset'},
    {id: VoiceEnum.ZUBENELGENUBI, name: 'Zubenelgenubi (Male)', type: 'preset'},
  ]);
  get voices(): VoiceOption[] {
    return this.voicesSignal();
  }
  set voices(val: VoiceOption[]) {
    this.voicesSignal.set(val);
  }

  // --- Computed Signals for FlowPromptBox ---
  currentAudioMode = computed(() =>
    this.selectedModelSignal() === 'lyria' ? 'Music' : 'Text to Speech',
  );

  activeGenerationModels = computed(() =>
    this.selectedModelSignal() === 'lyria' ? this.lyriaModels : this.ttsModels,
  );

  private selectedLyriaConfigSignal = computed(() =>
    this.lyriaModels.find(m => m.value === this.lyriaModelSignal()),
  );

  selectedGenerationModelName = computed(() => {
    if (this.selectedModelSignal() === 'lyria') {
      return (
        this.selectedLyriaConfigSignal()?.viewValue ?? 'Lyria 3 Clip Preview'
      );
    }
    const activeTtsValue =
      this.selectedModelSignal() === 'chirp'
        ? GenerationModelEnum.CHIRP_3
        : this.ttsModelSignal();
    return (
      this.ttsModels.find(m => m.value === activeTtsValue)?.viewValue ??
      'Gemini 2.5 Flash TTS'
    );
  });

  selectedVoiceLabel = computed(() => {
    const found = this.voicesSignal().find(
      v => v.id === this.selectedVoiceSignal(),
    );
    if (!found) {
      return String(this.selectedVoiceSignal() || 'Voice');
    }
    return found.name.split(' (')[0];
  });

  selectedLanguageLabel = computed(() => this.selectedLanguageSignal());

  selectedLanguageName = computed(() => {
    const found = this.languages.find(
      l => l.code === this.selectedLanguageSignal(),
    );
    return found ? found.name : String(this.selectedLanguageSignal());
  });

  private lyriaSupportsSeedSignal = computed(
    () => this.selectedLyriaConfigSignal()?.capabilities?.supportsSeed ?? false,
  );

  private lyriaMaxReferenceImagesSignal = computed(
    () =>
      this.selectedLyriaConfigSignal()?.capabilities?.maxReferenceImages ?? 0,
  );

  private lyriaModelHintSignal = computed(() => {
    switch (this.lyriaModelSignal()) {
      case 'lyria-3-clip-preview':
        return '30-second clips · fast';
      case 'lyria-3-pro-preview':
        return 'Full songs up to ~3 min · slower';
      case 'lyria-002':
        return '~33-second instrumental clips (legacy)';
      default:
        return '';
    }
  });

  constructor(
    private searchService: SearchService,
    private audioStateService: AudioStateService,
    private snackBar: MatSnackBar,
    private workspaceStateService: WorkspaceStateService,
    private dialog: MatDialog,
    private router: Router,
    public matIconRegistry: MatIconRegistry,
    @Inject(GalleryService)
    private galleryService: GalleryService,
    private sourceAssetService: SourceAssetService,
  ) {
    this.activeAudioJob$ = this.searchService.activeAudioJob$;
  }

  ngOnInit() {
    this.restoreState();
  }

  saveState() {
    this.audioStateService.updateState({
      model: this.selectedModel,
      lyriaModel: this.lyriaModel,
      ttsModel: this.ttsModel,
      prompt: this.prompt,
      negativePrompt: this.negativePrompt,
      seed: this.seed,
      sampleCount: this.sampleCount,
      enhancePrompt: this.enhancePrompt,
      selectedLanguage: this.selectedLanguage,
      selectedVoice: this.selectedVoice,
    });
  }

  private restoreState() {
    const state = this.audioStateService.getState();
    this.selectedModel = state.model as UiModelType;
    this.lyriaModel = state.lyriaModel || DEFAULT_LYRIA_MODEL;
    this.ttsModel =
      state.ttsModel ||
      (this.selectedModel === 'chirp'
        ? GenerationModelEnum.CHIRP_3
        : DEFAULT_TTS_MODEL);
    this.prompt = state.prompt;
    this.negativePrompt = state.negativePrompt;
    this.negativePhrases = this.negativePrompt
      ? this.negativePrompt
          .split(',')
          .map(p => p.trim())
          .filter(Boolean)
      : [];
    this.seed = state.seed;
    this.sampleCount = state.sampleCount;
    this.enhancePrompt = Boolean(state.enhancePrompt);
    this.selectedLanguage = state.selectedLanguage as LanguageEnum;
    this.selectedVoice = state.selectedVoice as VoiceEnum;
  }

  /** Capabilities of the currently selected Lyria model (from MODEL_CONFIGS). */
  get selectedLyriaConfig(): GenerationModelConfig | undefined {
    return this.selectedLyriaConfigSignal();
  }

  /** Lyria 3 (Interactions API) does not accept a seed; Lyria 2 does. */
  get lyriaSupportsSeed(): boolean {
    return this.lyriaSupportsSeedSignal();
  }

  /** Max reference images supported by the active Lyria model (10 for Lyria 3, 0 for Lyria 2). */
  get lyriaMaxReferenceImages(): number {
    return this.lyriaMaxReferenceImagesSignal();
  }

  /** Short, human-readable description of the selected Lyria model. */
  get lyriaModelHint(): string {
    return this.lyriaModelHintSignal();
  }

  addNegativePhrase(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value) this.negativePhrases.push(value);
    this.negativePrompt = this.negativePhrases.join(', ');
    event.chipInput?.clear();
    this.saveState();
  }

  removeNegativePhrase(phrase: string): void {
    const index = this.negativePhrases.indexOf(phrase);
    if (index >= 0) this.negativePhrases.splice(index, 1);
    this.negativePrompt = this.negativePhrases.join(', ');
    this.saveState();
  }

  selectLanguage(code: LanguageEnum): void {
    this.selectedLanguage = code;
    this.saveState();
  }

  selectVoice(voiceId: VoiceEnum | string): void {
    this.onVoiceSelectionChange(voiceId);
  }

  clearSeed(): void {
    this.seed = undefined;
    this.saveState();
  }

  onModeChanged(mode: string) {
    if (mode === 'Music') {
      this.selectedModel = 'lyria';
    } else {
      this.selectedModel =
        this.ttsModel === GenerationModelEnum.CHIRP_3 ? 'chirp' : 'gemini-tts';
    }
    this.saveState();
  }

  onAudioModelSelected(model: GenerationModelConfig) {
    if (!model?.value) return;
    if (model.value.startsWith('lyria')) {
      this.selectedModel = 'lyria';
      this.onLyriaModelChange(model.value);
      return;
    }
    this.ttsModel = model.value;
    this.selectedModel =
      model.value === GenerationModelEnum.CHIRP_3 ? 'chirp' : 'gemini-tts';
    this.saveState();
  }

  onPromptChanged(value: string) {
    this.prompt = value;
    this.saveState();
  }

  onOutputsChanged(count: number) {
    this.sampleCount = count;
    this.saveState();
  }

  onLyriaModelChange(value: string) {
    this.lyriaModel = value;
    if (!this.lyriaSupportsSeed) {
      this.seed = undefined;
    }
    if (this.referenceImages.length > this.lyriaMaxReferenceImages) {
      this.referenceImages = this.referenceImages.slice(
        0,
        this.lyriaMaxReferenceImages,
      );
    }
    this.saveState();
  }

  openImageSelector() {
    const maxRefs = this.lyriaMaxReferenceImages;
    const remainingSlots = maxRefs - this.referenceImages.length;

    if (remainingSlots <= 0) {
      handleInfoSnackbar(
        this.snackBar,
        `You can only add up to ${maxRefs} reference images for this model.`,
      );
      return;
    }

    const dialogRef = this.dialog.open(ImageSelectorComponent, {
      width: '90vw',
      height: '80vh',
      maxWidth: '90vw',
      data: {
        mimeType: 'image/*',
        assetType: AssetTypeEnum.GENERIC_IMAGE,
        multiSelect: true,
        maxSelection: remainingSlots,
      },
      panelClass: 'image-selector-dialog',
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (!result) return;
      const results = Array.isArray(result) ? result : [result];
      results.forEach(res => this.processReferenceInput(res));
    });
  }

  onReferenceImageDrop(event: DragEvent) {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const maxRefs = this.lyriaMaxReferenceImages;
    let availableSlots = maxRefs - this.referenceImages.length;
    if (availableSlots <= 0) {
      handleInfoSnackbar(
        this.snackBar,
        `You can only add up to ${maxRefs} reference images for this model.`,
      );
      return;
    }

    for (let i = 0; i < files.length && availableSlots > 0; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        availableSlots--;
        this.sourceAssetService
          .uploadAsset(file, {assetType: AssetTypeEnum.GENERIC_IMAGE})
          .subscribe({
            next: (asset: SourceAssetResponseDto) => {
              if (asset && asset.id) {
                this.processReferenceInput(asset);
              }
            },
            error: err => {
              handleErrorSnackbar(this.snackBar, err, 'Upload reference image');
            },
          });
      }
    }
  }

  clearReferenceImage(index: number, event: Event) {
    event.stopPropagation();
    if (index >= 0 && index < this.referenceImages.length) {
      this.referenceImages.splice(index, 1);
    }
  }

  private processReferenceInput(
    result: MediaItemSelection | SourceAssetResponseDto,
  ) {
    if (this.referenceImages.length >= this.lyriaMaxReferenceImages) {
      return;
    }

    const isGalleryImage = !('gcsUri' in result);
    let previewUrl: string | null = null;
    let sourceAssetId: number | undefined;
    let sourceMediaItem: SourceMediaItemLink | undefined;

    if (isGalleryImage) {
      const selection = result as MediaItemSelection;
      previewUrl =
        selection.mediaItem.presignedUrls?.[selection.selectedIndex || 0] ||
        null;
      sourceMediaItem = {
        mediaItemId: selection.mediaItem.id,
        mediaIndex: selection.selectedIndex,
        role: 'input',
      };
    } else {
      const asset = result as SourceAssetResponseDto;
      previewUrl = asset.presignedUrl || null;
      sourceAssetId = asset.id;
    }

    if (!previewUrl) return;

    const isDuplicate = this.referenceImages.some(img => {
      if (sourceAssetId && img.sourceAssetId === sourceAssetId) return true;
      if (
        sourceMediaItem &&
        img.sourceMediaItem &&
        img.sourceMediaItem.mediaItemId === sourceMediaItem.mediaItemId &&
        img.sourceMediaItem.mediaIndex === sourceMediaItem.mediaIndex
      ) {
        return true;
      }
      return false;
    });

    if (isDuplicate) {
      handleInfoSnackbar(this.snackBar, 'This image is already selected.');
      return;
    }

    this.referenceImages.push({
      previewUrl,
      sourceAssetId,
      sourceMediaItem,
    });
  }

  onVoiceSelectionChange(value: string) {
    if (value === 'add-new-voice') {
      this.openAddVoiceDialog();
      return;
    }
    this.selectedVoice = value;
    this.saveState();
  }

  openAddVoiceDialog() {
    const dialogRef = this.dialog.open(AddVoiceDialogComponent, {
      width: '500px',
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        const newVoice: VoiceOption = {
          id: `custom-${Date.now()}`, // In real app, this ID comes from backend
          name: result.name,
          type: 'custom',
        };
        this.voices = [newVoice, ...this.voices];
        this.selectedVoice = newVoice.id;
        this.saveState();
        handleSuccessSnackbar(this.snackBar, 'Voice cloned successfully!');
      }
    });
  }

  generate() {
    if (!this.prompt.trim()) {
      handleInfoSnackbar(
        this.snackBar,
        'Please enter a prompt to generate audio.',
      );
      return;
    }

    this.isLoading = true;

    const activeWorkspaceId = this.workspaceStateService.getActiveWorkspaceId();
    if (!activeWorkspaceId) {
      this.isLoading = false;
      handleErrorSnackbar(
        this.snackBar,
        {message: 'Please select a workspace first.'},
        'Workspace',
      );
      return;
    }

    // 1. Determine specific backend model based on UI selection
    let backendModel: GenerationModelEnum;

    if (this.selectedModel === 'lyria') {
      backendModel = this.lyriaModel as GenerationModelEnum;
    } else if (this.selectedModel === 'chirp') {
      backendModel = GenerationModelEnum.CHIRP_3;
    } else {
      backendModel = (this.ttsModel ||
        GenerationModelEnum.GEMINI_2_5_FLASH_TTS) as GenerationModelEnum;
    }

    const sourceAssetIds: number[] = [];
    const sourceMediaItems: SourceMediaItemLink[] = [];
    if (this.selectedModel === 'lyria' && this.lyriaMaxReferenceImages > 0) {
      this.referenceImages.forEach(img => {
        if (img.sourceMediaItem) {
          sourceMediaItems.push(img.sourceMediaItem);
        } else if (img.sourceAssetId) {
          sourceAssetIds.push(img.sourceAssetId);
        }
      });
    }

    // 2. Construct the generic DTO
    const request: CreateAudioDto = {
      model: backendModel,
      prompt: this.prompt,
      workspaceId: activeWorkspaceId,
      // Optional fields (backend ignores them if not relevant to the specific model)
      negativePrompt:
        this.selectedModel === 'lyria' ? this.negativePrompt : undefined,
      seed:
        this.selectedModel === 'lyria' &&
        this.lyriaSupportsSeed &&
        this.seed !== null &&
        this.seed !== undefined
          ? this.seed
          : undefined,
      sampleCount: this.sampleCount,
      enhancePrompt:
        this.selectedModel === 'lyria' ? this.enhancePrompt : false,
      sourceAssetIds: sourceAssetIds.length ? sourceAssetIds : undefined,
      sourceMediaItems: sourceMediaItems.length ? sourceMediaItems : undefined,
      languageCode:
        this.selectedModel !== 'lyria'
          ? (this.selectedLanguage as LanguageEnum)
          : undefined,
      voiceName:
        this.selectedModel !== 'lyria'
          ? (this.selectedVoice as VoiceEnum)
          : undefined,
    };

    this.saveState();

    this.searchService
      .startAudioGeneration(request)
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        error: (error: any) => {
          handleErrorSnackbar(this.snackBar, error, 'Generation');
          console.error('Generation failed:', error);
        },
      });
  }

  rewritePrompt() {
    if (
      this.selectedModel !== 'lyria' ||
      !this.prompt.trim() ||
      this.isLoading
    ) {
      return;
    }

    const promptToSend = this.prompt.trim();
    if (promptToSend.length < 2) {
      handleInfoSnackbar(
        this.snackBar,
        'Please enter at least 2 characters to rewrite.',
      );
      return;
    }

    this.isLoading = true;
    this.prompt = '';
    this.searchService
      .rewritePrompt({
        targetType: 'audio',
        userPrompt: promptToSend,
      })
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (response: {prompt: string}) => {
          this.prompt = response.prompt;
          this.saveState();
        },
        error: error => {
          this.prompt = promptToSend;
          handleErrorSnackbar(this.snackBar, error, 'Rewrite prompt');
        },
      });
  }

  // --- Result Lightbox Actions ---
  closeErrorOverlay() {
    this.showErrorOverlay = false;
    this.searchService.clearActiveAudioJob();
  }

  handleEditWithOmni(event: {
    mediaItem: MediaItem;
    selectedIndex: number;
  }): void {
    const item = event.mediaItem;
    if (!item?.id) return;

    const index = event.selectedIndex ?? 0;
    const remixState = {
      parentMediaItemId: item.id,
      parentMediaIndex: index,
      generationModel: 'gemini-omni',
      isOmniMode: true,
      referenceAudio: {
        id: item.id,
        type:
          ((item as unknown as {itemType?: string}).itemType as
            | 'media_item'
            | 'source_asset') || 'media_item',
        index,
        name: item.titles?.[index] || item.titles?.[0] || 'Audio Reference',
      },
    };

    void this.router.navigate(['/video'], {state: {remixState}});
  }

  deleteGeneratedMedia() {
    this.activeAudioJob$.pipe(first()).subscribe(job => {
      if (!job?.id) return;

      const workspaceId = this.workspaceStateService.getActiveWorkspaceId();
      if (workspaceId === null) return;

      const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
        data: {
          title: 'Delete Audio',
          message: 'Are you sure you want to delete this generation result?',
        },
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          this.galleryService
            .bulkDelete([{id: job.id, type: 'media_item'}], workspaceId)
            .subscribe({
              next: () => {
                handleSuccessSnackbar(
                  this.snackBar,
                  'Audio deleted successfully',
                );
                this.searchService.clearActiveAudioJob();
              },
              error: err => {
                handleErrorSnackbar(this.snackBar, err, 'Delete result');
              },
            });
        }
      });
    });
  }
}
