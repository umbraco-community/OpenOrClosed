export const manifests: Array<UmbExtensionManifest> = [
    {
        type: 'propertyEditorUi',
        alias: 'OpenOrClosed.PropertyEditorUi.PresetHours',
        name: 'Preset Hours Property Editor UI',
        element: () => import('./ooc-preset-hours.element.js'),
        meta: {
            label: '#openOrClosed_presetHoursLabel',
            icon: 'icon-time',
            group: 'common',
        },
    },
];
