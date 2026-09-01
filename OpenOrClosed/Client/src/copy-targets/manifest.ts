export const manifests: Array<UmbExtensionManifest> = [
    {
        type: 'modal',
        alias: 'OpenOrClosed.Modal.CopyTargets',
        name: 'Open Or Closed Copy Targets Modal',
        element: () => import('./ooc-copy-targets-modal.element.js'),
    },
];
