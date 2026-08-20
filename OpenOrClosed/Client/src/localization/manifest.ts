export const manifests: Array<UmbExtensionManifest> = [
    {
        type: 'localization',
        alias: 'OpenOrClosed.Localization.En',
        name: 'Open Or Closed English',
        meta: { culture: 'en' },
        js: () => import('./en.js'),
    },
];
