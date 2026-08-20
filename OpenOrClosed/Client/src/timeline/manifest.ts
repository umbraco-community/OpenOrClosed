export const manifests: Array<UmbExtensionManifest> = [
    {
        type: 'modal',
        alias: 'OpenOrClosed.Modal.Range',
        name: 'Open Or Closed Range Modal',
        element: () => import('./ooc-range-modal.element.js'),
    },
];
