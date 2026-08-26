import { oocClipboardManifests } from './manifest-factory.js';
import {
    OOC_SPECIAL_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE,
    OOC_STANDARD_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE,
    OOC_WEEKLY_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE,
} from './constants.js';

/**
 * Clipboard registration for all four editors lives here rather than in each editor's own
 * `manifest.ts`, because the factory imports Umbraco condition aliases at *runtime* and the
 * property package it pulls in touches `document` while it loads. Node tests import the editor
 * manifest modules directly - `localization/en.test.ts` does - so a runtime backoffice import
 * there breaks them. Nothing imports this file except the bundle.
 */
export const manifests: Array<UmbExtensionManifest> = [
    ...oocClipboardManifests({
        editorName: 'Standard Business Hours',
        aliasSegment: 'StandardHours',
        propertyEditorUiAlias: 'OpenOrClosed.PropertyEditorUi.StandardHours',
        entryValueType: OOC_STANDARD_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE,
        pasteTranslatorApi: () => import('../standard-hours/clipboard/paste.translator.js'),
    }),
    ...oocClipboardManifests({
        editorName: 'Special Business Hours',
        aliasSegment: 'SpecialHours',
        propertyEditorUiAlias: 'OpenOrClosed.PropertyEditorUi.SpecialHours',
        entryValueType: OOC_SPECIAL_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE,
        pasteTranslatorApi: () => import('../special-hours/clipboard/paste.translator.js'),
    }),
    ...oocClipboardManifests({
        editorName: 'Weekly Hours',
        aliasSegment: 'WeeklyHours',
        propertyEditorUiAlias: 'OpenOrClosed.PropertyEditorUi.WeeklyHours',
        entryValueType: OOC_WEEKLY_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE,
        pasteTranslatorApi: () => import('../weekly-hours/clipboard/paste.translator.js'),
    }),
];
