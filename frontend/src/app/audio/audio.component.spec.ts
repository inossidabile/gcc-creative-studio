/**
 * Copyright 2026 Google LLC
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

import {ComponentFixture, TestBed} from '@angular/core/testing';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {MatDialog, MatDialogModule} from '@angular/material/dialog';
import {MatSnackBar, MatSnackBarModule} from '@angular/material/snack-bar';
import {MatButtonModule} from '@angular/material/button';
import {MatChipInputEvent, MatChipsModule} from '@angular/material/chips';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatSelectModule} from '@angular/material/select';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {NoopAnimationsModule} from '@angular/platform-browser/animations';
import {provideHttpClient} from '@angular/common/http';
import {provideHttpClientTesting} from '@angular/common/http/testing';
import {MatIconTestingModule} from '@angular/material/icon/testing';
import {By} from '@angular/platform-browser';
import {CUSTOM_ELEMENTS_SCHEMA} from '@angular/core';
import {Router} from '@angular/router';
import {BehaviorSubject, of, throwError} from 'rxjs';

import {AudioComponent} from './audio.component';
import {LanguageEnum, VoiceEnum} from './audio.constants';
import {FlowPromptBoxComponent} from '../common/components/flow-prompt-box/flow-prompt-box.component';
import {ConfirmationDialogComponent} from '../common/components/confirmation-dialog/confirmation-dialog.component';
import {JobStatus, MediaItem} from '../common/models/media-item.model';
import {MODEL_CONFIGS} from '../common/config/model-config';
import {SearchService} from '../services/search/search.service';
import {WorkspaceStateService} from '../services/workspace/workspace-state.service';
import {
  AudioStateService,
  DEFAULT_LYRIA_MODEL,
} from '../services/audio-state.service';
import {GalleryService} from '../gallery/gallery.service';
import {SourceAssetService} from '../common/services/source-asset.service';
import {GenerationModelEnum} from '../services/audio/audio.service';

describe('AudioComponent', () => {
  let component: AudioComponent;
  let fixture: ComponentFixture<AudioComponent>;
  let activeAudioJobSubject: BehaviorSubject<MediaItem | null>;
  let searchServiceSpy: jasmine.SpyObj<SearchService>;
  let galleryServiceSpy: jasmine.SpyObj<GalleryService>;
  let sourceAssetServiceSpy: jasmine.SpyObj<SourceAssetService>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    activeAudioJobSubject = new BehaviorSubject<MediaItem | null>(null);
    searchServiceSpy = jasmine.createSpyObj(
      'SearchService',
      ['startAudioGeneration', 'clearActiveAudioJob', 'rewritePrompt'],
      {activeAudioJob$: activeAudioJobSubject.asObservable()},
    );
    searchServiceSpy.startAudioGeneration.and.returnValue(of({} as any));
    searchServiceSpy.rewritePrompt.and.returnValue(
      of({prompt: 'Rewritten music prompt'}),
    );

    galleryServiceSpy = jasmine.createSpyObj('GalleryService', ['bulkDelete']);
    galleryServiceSpy.bulkDelete.and.returnValue(of({} as any));

    sourceAssetServiceSpy = jasmine.createSpyObj('SourceAssetService', [
      'uploadAsset',
    ]);
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    routerSpy.navigate.and.returnValue(Promise.resolve(true));

    await TestBed.configureTestingModule({
      declarations: [AudioComponent],
      imports: [
        ReactiveFormsModule,
        FormsModule,
        MatDialogModule,
        MatSnackBarModule,
        MatButtonModule,
        MatChipsModule,
        MatIconModule,
        MatIconTestingModule,
        MatMenuModule,
        MatTooltipModule,
        MatSelectModule,
        MatSlideToggleModule,
        MatFormFieldModule,
        MatInputModule,
        NoopAnimationsModule,
        FlowPromptBoxComponent,
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {provide: SearchService, useValue: searchServiceSpy},
        {
          provide: WorkspaceStateService,
          useValue: {getActiveWorkspaceId: () => 1},
        },
        {
          provide: AudioStateService,
          useValue: {
            getState: () => ({
              model: 'lyria',
              lyriaModel: DEFAULT_LYRIA_MODEL,
              prompt: '',
              negativePrompt: '',
              sampleCount: 1,
              selectedLanguage: 'en-US',
              selectedVoice: 'Puck',
            }),
            updateState: jasmine.createSpy('updateState'),
          },
        },
        {
          provide: GalleryService,
          useValue: galleryServiceSpy,
        },
        {provide: SourceAssetService, useValue: sourceAssetServiceSpy},
        {provide: MatDialog, useValue: dialogSpy},
        {provide: Router, useValue: routerSpy},
        {
          provide: MatSnackBar,
          useValue: jasmine.createSpyObj('MatSnackBar', [
            'open',
            'openFromComponent',
          ]),
        },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(AudioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with Lyria 3 supporting up to 10 reference images', () => {
    expect(component).toBeTruthy();
    expect(component.lyriaModel).toBe('lyria-3-clip-preview');
    expect(component.lyriaMaxReferenceImages).toBe(10);
  });

  it('should render FlowPromptBoxComponent with Rewrite enabled for Music and hidden for Text to Speech', () => {
    const flowBoxDebug = fixture.debugElement.query(
      By.directive(FlowPromptBoxComponent),
    );
    expect(flowBoxDebug).toBeTruthy();
    const flowBox = flowBoxDebug.componentInstance as FlowPromptBoxComponent;
    expect(flowBox.mode).toBe('Music');
    expect(flowBox.hasAspectRatioOptions()).toBeFalse();
    expect(flowBox.showRewrite).toBeTrue();

    component.onModeChanged('Text to Speech');
    fixture.detectChanges();
    expect(flowBox.showRewrite).toBeFalse();
  });

  it('should clear reference images when switching from Lyria 3 to Lyria 2', () => {
    component.referenceImages = [
      {previewUrl: 'https://example.com/1.png', sourceAssetId: 10},
      {
        previewUrl: 'https://example.com/2.png',
        sourceMediaItem: {mediaItemId: 20, mediaIndex: 0, role: 'input'},
      },
    ];

    component.onLyriaModelChange('lyria-002');

    expect(component.lyriaMaxReferenceImages).toBe(0);
    expect(component.referenceImages.length).toBe(0);
  });

  it('should switch between Music and Text to Speech modes and select concrete TTS models', () => {
    component.onModeChanged('Text to Speech');
    fixture.detectChanges();

    expect(component.currentAudioMode()).toBe('Text to Speech');
    expect(component.selectedModel).toBe('gemini-tts');

    const gemini31Tts = MODEL_CONFIGS.find(
      m => m.value === 'gemini-3.1-flash-tts-preview',
    )!;
    component.onAudioModelSelected(gemini31Tts);
    component.onPromptChanged('Hello from Creative Studio');
    component.onOutputsChanged(2);
    component.generate();

    expect(searchServiceSpy.startAudioGeneration).toHaveBeenCalledWith(
      jasmine.objectContaining({
        model: GenerationModelEnum.GEMINI_3_1_FLASH_TTS_PREVIEW,
        prompt: 'Hello from Creative Studio',
        sampleCount: 2,
        languageCode: 'en-US' as any,
        voiceName: 'Puck' as any,
      }),
    );

    const chirpConfig = MODEL_CONFIGS.find(m => m.value === 'chirp_3')!;
    component.onAudioModelSelected(chirpConfig);
    expect(component.selectedModel).toBe('chirp');
    expect(component.selectedGenerationModelName()).toBe('Chirp');
  });

  it('should render Home/Video-style hero container and circular control-options buttons per mode without Seed FAB', () => {
    expect(fixture.debugElement.query(By.css('.home-margin'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('.video-container'))).toBeTruthy();

    let fabButtons = fixture.debugElement.queryAll(
      By.css('.control-options button[mat-fab]'),
    );
    expect(fabButtons.length).toBe(1);

    component.addNegativePhrase({
      value: 'vocals',
      chipInput: {clear: jasmine.createSpy('clear')},
    } as unknown as MatChipInputEvent);
    component.addNegativePhrase({
      value: 'drums',
      chipInput: {clear: jasmine.createSpy('clear')},
    } as unknown as MatChipInputEvent);
    expect(component.negativePrompt).toBe('vocals, drums');

    component.removeNegativePhrase('vocals');
    expect(component.negativePrompt).toBe('drums');

    component.onModeChanged('Text to Speech');
    component.selectLanguage(LanguageEnum.FR_FR);
    component.selectVoice(VoiceEnum.AOEDE);
    fixture.detectChanges();

    fabButtons = fixture.debugElement.queryAll(
      By.css('.control-options button[mat-fab]'),
    );
    expect(fabButtons.length).toBe(3);
    expect(component.selectedLanguageName()).toBe('French (France)');
    expect(component.selectedVoiceLabel()).toBe('Aoede');
  });

  it('should expose Seed inside FlowPromptBox settings only when Lyria 2 is selected', () => {
    const flowBox = fixture.debugElement.query(
      By.directive(FlowPromptBoxComponent),
    ).componentInstance as FlowPromptBoxComponent;

    flowBox.isSettingsMenuOpen.set(true);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('#lyria-seed-input'))).toBeNull();

    component.onLyriaModelChange('lyria-002');
    fixture.detectChanges();

    const seedInput = fixture.debugElement.query(By.css('#lyria-seed-input'));
    expect(seedInput).toBeTruthy();

    component.seed = 0;
    component.prompt = 'Deterministic beat';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('#0');

    component.generate();
    expect(searchServiceSpy.startAudioGeneration).toHaveBeenCalledWith(
      jasmine.objectContaining({
        model: GenerationModelEnum.LYRIA_002,
        seed: 0,
      }),
    );

    component.clearSeed();
    fixture.detectChanges();
    expect(component.seed).toBeUndefined();
    expect(fixture.nativeElement.textContent).not.toContain('#0');
  });

  it('should add uploaded and gallery reference images and reject duplicates', () => {
    dialogSpy.open.and.returnValue({
      afterClosed: () =>
        of([
          {
            id: 42,
            gcsUri: 'gs://bucket/a.png',
            presignedUrl: 'https://signed/a.png',
          },
          {
            id: 42,
            gcsUri: 'gs://bucket/a.png',
            presignedUrl: 'https://signed/a.png',
          },
          {
            mediaItem: {id: 99, presignedUrls: ['https://signed/m0.png']},
            selectedIndex: 0,
          },
        ]),
    } as any);

    component.openImageSelector();

    expect(component.referenceImages.length).toBe(2);
    expect(component.referenceImages[0].sourceAssetId).toBe(42);
    expect(component.referenceImages[1].sourceMediaItem).toEqual({
      mediaItemId: 99,
      mediaIndex: 0,
      role: 'input',
    });
  });

  it('should require a non-empty prompt even when reference images are attached', () => {
    component.prompt = '   ';
    component.referenceImages = [
      {previewUrl: 'https://signed/a.png', sourceAssetId: 42},
    ];

    component.generate();

    expect(searchServiceSpy.startAudioGeneration).not.toHaveBeenCalled();
  });

  it('should include sourceAssetIds and sourceMediaItems in Lyria 3 generate request', () => {
    component.selectedModel = 'lyria';
    component.lyriaModel = 'lyria-3-pro-preview';
    component.prompt = 'Ambient synth soundtrack';
    component.referenceImages = [
      {previewUrl: 'https://signed/a.png', sourceAssetId: 42},
      {
        previewUrl: 'https://signed/m0.png',
        sourceMediaItem: {mediaItemId: 99, mediaIndex: 1, role: 'input'},
      },
    ];

    component.generate();

    expect(searchServiceSpy.startAudioGeneration).toHaveBeenCalledWith(
      jasmine.objectContaining({
        model: GenerationModelEnum.LYRIA_3_PRO_PREVIEW,
        prompt: 'Ambient synth soundtrack',
        sourceAssetIds: [42],
        sourceMediaItems: [{mediaItemId: 99, mediaIndex: 1, role: 'input'}],
      }),
    );
  });

  it('should show Enhance Prompt toggle only in Music mode and send enhancePrompt only for Lyria', () => {
    expect(
      fixture.debugElement.query(By.css('.control-options mat-slide-toggle')),
    ).toBeTruthy();

    component.enhancePrompt = true;
    component.prompt = 'lo-fi chillhop beat';
    component.generate();

    expect(searchServiceSpy.startAudioGeneration).toHaveBeenCalledWith(
      jasmine.objectContaining({
        model: GenerationModelEnum.LYRIA_3_CLIP_PREVIEW,
        enhancePrompt: true,
      }),
    );

    component.onModeChanged('Text to Speech');
    fixture.detectChanges();
    expect(
      fixture.debugElement.query(By.css('.control-options mat-slide-toggle')),
    ).toBeNull();

    component.prompt = 'Read this script verbatim.';
    component.generate();

    expect(searchServiceSpy.startAudioGeneration).toHaveBeenCalledWith(
      jasmine.objectContaining({
        enhancePrompt: false,
      }),
    );
  });

  it('should rewrite music prompts via SearchService and restore original prompt on error', () => {
    component.selectedModel = 'lyria';
    component.prompt = 'upbeat jazz';

    component.rewritePrompt();

    expect(searchServiceSpy.rewritePrompt).toHaveBeenCalledWith({
      targetType: 'audio',
      userPrompt: 'upbeat jazz',
    });
    expect(component.prompt).toBe('Rewritten music prompt');
    expect(component.isLoading).toBeFalse();

    // Restore original prompt if rewrite fails
    searchServiceSpy.rewritePrompt.and.returnValue(
      throwError(() => new Error('Gemini unavailable')),
    );
    component.prompt = 'synthwave arpeggio';
    component.rewritePrompt();

    expect(component.prompt).toBe('synthwave arpeggio');
    expect(component.isLoading).toBeFalse();

    // Never rewrite in TTS mode
    searchServiceSpy.rewritePrompt.calls.reset();
    component.onModeChanged('Text to Speech');
    component.prompt = 'Literal spoken voiceover';
    component.rewritePrompt();
    expect(searchServiceSpy.rewritePrompt).not.toHaveBeenCalled();
  });

  it('should confirm and delete the active generated audio job via GalleryService', () => {
    activeAudioJobSubject.next({
      id: 77,
      status: JobStatus.COMPLETED,
      mimeType: 'audio/mpeg',
      prompt: 'Neon synthwave',
      presignedUrls: ['https://signed/77.mp3'],
    } as unknown as MediaItem);
    dialogSpy.open.and.returnValue({
      afterClosed: () => of(true),
    } as any);

    component.deleteGeneratedMedia();

    expect(dialogSpy.open).toHaveBeenCalledWith(ConfirmationDialogComponent, {
      data: {
        title: 'Delete Audio',
        message: 'Are you sure you want to delete this generation result?',
      },
    });
    expect(galleryServiceSpy.bulkDelete).toHaveBeenCalledWith(
      [{id: 77, type: 'media_item'}],
      1,
    );
    expect(searchServiceSpy.clearActiveAudioJob).toHaveBeenCalled();
  });

  it('should navigate to /video in Omni mode with referenceAudio when handleEditWithOmni is triggered', () => {
    const audioItem = {
      id: 88,
      status: JobStatus.COMPLETED,
      mimeType: 'audio/mpeg',
      originalPrompt: 'image!',
      prompt: 'Expanded orchestral prompt',
      presignedUrls: ['https://signed/88-0.mp3', 'https://signed/88-1.mp3'],
    } as unknown as MediaItem;

    component.handleEditWithOmni({mediaItem: audioItem, selectedIndex: 1});

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/video'], {
      state: {
        remixState: {
          parentMediaItemId: 88,
          parentMediaIndex: 1,
          generationModel: 'gemini-omni',
          isOmniMode: true,
          referenceAudio: {
            id: 88,
            type: 'media_item',
            index: 1,
            name: 'Audio Reference',
          },
        },
      },
    });
  });
});
