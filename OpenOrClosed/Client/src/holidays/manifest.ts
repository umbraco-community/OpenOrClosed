export const manifests: Array<UmbExtensionManifest> = [
    {
        type: 'propertyEditorUi',
        alias: 'OpenOrClosed.PropertyEditorUi.Holidays',
        name: 'Holidays Property Editor UI',
        element: () => import('./ooc-holidays.element.js'),
        meta: {
            label: '#openOrClosed_holidaysLabel',
            icon: 'icon-calendar',
            group: 'richContent',
            propertyEditorSchemaAlias: 'OpenOrClosed.Holidays',
            settings: {
                properties: [
                    {
                        alias: 'removeExpiredHolidays',
                        label: '#openOrClosed_settingRemoveExpired',
                        description: '{#openOrClosed_settingRemoveExpiredDescription}',
                        propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
                    },
                    {
                        alias: 'time_24hr',
                        label: '#openOrClosed_settingTimeFormat',
                        description: '{#openOrClosed_settingTimeFormatDescription}',
                        propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
                    },
                    {
                        alias: 'showAppointmentOnly',
                        label: '#openOrClosed_settingAppointmentOnly',
                        description: '{#openOrClosed_settingAppointmentOnlyDescription}',
                        propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
                    },
                ],
                defaultData: [
                    { alias: 'removeExpiredHolidays', value: true },
                    { alias: 'time_24hr', value: true },
                    { alias: 'showAppointmentOnly', value: false },
                ],
            },
        },
    },
    {
        type: 'modal',
        alias: 'OpenOrClosed.Modal.Holiday',
        name: 'Open Or Closed Holiday Modal',
        element: () => import('./ooc-holiday-modal.element.js'),
    },
];
