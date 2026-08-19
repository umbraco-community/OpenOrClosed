export const manifests: Array<UmbExtensionManifest> = [
    {
        type: 'propertyEditorUi',
        alias: 'OpenOrClosed.PropertyEditorUi.Holidays',
        name: 'Holidays Property Editor UI',
        element: () => import('./ooc-holidays.element.js'),
        meta: {
            label: 'Holidays',
            icon: 'icon-calendar',
            group: 'richContent',
            propertyEditorSchemaAlias: 'OpenOrClosed.Holidays',
            settings: {
                properties: [
                    {
                        alias: 'removeExpiredHolidays',
                        label: 'Remove Expired Holidays?',
                        description:
                            'Hide finished holidays from the converted value and the Delivery API. They stay visible in this editor so a mistyped date can still be corrected.',
                        propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
                    },
                    {
                        alias: 'time_24hr',
                        label: 'Time Format',
                        description: '12/24 hour clock',
                        propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
                    },
                    {
                        alias: 'showAppointmentOnly',
                        label: 'Enable Appointment Only?',
                        description: 'Show the appointment only option for a set of hours',
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
