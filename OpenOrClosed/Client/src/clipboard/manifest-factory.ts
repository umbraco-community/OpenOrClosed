import {
    UMB_PROPERTY_HAS_VALUE_CONDITION_ALIAS,
    UMB_WRITABLE_PROPERTY_CONDITION_ALIAS,
} from '@umbraco-cms/backoffice/property';
import type { ManifestClipboardPastePropertyValueTranslator } from '@umbraco-cms/backoffice/clipboard';

export interface OocClipboardManifestArgs {
    /** Human-readable editor name, for the manifest `name` fields only. */
    editorName: string;
    /** PascalCase segment that builds the manifest aliases, e.g. `StandardHours`. */
    aliasSegment: string;
    propertyEditorUiAlias: string;
    entryValueType: string;
    /**
     * The editor's own paste translator loader. Typed as the manifest's `api` field rather than a
     * bare `() => Promise<unknown>`, so a module that forgets its `api` export fails here rather
     * than at runtime in the backoffice.
     */
    pasteTranslatorApi: ManifestClipboardPastePropertyValueTranslator['api'];
}

/**
 * The five manifests that opt one property editor into Umbraco's property clipboard, matching what
 * core's Block List registers. All four OpenOrClosed editors need exactly this set, differing only
 * in their aliases and entry value type.
 *
 * The copy translator is shared by every editor; the paste translator is per editor, because each
 * sanitises its own shape.
 */
export function oocClipboardManifests(args: OocClipboardManifestArgs): Array<UmbExtensionManifest> {
    const forPropertyEditorUis = [args.propertyEditorUiAlias];

    return [
        {
            type: 'propertyContext',
            kind: 'clipboard',
            alias: `OpenOrClosed.PropertyContext.${args.aliasSegment}.Clipboard`,
            name: `${args.editorName} Clipboard Property Context`,
            forPropertyEditorUis,
        },
        {
            type: 'propertyAction',
            kind: 'copyToClipboard',
            alias: `OpenOrClosed.PropertyAction.${args.aliasSegment}.Clipboard.Copy`,
            name: `${args.editorName} Copy To Clipboard Property Action`,
            forPropertyEditorUis,
            conditions: [{ alias: UMB_PROPERTY_HAS_VALUE_CONDITION_ALIAS }],
        },
        {
            type: 'propertyAction',
            kind: 'pasteFromClipboard',
            alias: `OpenOrClosed.PropertyAction.${args.aliasSegment}.Clipboard.Paste`,
            name: `${args.editorName} Paste From Clipboard Property Action`,
            forPropertyEditorUis,
            conditions: [{ alias: UMB_WRITABLE_PROPERTY_CONDITION_ALIAS }],
        },
        {
            type: 'clipboardCopyPropertyValueTranslator',
            alias: `OpenOrClosed.ClipboardCopyPropertyValueTranslator.${args.aliasSegment}`,
            name: `${args.editorName} Clipboard Copy Property Value Translator`,
            api: () => import('./hours-copy.translator.js'),
            fromPropertyEditorUi: args.propertyEditorUiAlias,
            toClipboardEntryValueType: args.entryValueType,
        },
        {
            type: 'clipboardPastePropertyValueTranslator',
            alias: `OpenOrClosed.ClipboardPastePropertyValueTranslator.${args.aliasSegment}`,
            name: `${args.editorName} Clipboard Paste Property Value Translator`,
            api: args.pasteTranslatorApi,
            fromClipboardEntryValueType: args.entryValueType,
            toPropertyEditorUi: args.propertyEditorUiAlias,
        },
    ];
}
