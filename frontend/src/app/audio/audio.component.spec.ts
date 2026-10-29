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
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatSelectModule} from '@angular/material/select';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {NoopAnimationsModule} from '@angular/platform-browser/animations';
import {provideHttpClient} from '@angular/common/http';
import {provideHttpClientTesting} from '@angular/common/http/testing';
import {CUSTOM_ELEMENTS_SCHEMA} from '@angular/core';
import {of} from 'rxjs';

import {AudioComponent} from './audio.component';
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
  let searchServiceSpy: jasmine.SpyObj<SearchService>;
  let sourceAssetServiceSpy: jasmine.SpyObj<SourceAssetService>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;

  beforeEach(async () => {
    searchServiceSpy = jasmine.createSpyObj(
      'SearchService',
      ['startAudioGeneration', 'clearActiveAudioJob'],
      {activeAudioJob$: of(null)},
    );
    searchServiceSpy.startAudioGeneration.and.returnValue(of({} as any));

    sourceAssetServiceSpy = jasmine.createSpyObj('SourceAssetService', [
      'uploadAsset',
    ]);
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);

    await TestBed.configureTestingModule({
      declarations: [AudioComponent],
      imports: [
        ReactiveFormsModule,
        FormsModule,
        MatDialogModule,
        MatSnackBarModule,
        MatButtonModule,
        MatIconModule,
        MatTooltipModule,
        MatSelectModule,
        MatFormFieldModule,
        MatInputModule,
        NoopAnimationsModule,
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
          useValue: {bulkDelete: () => of({})},
        },
        {provide: SourceAssetService, useValue: sourceAssetServiceSpy},
        {provide: MatDialog, useValue: dialogSpy},
        {
          provide: MatSnackBar,
          useValue: jasmine.createSpyObj('MatSnackBar', ['openFromComponent']),
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
});
